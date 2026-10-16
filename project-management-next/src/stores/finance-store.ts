'use client'

import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { create } from 'zustand'
import { auth, db } from '@/lib/firebase'
import { ExpenseCategory, AuditActorRef } from '@/lib/types-finance'
import { canAutoApproveOpex } from '@/lib/subcontractor-approval-policy'
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  getDoc, 
  writeBatch, 
  deleteDoc, 
  getDocs, 
  serverTimestamp, 
  orderBy,
  where,
  runTransaction,
} from 'firebase/firestore'
import { toast } from 'sonner'
import { deleteStorageUrls } from '@/lib/storage-helpers'
import { normalizeAccountKey, isNonUsd, COMMITTED_OPEX_STATUSES, LIQUID_ACCOUNTS } from '@/lib/account-keys'
import { transferInvolvesIrd, transferLegAmount, usdToZar } from '@/lib/ird-fx'

export type ExpenseDeleteActor = {
  uid?: string
  displayName?: string
  email?: string
}

export type ExpensePdfActor = {
  uid?: string
  name?: string
  email?: string
}

/** Firestore rejects undefined at any depth; preserve FieldValue sentinels (e.g. serverTimestamp). */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value
  if (value === null || typeof value !== 'object') return value
  if (typeof (value as { _methodName?: string })._methodName === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined) as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === undefined) continue
    const cleaned = stripUndefinedDeep(nested)
    if (cleaned !== undefined) out[key] = cleaned
  }
  return out as T
}

const COMMITTED_STATUSES = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])

function isCommittedExpenseStatus(status: unknown): boolean {
  return COMMITTED_STATUSES.has(String(status || ''))
}

type LedgerHydrationState = {
  expenses: unknown[]
  jobPayments: unknown[]
  transfers: unknown[]
  topUps?: unknown[]
  salariesTransactions: unknown[]
  reserveTransactions: unknown[]
  loanTransactions?: unknown[]
  ledgerHydration?: Record<string, boolean>
  finalBalances: Record<string, number>
}

const LEDGER_STREAMS = ['expenses', 'jobPayments', 'transfers', 'topUps', 'salariesTransactions', 'reserveTransactions', 'loanTransactions'] as const
type LedgerStream = typeof LEDGER_STREAMS[number]
type LedgerHydrationFlags = Record<LedgerStream, boolean>
type LedgerHydrationErrors = Partial<Record<LedgerStream, string>>

const EMPTY_LEDGER_HYDRATION: LedgerHydrationFlags = {
  expenses: false,
  jobPayments: false,
  transfers: false,
  topUps: false,
  salariesTransactions: false,
  reserveTransactions: false,
  loanTransactions: false,
}

const markLedgerHydrated = (stream: LedgerStream) => (state: {
  ledgerHydration: LedgerHydrationFlags
  ledgerHydrationErrors?: LedgerHydrationErrors
}) => ({
  ledgerHydration: { ...state.ledgerHydration, [stream]: true },
  ledgerHydrationErrors: { ...state.ledgerHydrationErrors, [stream]: undefined },
})

const markLedgerFailed = (stream: LedgerStream, error: unknown) => (state: FinanceState) => ({
  ledgerHydration: { ...state.ledgerHydration, [stream]: false },
  ledgerHydrationErrors: {
    ...state.ledgerHydrationErrors,
    [stream]: error instanceof Error ? error.message : String(error || 'Unknown listener error'),
  },
})

export function getFinanceLedgerHydrationIssue(state: LedgerHydrationState & { ledgerHydrationErrors?: LedgerHydrationErrors }): string | null {
  const failed = LEDGER_STREAMS.find((stream) => state.ledgerHydrationErrors?.[stream])
  if (failed) return `Unable to load finance balance source "${failed}": ${state.ledgerHydrationErrors?.[failed]}`
  const pending = LEDGER_STREAMS.filter((stream) => state.ledgerHydration?.[stream] !== true)
  return pending.length ? `Account balances are still loading (${pending.join(', ')}). Wait for finance data and try again.` : null
}

/** True once every cashbook stream used for liquid account balances has hydrated. */
export function isFinanceLedgerLoaded(state: LedgerHydrationState): boolean {
  if (!state.ledgerHydration) return false
  return LEDGER_STREAMS.every((stream) => state.ledgerHydration?.[stream] === true)
}

/**
 * Hard no-overdraft rule for liquid accounts.
 * When requireLedgerLoaded is true and streams are empty, fail closed.
 */
export function assertSufficientFunds(
  accountRaw: unknown,
  amount: number,
  state: LedgerHydrationState,
  opts?: { requireLedgerLoaded?: boolean; context?: string }
): void {
  const account = normalizeAccountKey(accountRaw)
  if (account === 'UNKNOWN') {
    throw new Error(
      `Unrecognized account "${accountRaw ?? ''}". Use Bank, Cash, EcoCash, IRD, Salaries or Reserve.`
    )
  }
  // Credit / Inventory and other non-liquid buckets are not cash overdraft checks.
  if (!LIQUID_ACCOUNTS.includes(account)) return

  const amt = Math.abs(Number(amount || 0))
  if (amt <= 0) return
  if (opts?.requireLedgerLoaded !== false && !isFinanceLedgerLoaded(state)) {
    throw new Error(getFinanceLedgerHydrationIssue(state) || 'Account balances are still loading. Wait for finance data and try again.')
  }

  const current = Number(state.finalBalances[account] || 0)
  if (current < amt) {
    const suffix = opts?.context ? ` ${opts.context}` : ''
    throw new Error(
      `Insufficient funds in ${account}${suffix}. Available: $${current.toFixed(2)}, Required: $${amt.toFixed(2)}`
    )
  }
}

/**
 * Idempotent Reserve wallet debit for a committed OPEX.
 * Reserve finalBalances come ONLY from reserveAccountTransactions — without this
 * PAYMENT row, an OPEX with paymentMethod RESERVE would not reduce the chip.
 */
async function recordReservePaymentForExpense(opts: {
  expenseId: string
  amount: number
  description?: string
  source?: string
}) {
  const expenseId = String(opts.expenseId || '').trim()
  const amount = Math.abs(Number(opts.amount || 0))
  if (!expenseId || amount <= 0) return

  const existing = await getDocs(
    query(
      collection(db, 'reserveAccountTransactions'),
      where('referenceId', '==', expenseId)
    )
  )
  if (existing.docs.some((d) => d.data().type === 'PAYMENT')) return

  await addDoc(collection(db, 'reserveAccountTransactions'), {
    type: 'PAYMENT',
    source: opts.source || 'OPEX',
    amount,
    description: opts.description || 'Reserve payment',
    referenceId: expenseId,
    createdAt: serverTimestamp(),
  })
}

async function removeReservePaymentsForExpense(expenseId: string) {
  const id = String(expenseId || '').trim()
  if (!id) return
  const snap = await getDocs(
    query(
      collection(db, 'reserveAccountTransactions'),
      where('referenceId', '==', id)
    )
  )
  const payments = snap.docs.filter((d) => d.data().type === 'PAYMENT')
  if (!payments.length) return
  const batch = writeBatch(db)
  payments.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

async function maybeRecordReservePaymentFromExpense(
  expenseId: string,
  expense: { paymentMethod?: unknown; amount?: unknown; description?: unknown; title?: unknown; status?: unknown }
) {
  if (!isCommittedExpenseStatus(expense.status)) return
  if (normalizeAccountKey(expense.paymentMethod) !== 'RESERVE') return
  await recordReservePaymentForExpense({
    expenseId,
    amount: Number(expense.amount || 0),
    description: String(expense.description || expense.title || 'Reserve payment'),
    source: 'OPEX',
  })
}

export interface LedgerAnomalies {
  /** Committed entries whose payment method didn't normalize to a canonical account. */
  unknownAccountCount: number
  unknownAccountTotal: number
  /** Committed expenses in a non-USD currency, excluded from balances. */
  nonUsdCount: number
  /** Legacy fundTransfers docs with no status field, excluded from balances. */
  legacyTransferCount: number
}

interface FinanceState {
  expenses: any[]
  transfers: any[]
  jobPayments: any[]
  ledger: any[]
  topUps: any[]
  salariesTransactions: any[]
  reserveTransactions: any[]
  loanLenders: any[]
  loanTransactions: any[]
  loanLiability: number
  finalBalances: Record<string, number>
  ledgerHydration: LedgerHydrationFlags
  ledgerHydrationErrors: LedgerHydrationErrors
  ledgerAnomalies: LedgerAnomalies
  historicalInventoryCost: number
  loading: boolean
  error: string | null

  LIQUID_ACCOUNTS: string[]
  
  subscriptions: (() => void)[]

  fetchExpenses: () => () => void
  fetchTransfers: () => () => void
  fetchJobPayments: () => () => void
  fetchTopUps: () => () => void
  fetchSalariesTransactions: () => () => void
  fetchReserveTransactions: () => () => void
  fetchLoanLenders: () => () => void
  fetchLoanTransactions: () => () => void
  subscribeLedger: () => () => void
  fetchHistoricalInventoryConsumption: () => Promise<void>
  
  updateLedger: () => void
  fundReserveAccount: (fromAccount: string, amount: number, reference: string) => Promise<void>
  
  recordExpense: (data: any) => Promise<string>
  lockExpensePdf: (id: string, downloadedBy: ExpensePdfActor) => Promise<void>
  unlockExpensePdf: (id: string) => Promise<void>
  approveExpenseByAccountant: (id: string, approvedBy: { name?: string; email?: string; uid?: string }) => Promise<void>
  approveExpenseByManager: (id: string, approvedBy: { name?: string; email?: string; uid?: string }, comment?: string) => Promise<void>
  rejectExpenseByAccountant: (id: string, rejectedBy: { name?: string; email?: string; uid?: string }, comment: string) => Promise<void>
  rejectExpenseByManager: (id: string, rejectedBy: { name?: string; email?: string; uid?: string }, comment: string) => Promise<void>
  processExpensePayment: (id: string, processedBy: { name?: string; email?: string; uid?: string }, paymentData: any) => Promise<void>
  deleteExpense: (id: string, deletedBy?: ExpenseDeleteActor | null) => Promise<void>
  syncAdHocAttachmentsToOpex: (sourceItemId: string, attachmentUrls: string[]) => Promise<void>
  deleteTransfer: (id: string) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  deleteTopUp: (id: string) => Promise<void>
  approveExpense: (id: string) => Promise<void>
  initiateTransfer: (data: any, initiatedBy?: { name?: string; email?: string }, autoApprove?: boolean) => Promise<void>
  accountantInitialTransfer: (id: string, by: { name?: string; email?: string }) => Promise<void>
  approveTransfer: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  rejectTransfer: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  cancelTransfer: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  recordIncome: (data: any) => Promise<void>
  recordTopUp: (data: any) => Promise<void>
  accountantInitialTopUp: (id: string, by: { name?: string; email?: string }) => Promise<void>
  approveTopUp: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  rejectTopUp: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  createLoanLender: (data: { name: string; email?: string; phone?: string; notes?: string }, by?: { name?: string; email?: string }) => Promise<void>
  recordLoanTransaction: (data: any, by?: { name?: string; email?: string }) => Promise<void>
  accountantInitialLoanTransaction: (id: string, by: { name?: string; email?: string }) => Promise<void>
  approveLoanTransaction: (id: string, by?: { name?: string; email?: string }) => Promise<void>
  rejectLoanTransaction: (id: string, by?: { name?: string; email?: string }, reason?: string) => Promise<void>
  cleanup: () => void
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  expenses: [],
  transfers: [],
  jobPayments: [],
  ledger: [],
  topUps: [],
  salariesTransactions: [],
  reserveTransactions: [],
  loanLenders: [],
  loanTransactions: [],
  loanLiability: 0,
  finalBalances: {
    BANK: 0,
    CASH: 0,
    ECOCASH: 0,
    IRD: 0,
    SALARIES: 0,
    RESERVE: 0,
    CREDIT: 0,
    INVENTORY: 0
  },
  ledgerHydration: EMPTY_LEDGER_HYDRATION,
  ledgerHydrationErrors: {},
  ledgerAnomalies: {
    unknownAccountCount: 0,
    unknownAccountTotal: 0,
    nonUsdCount: 0,
    legacyTransferCount: 0,
  },
  historicalInventoryCost: 0,
  loading: false,
  error: null,
  LIQUID_ACCOUNTS: ['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES', 'RESERVE'],
  subscriptions: [],

  fetchExpenses: () => {
    set({ loading: true })
    const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({ ...markLedgerHydrated('expenses')(state), expenses: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Expenses failed:', err)
        const permissionDenied = err?.code === 'permission-denied'
        set((state) => ({
          ...markLedgerFailed('expenses', err)(state),
          error: permissionDenied
            ? 'Missing or insufficient permissions to load expenses. Ensure your account has an active ACCOUNTANT/finance role, then sign out and back in.'
            : (err.message || 'Failed to load expenses'),
          loading: false,
          // Keep expenses empty and do not rebuild the ledger — partial
          // streams (payments without expenses) produce inflated balances.
          expenses: [],
        }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchTransfers: () => {
    set({ loading: true })
    const q = query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({
          ...markLedgerHydrated('transfers')(state),
          transfers: snapshot.docs.map(doc => {
            const data = doc.data()
            return {
              id: doc.id,
              ...data,
              date: data.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString(),
              // Legacy docs without a status must NOT silently count as COMPLETED:
              // they would move balances without ever passing approval.
              status: data.status || 'LEGACY_NO_STATUS'
            }
          }),
          error: null
        }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Transfers failed:', err)
        set((state) => ({ ...markLedgerFailed('transfers', err)(state), error: err.message || 'Failed to load transfers', loading: false }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchJobPayments: () => {
    set({ loading: true })
    const q = query(collection(db, 'jobPayments'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({ ...markLedgerHydrated('jobPayments')(state), jobPayments: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Job Payments failed:', err)
        set((state) => ({ ...markLedgerFailed('jobPayments', err)(state), error: err.message || 'Failed to load job payments', loading: false }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchTopUps: () => {
    set({ loading: true })
    const q = query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({ ...markLedgerHydrated('topUps')(state), topUps: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Top-ups failed:', err)
        set((state) => ({ ...markLedgerFailed('topUps', err)(state), error: err.message || 'Failed to load top-ups', loading: false }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchSalariesTransactions: () => {
    set({ loading: true })
    const q = query(collection(db, 'salariesAccountTransactions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({ ...markLedgerHydrated('salariesTransactions')(state), salariesTransactions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Salaries Transactions failed:', err)
        set((state) => ({ ...markLedgerFailed('salariesTransactions', err)(state), error: err.message || 'Failed to load salaries transactions', loading: false }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchReserveTransactions: () => {
    set({ loading: true })
    const q = query(collection(db, 'reserveAccountTransactions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        set((state) => ({ ...markLedgerHydrated('reserveTransactions')(state), reserveTransactions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), error: null }))
        get().updateLedger()
      },
      (err) => {
        console.error('[FinanceStore] Fetch Reserve Transactions failed:', err)
        set((state) => ({ ...markLedgerFailed('reserveTransactions', err)(state), error: err.message || 'Failed to load reserve transactions', loading: false }))
      }
    )
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchLoanLenders: () => {
    const q = query(collection(db, 'businessLoanLenders'), orderBy('name', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const loanLenders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      set({
        loanLenders,
        loanLiability: loanLenders.reduce((sum, lender: any) => sum + Math.max(0, Number(lender.outstandingPrincipal || 0)), 0),
      })
    }, (err) => set({ error: err.message || 'Failed to load loan lenders' }))
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchLoanTransactions: () => {
    const q = query(collection(db, 'businessLoanTransactions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set((state) => ({ ...markLedgerHydrated('loanTransactions')(state), loanTransactions: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) }))
      get().updateLedger()
    }, (err) => set((state) => ({ ...markLedgerFailed('loanTransactions', err)(state), error: err.message || 'Failed to load loan transactions' })))
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  subscribeLedger: () => {
    const state = get()
    const unsubs = [
      state.fetchExpenses(),
      state.fetchTransfers(),
      state.fetchJobPayments(),
      state.fetchTopUps(),
      state.fetchSalariesTransactions(),
      state.fetchReserveTransactions(),
      state.fetchLoanTransactions(),
    ]
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  },

  fetchHistoricalInventoryConsumption: async () => {
    try {
      const q = query(collection(db, 'jobCards'))
      const snap = await getDocs(q)
      let total = 0
      snap.docs.forEach(doc => {
        const data = doc.data()
        const sections = data.requisitionSections || []
        sections.forEach((s: any) => {
          (s.items || []).forEach((i: any) => {
            if (i.inventoryItemId && i.approvalStatus === 'APPROVED_MANAGER') {
              const qty = Number(i.qtyRequired || i.quantity || 0)
              const price = Number(i.irdSellingPrice || i.unitCost || i.costSnapshot || 0)
              total += qty * price
            }
          })
        })
        const flatItems = data.requisitionItems || []
        flatItems.forEach((i: any) => {
          if (i.inventoryItemId && i.approvalStatus === 'APPROVED_MANAGER') {
            const alreadyInSections = sections.some((s: any) => (s.items || []).some((si: any) => si.id === i.id))
            if (!alreadyInSections) {
              const qty = Number(i.qtyRequired || i.quantity || 0)
              const price = Number(i.irdSellingPrice || i.unitCost || i.costSnapshot || 0)
              total += qty * price
            }
          }
        })
      })
      set({ historicalInventoryCost: total })
    } catch (err) {
      console.error('[FinanceStore] Historical fetch failed:', err)
    }
    get().updateLedger()
  },

  updateLedger: () => {
    const {
      expenses,
      transfers,
      jobPayments,
      topUps,
      salariesTransactions,
      reserveTransactions,
      loanTransactions,
      historicalInventoryCost,
      LIQUID_ACCOUNTS,
    } = get()
    
    const anomalies: LedgerAnomalies = {
      unknownAccountCount: 0,
      unknownAccountTotal: 0,
      nonUsdCount: 0,
      legacyTransferCount: transfers.filter(t => t.status === 'LEGACY_NO_STATUS').length,
    }

    const committedExpenses = expenses.filter(e => (COMMITTED_OPEX_STATUSES as readonly string[]).includes(e.status))
    // Non-USD amounts cannot be summed with USD balances without FX conversion;
    // exclude them and surface a warning instead of silently corrupting totals.
    const usdExpenses = committedExpenses.filter(e => {
      if (isNonUsd(e.currency)) {
        anomalies.nonUsdCount++
        return false
      }
      return true
    })

    const items = [
      ...usdExpenses.map(e => ({
        ...e,
        type: 'EXPENSE',
        amount: -Math.abs(Number(e.amount || 0)),
        account: normalizeAccountKey(e.paymentMethod),
        accountRaw: e.paymentMethod ?? '',
        description: e.description || e.title || e.category || 'Operational Expense',
        date: e.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      })),
      ...transfers.filter(t => t.status === 'COMPLETED').flatMap(t => {
        const fromAcc = normalizeAccountKey(t.fromAccount)
        const toAcc = normalizeAccountKey(t.toAccount)
        const outAmt = transferLegAmount(fromAcc, t)
        const inAmt = transferLegAmount(toAcc, t)
        return [
          {
            ...t,
            id: `${t.id}_out`,
            type: 'TRANSFER',
            amount: -outAmt,
            account: fromAcc,
            accountRaw: t.fromAccount ?? '',
            description: `Transfer to ${toAcc} ${t.reference ? '- ' + t.reference : ''}`,
            date: t.date || new Date().toLocaleDateString()
          },
          {
            ...t,
            id: `${t.id}_in`,
            type: 'TRANSFER',
            amount: inAmt,
            account: toAcc,
            accountRaw: t.toAccount ?? '',
            description: `Transfer from ${fromAcc} ${t.reference ? '- ' + t.reference : ''}`,
            date: t.date || new Date().toLocaleDateString()
          }
        ]
      }),
      ...jobPayments.map(p => ({
        ...p,
        type: 'INCOME',
        amount: Math.abs(Number(p.amount || 0)),
        account: normalizeAccountKey(p.paymentMethod),
        accountRaw: p.paymentMethod ?? '',
        date: p.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      })),
      // Signed amount: positive capital injections credit; negative RECONCILIATION
      // write-downs debit. Do not Math.abs — that would invert write-downs.
      ...topUps.filter(t => t.status === 'COMPLETED').map(t => ({
        ...t,
        type: 'TOPUP',
        amount: Number(t.amount || 0),
        account: normalizeAccountKey(t.account),
        accountRaw: t.account ?? '',
        description: `${t.description || 'Top-up'} [Req: ${t.requestedBy || 'N/A'}]`,
        date: t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      })),
      ...loanTransactions.filter(t => t.status === 'COMPLETED').map(t => ({
        ...t,
        type: t.transactionType === 'REPAYMENT' ? 'LOAN_REPAYMENT' : 'LOAN_RECEIPT',
        amount: (t.transactionType === 'REPAYMENT' ? -1 : 1) * Math.abs(Number(t.amount || 0)),
        account: normalizeAccountKey(t.account),
        accountRaw: t.account ?? '',
        description: `${t.transactionType === 'REPAYMENT' ? 'Loan repayment to' : 'Loan received from'} ${t.lenderName || 'lender'}${t.reference ? ` - ${t.reference}` : ''}`,
        date: t.effectiveDate || t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString(),
      }))
    ]

    for (const item of items) {
      if (item.account === 'UNKNOWN') {
        anomalies.unknownAccountCount++
        anomalies.unknownAccountTotal += Math.abs(Number(item.amount || 0))
      }
    }

    items.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0)
      const dateB = b.createdAt?.toDate?.() || new Date(0)
      return dateA.getTime() - dateB.getTime()
    })

    const accountBalances: Record<string, number> = {
      BANK: 0,
      CASH: 0,
      ECOCASH: 0,
      IRD: 0,
      SALARIES: 0,
      RESERVE: 0,
      CREDIT: 0,
      INVENTORY: -historicalInventoryCost
    }
    const LIQUID_SET = new Set(LIQUID_ACCOUNTS)
    let totalBusinessBalance = 0

    const ledgerWithBalances = items.map(item => {
      const acc = item.account as string
      if (accountBalances[acc] === undefined) {
        accountBalances[acc] = 0
      }

      const amount = item.amount || 0
      accountBalances[acc] += amount

      // IRD is ZAR-native — never mix into the USD business total.
      if (LIQUID_SET.has(acc) && acc !== 'IRD') {
        totalBusinessBalance += amount
      }

      return {
        ...item,
        accountBalance: accountBalances[acc],
        globalBalance: totalBusinessBalance
      }
    })

    // Virtual wallets: available cash = FUNDING/TRANSFER − PAYMENT.
    // Ignore ACCUMULATION (Salaries obligations). Override ledger-derived balances
    // so funding via dedicated dialogs and fund-transfer journals stay consistent.
    const cashFromWalletTxs = (txs: any[]) =>
      txs.reduce((sum, t) => {
        const amt = Number(t.amount || 0)
        if (t.type === 'FUNDING' || t.type === 'TRANSFER') return sum + amt
        if (t.type === 'PAYMENT') return sum - amt
        return sum
      }, 0)

    accountBalances.SALARIES = cashFromWalletTxs(salariesTransactions)
    accountBalances.RESERVE = cashFromWalletTxs(reserveTransactions)

    // Wallet overrides change RESERVE/SALARIES without updating the running total —
    // resync so treasury / "All Entries" matches the sum of liquid chips (USD only).
    totalBusinessBalance = LIQUID_ACCOUNTS.filter((acc) => acc !== 'IRD').reduce(
      (sum, acc) => sum + (accountBalances[acc] || 0),
      0
    )

    set({
      ledger: ledgerWithBalances.reverse(),
      finalBalances: accountBalances,
      ledgerAnomalies: anomalies,
      loading: false
    })
  },

  recordExpense: async (data) => {
    let category = data.category
    const isCanonical = Object.values(ExpenseCategory).includes(category as any)
    if (!isCanonical && category) {
      const rawName = String(category).trim()
      category = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    } else if (!category) {
      category = ExpenseCategory.UNCATEGORIZED
    }

    const normalizeActor = (actor: any, defaultName: string, role: 'ACCOUNTANT' | 'MANAGER', action: string, policy: string): AuditActorRef | null => {
      if (!actor) return null
      if (typeof actor === 'object' && actor.uid) return actor as AuditActorRef
      
      const actorStr = String(actor)
      const isSystem = actorStr.includes('System') || actorStr.includes('Workflow') || actorStr.includes('Engine')
      const ref: AuditActorRef = {
        uid: isSystem ? `system:${role.toLowerCase()}-bypass` : 'legacy-import',
        displayName: actorStr,
        email: isSystem ? 'system@incaptta.internal' : 'user@incaptta.com',
        actorType: isSystem ? 'SYSTEM_ROBOT' : 'USER',
        actionType: isSystem ? (action as AuditActorRef['actionType']) : 'MANUAL_APPROVAL',
        timestamp: new Date().toISOString(),
      }
      if (isSystem) ref.policyRef = policy
      return ref
    }

    let accountantApprovedBy = normalizeActor(
      data.accountantApprovedBy,
      'Accountant',
      'ACCOUNTANT',
      'WORKFLOW_BYPASS_JOBCARD',
      'POLICY-JOBCARD-ADHOC-EXEC'
    )
    let managerApprovedBy = normalizeActor(
      data.managerApprovedBy,
      'Manager',
      'MANAGER',
      'POLICY_BYPASS_UNDER_300',
      'POLICY-OPEX-THRESHOLD-300-USD'
    )

    if ((data.status === 'APPROVED' || data.status === 'APPROVED_FOR_PAYMENT') && data.sourceJobId) {
      if (!accountantApprovedBy) {
        accountantApprovedBy = {
          uid: 'system:workflow-engine',
          displayName: 'Job Card Workflow Engine',
          email: 'system@incaptta.internal',
          actorType: 'SYSTEM_ROBOT',
          actionType: 'WORKFLOW_BYPASS_JOBCARD',
          policyRef: 'POLICY-JOBCARD-ADHOC-EXEC',
          timestamp: new Date().toISOString()
        }
      }
      if (!managerApprovedBy) {
        managerApprovedBy = {
          uid: 'system:jobcard-manager-bypass',
          displayName: 'Manager Job Card Approval',
          email: 'manager@incaptta.internal',
          actorType: 'USER',
          actionType: 'MANUAL_APPROVAL',
          timestamp: new Date().toISOString()
        }
      }
    }

    const sourceItemId =
      typeof data.sourceItemId === 'string' && data.sourceItemId.trim()
        ? data.sourceItemId.trim()
        : ''

    // Idempotent for job-card / SCN lines: never create a second OPEX for the same source item.
    if (sourceItemId) {
      const existingQ = query(
        collection(db, 'operationalExpenses'),
        where('sourceItemId', '==', sourceItemId)
      )
      const existing = await getDocs(existingQ)
      if (!existing.empty) {
        const existingDoc = existing.docs[0]
        await maybeRecordReservePaymentFromExpense(existingDoc.id, {
          ...existingDoc.data(),
          status: existingDoc.data().status || data.status,
        })
        return existingDoc.id
      }
    }

    const status = data.status || 'PENDING_ACCOUNTANT'
    const paymentMethod = data.paymentMethod
    const amount = Number(data.amount || 0)

    if (isCommittedExpenseStatus(status)) {
      assertSufficientFunds(paymentMethod, amount, get())
    }

    const payload = stripUndefinedDeep({
      ...data,
      category,
      accountantApprovedBy,
      managerApprovedBy,
      status,
      pdfGenerated: data.pdfGenerated || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    // Deterministic id closes the race where two concurrent approves both pass the query above.
    if (sourceItemId) {
      const deterministicRef = doc(db, 'operationalExpenses', `jc-adhoc-${sourceItemId}`)
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(deterministicRef)
        if (snap.exists()) return
        transaction.set(deterministicRef, payload)
      })
      await maybeRecordReservePaymentFromExpense(deterministicRef.id, { ...payload, status, paymentMethod, amount })
      return deterministicRef.id
    }

    const docRef = await addDoc(collection(db, 'operationalExpenses'), payload)
    await maybeRecordReservePaymentFromExpense(docRef.id, { ...payload, status, paymentMethod, amount })
    return docRef.id
  },

  lockExpensePdf: async (id, downloadedBy) => {
    const expenseRef = doc(db, 'operationalExpenses', id)
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(expenseRef)
      if (!snapshot.exists()) throw new Error('Expense not found.')
      if (snapshot.data().pdfGenerated === true) {
        throw new Error('This PDF download has already been used.')
      }
      transaction.update(expenseRef, {
        pdfGenerated: true,
        pdfLockedAt: serverTimestamp(),
        pdfDownloadedBy: stripUndefinedDeep({
          uid: downloadedBy.uid,
          name: downloadedBy.name,
          email: downloadedBy.email,
        }),
      })
    })
  },

  unlockExpensePdf: async (id) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      pdfGenerated: false,
      pdfUnlockedAt: serverTimestamp()
    })
  },

  approveExpenseByAccountant: async (id, approvedBy) => {
    const expense = get().expenses.find(e => e.id === id)
    const amount = Number(expense?.amount || 0)
    const isAutoApproved = canAutoApproveOpex(amount, expense || {})

    // Auto-approve commits cash immediately (APPROVED_FOR_PAYMENT).
    if (isAutoApproved) {
      assertSufficientFunds(expense?.paymentMethod, amount, get())
    }
    
    const accountantActor: AuditActorRef = {
      uid: approvedBy.uid || 'unknown-accountant',
      displayName: approvedBy.name || approvedBy.email || 'Accountant',
      email: approvedBy.email || 'accountant@incaptta.internal',
      actorType: 'USER',
      actionType: 'MANUAL_APPROVAL',
      timestamp: new Date().toISOString()
    }

    const updateData: any = {
      status: isAutoApproved ? 'APPROVED_FOR_PAYMENT' : 'APPROVED_ACCOUNTANT',
      accountantApprovedAt: serverTimestamp(),
      accountantApprovedBy: accountantActor,
      updatedAt: serverTimestamp()
    }

    if (isAutoApproved) {
      const systemManagerActor: AuditActorRef = {
        uid: 'system:policy-engine',
        displayName: 'System Auto-Approval Engine',
        email: 'system@incaptta.internal',
        actorType: 'SYSTEM_ROBOT',
        actionType: 'POLICY_BYPASS_UNDER_300',
        policyRef: 'POLICY-OPEX-THRESHOLD-300-USD',
        timestamp: new Date().toISOString()
      }
      updateData.managerApprovedAt = serverTimestamp()
      updateData.managerApprovedBy = systemManagerActor
    }

    await updateDoc(doc(db, 'operationalExpenses', id), updateData)
    if (isAutoApproved) {
      await maybeRecordReservePaymentFromExpense(id, {
        ...expense,
        status: 'APPROVED_FOR_PAYMENT',
        amount,
      })
    }
  },

  approveExpenseByManager: async (id, approvedBy, comment) => {
    const expense = get().expenses.find(e => e.id === id)
    const amount = Number(expense?.amount || 0)
    assertSufficientFunds(expense?.paymentMethod, amount, get())

    const managerActor: AuditActorRef = {
      uid: approvedBy.uid || 'unknown-manager',
      displayName: approvedBy.name || approvedBy.email || 'Manager',
      email: approvedBy.email || 'manager@incaptta.internal',
      actorType: 'USER',
      actionType: 'MANUAL_APPROVAL',
      timestamp: new Date().toISOString()
    }

    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'APPROVED_FOR_PAYMENT',
      managerApprovedAt: serverTimestamp(),
      managerApprovedBy: managerActor,
      updatedAt: serverTimestamp(),
      ...(comment ? { managerComment: comment } : {})
    })
    await maybeRecordReservePaymentFromExpense(id, {
      ...expense,
      status: 'APPROVED_FOR_PAYMENT',
      amount,
    })
  },

  rejectExpenseByAccountant: async (id, rejectedBy, comment) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'REJECTED_ACCOUNTANT',
      accountantRejectedAt: serverTimestamp(),
      accountantRejectedBy: rejectedBy.name || rejectedBy.email || 'Accountant',
      accountantComment: comment,
      updatedAt: serverTimestamp()
    })
    await removeReservePaymentsForExpense(id)
  },

  rejectExpenseByManager: async (id, rejectedBy, comment) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'REJECTED_MANAGER',
      managerRejectedAt: serverTimestamp(),
      managerRejectedBy: rejectedBy.name || rejectedBy.email || 'Manager',
      managerComment: comment,
      updatedAt: serverTimestamp()
    })
    await removeReservePaymentsForExpense(id)
  },

  processExpensePayment: async (id, processedBy, paymentData) => {
    const expenseRef = doc(db, 'operationalExpenses', id)
    const expenseSnap = await getDoc(expenseRef)
    if (!expenseSnap.exists()) {
      throw new Error('Expense document not found')
    }
    const expense = { id: expenseSnap.id, ...expenseSnap.data() } as any

    if (expense.type === 'PAYROLL_SETTLEMENT' || (accrualPayrollEnabled && (expense.payrollId || ['PAYROLL_NET', 'STATUTORY_LIABILITY'].includes(expense.type) || ['Salaries & Wages', 'Statutory Liabilities'].includes(expense.category)))) throw new Error('Use HR payroll settlements; legacy payroll requires reconciliation')

    const amount = Number(expense.amount || 0)
    assertSufficientFunds(paymentData.paymentMethod, amount, get())

    const batch = writeBatch(db)

    batch.update(expenseRef, {
      status: 'PAYMENT_PROCESSED',
      paymentProcessedAt: serverTimestamp(),
      paymentProcessedBy: processedBy.name || processedBy.email || 'Finance',
      paymentDetails: paymentData,
      updatedAt: serverTimestamp()
    })

    if (expense && expense.type === 'PAYROLL_NET' && expense.payrollId) {
      const payrollRef = doc(db, 'payroll', expense.payrollId)
      const payrollSnap = await getDoc(payrollRef)
      if (payrollSnap.exists()) {
        const payrollData = payrollSnap.data()
        batch.update(payrollRef, {
          status: 'Paid',
          paymentMethod: paymentData.paymentMethod,
          updatedAt: serverTimestamp()
        })

        const installments = payrollData.advanceInstallments || {}
        const advanceRows = await Promise.all(Object.keys(installments).map(async (advanceId) => {
          const snap = await getDoc(doc(db, 'salaryAdvances', advanceId))
          return { advanceId, data: snap.exists() ? snap.data() : null }
        }))
        advanceRows.forEach(({ advanceId, data }) => {
          const recoveryAmount = Number(installments[advanceId] || 0)
          if (!data || recoveryAmount <= 0) return
          const outstanding = Math.max(0, Number(data.outstandingBalance || 0) - recoveryAmount)
          batch.update(doc(db, 'salaryAdvances', advanceId), {
            status: outstanding <= 0.001 ? 'SETTLED' : 'ACTIVE',
            outstandingBalance: outstanding,
            recoveredAmount: Number(data.recoveredAmount || 0) + recoveryAmount,
            reservedBalance: Math.max(0, Number(data.reservedBalance || 0) - recoveryAmount),
            updatedAt: serverTimestamp()
          })
          batch.update(doc(db, 'salaryAdvanceRecoveries', `${expense.payrollId}_${advanceId}`), {
            status: 'RECOVERED', balanceAfter: outstanding, recoveredAt: serverTimestamp()
          })
        })

        if (paymentData.paymentMethod.toUpperCase() === 'SALARIES') {
          const salariesTxRef = doc(collection(db, 'salariesAccountTransactions'))
          batch.set(salariesTxRef, {
            type: 'PAYMENT',
            source: 'PAYROLL_NET',
            amount: Number(expense.amount),
            month: payrollData.month,
            year: payrollData.year,
            description: `Salary Payment: ${payrollData.employeeName}`,
            referenceId: expense.payrollId,
            createdAt: serverTimestamp()
          })
        }
      }
    }

    await batch.commit()

    // Idempotent: if already deducted at APPROVED_FOR_PAYMENT, this is a no-op.
    await maybeRecordReservePaymentFromExpense(id, {
      ...expense,
      paymentMethod: paymentData.paymentMethod || expense.paymentMethod,
      status: 'PAYMENT_PROCESSED',
      amount,
    })
  },

  deleteExpense: async (id, deletedBy) => {
    const expenseRef = doc(db, 'operationalExpenses', id)
    const expenseSnap = await getDoc(expenseRef)
    if (!expenseSnap.exists()) return

    const data = expenseSnap.data()
    const attachmentUrls = [
      ...((data.attachmentUrls as string[]) || []),
      ...(data.attachmentUrl ? [String(data.attachmentUrl)] : []),
      ...(data.receiptUrl ? [String(data.receiptUrl)] : []),
    ].filter((u, i, arr) => typeof u === 'string' && u.trim() && arr.indexOf(u) === i)

    await removeReservePaymentsForExpense(id)

    const batch = writeBatch(db)
    if (data.verificationToken) {
      batch.delete(doc(db, 'docVerifications', data.verificationToken))
    }
    batch.delete(expenseRef)
    await batch.commit()

    try {
      await addDoc(collection(db, 'opexAuditLogs'), {
        action: 'OPEX_DELETED',
        opexId: id,
        expenseSnapshot: {
          title: data.title || null,
          description: data.description || null,
          category: data.category || null,
          amount: Number(data.amount || 0),
          paymentMethod: data.paymentMethod || null,
          status: data.status || null,
          sourceJobId: data.sourceJobId || null,
          sourceItemId: data.sourceItemId || null,
          attachmentUrls,
        },
        deletedBy: {
          uid: deletedBy?.uid || null,
          displayName: deletedBy?.displayName || null,
          email: deletedBy?.email || null,
        },
        deletedVia: 'OPEX_UI',
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('[deleteExpense] Audit log failed:', err)
    }

    try {
      await deleteStorageUrls(attachmentUrls)
    } catch (err) {
      console.warn('[deleteExpense] Storage cleanup failed:', err)
    }
  },

  syncAdHocAttachmentsToOpex: async (sourceItemId, attachmentUrls) => {
    if (!sourceItemId) return
    const q = query(
      collection(db, 'operationalExpenses'),
      where('sourceItemId', '==', sourceItemId)
    )
    const snap = await getDocs(q)
    if (snap.empty) return
    const batch = writeBatch(db)
    const urls = attachmentUrls || []
    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        attachmentUrls: urls,
        attachmentUrl: urls.length > 0 ? urls[0] : null,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  },

  deleteTransfer: async (id) => {
    await deleteDoc(doc(db, 'fundTransfers', id))
  },

  deleteIncome: async (id) => {
    const paymentRef = doc(db, 'jobPayments', id)
    const paymentSnap = await getDoc(paymentRef)
    
    if (paymentSnap.exists()) {
      const data = paymentSnap.data()
      const jobCardId = data.jobCardId
      const amount = Number(data.amount) || 0
      
      await deleteDoc(paymentRef)
      
      if (jobCardId) {
        const jobCardRef = doc(db, 'jobCards', jobCardId)
        const jobSnap = await getDoc(jobCardRef)
        if (jobSnap.exists()) {
          const currentTotal = jobSnap.data().totalPaid || 0
          const newTotal = Math.max(0, currentTotal - amount)
          await updateDoc(jobCardRef, {
            totalPaid: newTotal,
            updatedAt: serverTimestamp()
          })
        }
      }
    }
  },

  deleteTopUp: async (id) => {
    await deleteDoc(doc(db, 'ledgerTopUps', id))
  },

  approveExpense: async (id) => {
    const expenseRef = doc(db, 'operationalExpenses', id)
    await updateDoc(expenseRef, {
      status: 'APPROVED',
      approvedAt: serverTimestamp()
    })
  },

  fundReserveAccount: async (fromAccount, amount, reference) => {
    const amt = Number(amount || 0)
    if (amt <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    const source = normalizeAccountKey(fromAccount)
    if (source === 'UNKNOWN') {
      toast.error('Select a valid source account')
      return
    }
    try {
      assertSufficientFunds(source, amt, get())
      const batch = writeBatch(db)
      const opexRef = doc(collection(db, 'operationalExpenses'))
      batch.set(opexRef, {
        type: 'TRANSFER',
        description: `Reserve Account Top-Up from ${source}`,
        amount: amt,
        paymentMethod: source,
        status: 'APPROVED',
        category: 'Fund Transfer',
        subCategory: 'FUNDING',
        reference: reference || '',
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
      })
      const walletRef = doc(collection(db, 'reserveAccountTransactions'))
      batch.set(walletRef, {
        type: 'FUNDING',
        source,
        amount: amt,
        description: reference || `Top-up from ${source}`,
        referenceId: opexRef.id,
        createdAt: serverTimestamp(),
      })
      await batch.commit()
      toast.success(`Funded $${amt.toLocaleString()} to Reserve Account`)
    } catch (err) {
      console.error('[FinanceStore] fundReserveAccount failed:', err)
      toast.error(err instanceof Error ? err.message : 'Funding failed')
      throw err
    }
  },

  initiateTransfer: async (data, initiatedBy, autoApprove = false) => {
    const amount = Number(data.amount || 0)
    const from = normalizeAccountKey(data.fromAccount)
    const to = normalizeAccountKey(data.toAccount)
    if (from === 'UNKNOWN' || to === 'UNKNOWN') {
      throw new Error('Transfer accounts must be Bank, Cash, EcoCash, IRD, Salaries or Reserve.')
    }
    if (from === 'IRD' && to === 'IRD') {
      throw new Error('Cannot transfer from IRD to IRD.')
    }
    if (!(amount > 0)) {
      throw new Error('Amount must be greater than 0')
    }

    let payload: Record<string, unknown> = {
      fromAccount: data.fromAccount,
      toAccount: data.toAccount,
      amount,
      description: data.description || '',
      reference: data.reference || '',
      date: data.date || new Date().toISOString().split('T')[0],
    }

    if (transferInvolvesIrd(data.fromAccount, data.toAccount)) {
      const exchangeRate = Number(data.exchangeRate || 0)
      if (!(exchangeRate > 0)) {
        throw new Error('Exchange rate (ZAR per USD) is required for IRD transfers.')
      }
      const amountZar = usdToZar(amount, exchangeRate)
      payload = {
        ...payload,
        exchangeRate,
        amountZar,
        currencyPair: 'USD/ZAR',
      }
      assertSufficientFunds(
        data.fromAccount,
        from === 'IRD' ? amountZar : amount,
        get()
      )
    } else {
      assertSufficientFunds(data.fromAccount, amount, get())
    }

    const docRef = await addDoc(collection(db, 'fundTransfers'), {
      ...payload,
      status: autoApprove ? 'PENDING_MANAGER' : 'PENDING_ACCOUNTANT',
      initiatedBy: initiatedBy?.name || initiatedBy?.email || 'Unknown',
      initiatedByEmail: initiatedBy?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    if (autoApprove) {
      await get().approveTransfer(docRef.id, initiatedBy)
    }
  },

  accountantInitialTransfer: async (id, by) => {
    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'PENDING_MANAGER',
      accountantInitialedBy: by.name || by.email || 'Accountant',
      accountantInitialedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  approveTransfer: async (id, by) => {
    const user = auth.currentUser
    if (!user) throw new Error('Authentication required')
    const response = await fetch(`/api/transfers/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: by?.name || by?.email || null }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Transfer approval failed')
  },

  rejectTransfer: async (id, by) => {
    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'REJECTED',
      rejectedBy: by?.name || by?.email || 'Unknown',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  cancelTransfer: async (id, by) => {
    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'CANCELLED',
      cancelledBy: by?.name || by?.email || 'Unknown',
      cancelledByEmail: by?.email || '',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  recordIncome: async (data) => {
    await addDoc(collection(db, 'jobPayments'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    if (data.jobCardId) {
      const jobCardRef = doc(db, 'jobCards', data.jobCardId)
      const jobSnap = await getDoc(jobCardRef)
      if (jobSnap.exists()) {
        const currentTotal = jobSnap.data().totalPaid || 0
        const newTotal = currentTotal + (Number(data.amount) || 0)
        await updateDoc(jobCardRef, {
          totalPaid: newTotal,
          updatedAt: serverTimestamp()
        })
      }
    }
  },

  recordTopUp: async (data) => {
    await addDoc(collection(db, 'ledgerTopUps'), {
      ...data,
      status: 'PENDING_ACCOUNTANT',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  accountantInitialTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'PENDING_MANAGER',
      accountantInitialedBy: by.name || by.email || 'Accountant',
      accountantInitialedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  approveTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'COMPLETED',
      managerApprovedBy: by?.name || by?.email || 'Manager',
      managerApprovedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  rejectTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'REJECTED',
      rejectedBy: by?.name || by?.email || 'Unknown',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  },

  createLoanLender: async (data, by) => {
    const name = String(data.name || '').trim()
    if (!name) throw new Error('Lender name is required')
    await addDoc(collection(db, 'businessLoanLenders'), {
      name,
      email: String(data.email || '').trim(),
      phone: String(data.phone || '').trim(),
      notes: String(data.notes || '').trim(),
      status: 'ACTIVE',
      currency: 'USD',
      outstandingPrincipal: 0,
      createdBy: by?.name || by?.email || 'Unknown',
      createdByEmail: by?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },

  recordLoanTransaction: async (data, by) => {
    const lender = get().loanLenders.find(l => l.id === data.lenderId)
    const transactionType = data.transactionType === 'REPAYMENT' ? 'REPAYMENT' : 'RECEIPT'
    const account = normalizeAccountKey(data.account)
    const amount = Math.abs(Number(data.amount || 0))
    if (!lender || lender.status !== 'ACTIVE') throw new Error('Select an active lender')
    if (!['BANK', 'CASH', 'ECOCASH', 'RESERVE'].includes(account)) throw new Error('Select Bank, Cash, EcoCash or Reserve')
    if (!(amount > 0)) throw new Error('Amount must be greater than 0')
    if (transactionType === 'REPAYMENT') {
      if (amount > Number(lender.outstandingPrincipal || 0)) throw new Error('Repayment exceeds this lender’s outstanding principal')
      assertSufficientFunds(account, amount, get(), { context: 'for this loan repayment' })
    }
    await addDoc(collection(db, 'businessLoanTransactions'), {
      transactionType,
      lenderId: lender.id,
      lenderName: lender.name,
      account,
      amount,
      currency: 'USD',
      effectiveDate: data.effectiveDate || new Date().toISOString().slice(0, 10),
      reference: String(data.reference || '').trim(),
      purpose: String(data.purpose || '').trim(),
      notes: String(data.notes || '').trim(),
      status: 'PENDING_ACCOUNTANT',
      requestedBy: by?.name || by?.email || 'Unknown',
      requestedByEmail: by?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },

  accountantInitialLoanTransaction: async (id, by) => {
    await updateDoc(doc(db, 'businessLoanTransactions', id), {
      status: 'PENDING_MANAGER',
      accountantInitialedBy: by.name || by.email || 'Accountant',
      accountantInitialedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },

  approveLoanTransaction: async (id, by) => {
    const stateTx = get().loanTransactions.find(t => t.id === id)
    if (stateTx?.transactionType === 'REPAYMENT') {
      assertSufficientFunds(stateTx.account, Number(stateTx.amount || 0), get(), { context: 'to approve this loan repayment' })
    }
    const loanRef = doc(db, 'businessLoanTransactions', id)
    await runTransaction(db, async (transaction) => {
      const loanSnap = await transaction.get(loanRef)
      if (!loanSnap.exists()) throw new Error('Loan transaction was not found')
      const loan = loanSnap.data()
      if (loan.status === 'COMPLETED') return
      if (loan.status !== 'PENDING_MANAGER') throw new Error('Loan transaction is not awaiting manager approval')
      const lenderRef = doc(db, 'businessLoanLenders', loan.lenderId)
      const lenderSnap = await transaction.get(lenderRef)
      if (!lenderSnap.exists()) throw new Error('Lender was not found')
      const current = Number(lenderSnap.data().outstandingPrincipal || 0)
      const amount = Math.abs(Number(loan.amount || 0))
      const next = loan.transactionType === 'REPAYMENT' ? current - amount : current + amount
      if (next < 0) throw new Error('Repayment exceeds this lender’s outstanding principal')

      transaction.update(lenderRef, { outstandingPrincipal: next, updatedAt: serverTimestamp() })
      transaction.update(loanRef, {
        status: 'COMPLETED',
        principalBefore: current,
        principalAfter: next,
        managerApprovedBy: by?.name || by?.email || 'Manager',
        managerApprovedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      if (normalizeAccountKey(loan.account) === 'RESERVE') {
        const reserveRef = doc(db, 'reserveAccountTransactions', `loan-${id}`)
        transaction.set(reserveRef, {
          type: loan.transactionType === 'REPAYMENT' ? 'PAYMENT' : 'FUNDING',
          source: 'BUSINESS_LOAN',
          amount,
          currency: 'USD',
          description: `${loan.transactionType === 'REPAYMENT' ? 'Loan repayment to' : 'Loan received from'} ${loan.lenderName}`,
          reference: loan.reference || '',
          referenceId: id,
          lenderId: loan.lenderId,
          createdAt: serverTimestamp(),
        })
      }
    })
  },

  rejectLoanTransaction: async (id, by, reason) => {
    await updateDoc(doc(db, 'businessLoanTransactions', id), {
      status: 'REJECTED',
      rejectionReason: String(reason || '').trim(),
      rejectedBy: by?.name || by?.email || 'Unknown',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [], ledgerHydration: EMPTY_LEDGER_HYDRATION, ledgerHydrationErrors: {} })
  }
}))
