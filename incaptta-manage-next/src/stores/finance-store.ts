'use client'

import { create } from 'zustand'
import { db, storage } from '@/lib/firebase'
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
  orderBy 
} from 'firebase/firestore'
import { toast } from 'sonner'
import { ref, deleteObject } from 'firebase/storage'

export type ExpenseDeleteActor = {
  uid?: string
  displayName?: string
  email?: string
}

function storageRefFromUrl(url: string) {
  if (url.startsWith('gs://')) {
    return ref(storage, url)
  }
  const match = url.match(/\/o\/([^?]+)/)
  if (!match?.[1]) {
    throw new Error('Invalid Firebase Storage URL')
  }
  return ref(storage, decodeURIComponent(match[1]))
}

async function deleteStorageUrls(urls: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set((urls || []).filter((u): u is string => typeof u === 'string' && u.trim().length > 0))]
  await Promise.all(
    unique.map(async (url) => {
      try {
        await deleteObject(storageRefFromUrl(url))
      } catch (err: any) {
        const code = err?.code || ''
        if (
          code === 'storage/object-not-found' ||
          code === 'storage/invalid-argument' ||
          err?.message === 'Invalid Firebase Storage URL'
        ) {
          return
        }
        console.warn('[deleteStorageUrls] Failed to delete', url, err)
      }
    })
  )
}

interface FinanceState {
  expenses: any[]
  transfers: any[]
  jobPayments: any[]
  ledger: any[]
  topUps: any[]
  salariesTransactions: any[]
  finalBalances: Record<string, number>
  totalBusinessBalance: number
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
  fetchHistoricalInventoryConsumption: () => Promise<void>
  
  updateLedger: () => void
  
  recordExpense: (data: any) => Promise<void>
  lockExpensePdf: (id: string) => Promise<void>
  unlockExpensePdf: (id: string) => Promise<void>
  approveExpenseByAccountant: (id: string, approvedBy: { name?: string; email?: string }) => Promise<void>
  approveExpenseByManager: (id: string, approvedBy: { name?: string; email?: string }, comment?: string) => Promise<void>
  rejectExpenseByAccountant: (id: string, rejectedBy: { name?: string; email?: string }, comment: string) => Promise<void>
  rejectExpenseByManager: (id: string, rejectedBy: { name?: string; email?: string }, comment: string) => Promise<void>
  processExpensePayment: (id: string, processedBy: { name?: string; email?: string }, paymentData: any) => Promise<void>
  deleteExpense: (id: string, deletedBy?: ExpenseDeleteActor | null) => Promise<void>
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
  cleanup: () => void
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  expenses: [],
  transfers: [],
  jobPayments: [],
  ledger: [],
  topUps: [],
  salariesTransactions: [],
  finalBalances: {
    BANK: 0,
    CASH: 0,
    ECOCASH: 0,
    IRD: 0,
    SALARIES: 0,
    CREDIT: 0,
    INVENTORY: 0
  },
  totalBusinessBalance: 0,
  historicalInventoryCost: 0,
  loading: false,
  error: null,
  LIQUID_ACCOUNTS: ['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES'],
  subscriptions: [],

  fetchExpenses: () => {
    set({ loading: true })
    const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ expenses: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) })
      get().updateLedger()
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchTransfers: () => {
    set({ loading: true })
    const q = query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({
        transfers: snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            ...data,
            date: data.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString(),
            status: data.status || 'COMPLETED'
          }
        })
      })
      get().updateLedger()
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchJobPayments: () => {
    set({ loading: true })
    const q = query(collection(db, 'jobPayments'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ jobPayments: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) })
      get().updateLedger()
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchTopUps: () => {
    set({ loading: true })
    const q = query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ topUps: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) })
      get().updateLedger()
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  fetchSalariesTransactions: () => {
    set({ loading: true })
    const q = query(collection(db, 'salariesAccountTransactions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snapshot) => {
      set({ salariesTransactions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) })
      get().updateLedger()
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
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
    const { expenses, transfers, jobPayments, topUps, historicalInventoryCost, LIQUID_ACCOUNTS } = get()
    
    const items = [
      ...expenses.filter(e => ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(e.status)).map(e => ({
        ...e,
        type: 'EXPENSE',
        amount: -Math.abs(Number(e.amount || 0)),
        account: e.paymentMethod ? e.paymentMethod.toUpperCase() : 'UNKNOWN',
        description: e.description || e.title || e.category || 'Operational Expense',
        date: e.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      })),
      ...transfers.filter(t => t.status === 'COMPLETED').flatMap(t => [
        {
          ...t,
          id: `${t.id}_out`,
          type: 'TRANSFER',
          amount: -Math.abs(Number(t.amount || 0)),
          account: t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN',
          description: `Transfer to ${t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN'} ${t.reference ? '- ' + t.reference : ''}`,
          date: t.date || new Date().toLocaleDateString()
        },
        {
          ...t,
          id: `${t.id}_in`,
          type: 'TRANSFER',
          amount: Math.abs(Number(t.amount || 0)),
          account: t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN',
          description: `Transfer from ${t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN'} ${t.reference ? '- ' + t.reference : ''}`,
          date: t.date || new Date().toLocaleDateString()
        }
      ]),
      ...jobPayments.map(p => ({
        ...p,
        type: 'INCOME',
        amount: Math.abs(Number(p.amount || 0)),
        account: p.paymentMethod ? p.paymentMethod.toUpperCase() : 'UNKNOWN',
        date: p.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      })),
      ...topUps.filter(t => t.status === 'COMPLETED').map(t => ({
        ...t,
        type: 'TOPUP',
        amount: Math.abs(Number(t.amount || 0)),
        account: t.account ? t.account.toUpperCase() : 'UNKNOWN',
        description: `${t.description || 'Top-up'} [Req: ${t.requestedBy || 'N/A'}]`,
        date: t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
      }))
    ]

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
      
      if (LIQUID_SET.has(acc)) {
        totalBusinessBalance += amount
      }

      return {
        ...item,
        accountBalance: accountBalances[acc],
        globalBalance: totalBusinessBalance
      }
    })

    set({
      ledger: ledgerWithBalances.reverse(),
      finalBalances: accountBalances,
      totalBusinessBalance,
      loading: false
    })
  },

  recordExpense: async (data) => {
    await addDoc(collection(db, 'operationalExpenses'), {
      ...data,
      status: data.status || 'PENDING_ACCOUNTANT',
      pdfGenerated: data.pdfGenerated || false,
      createdAt: serverTimestamp()
    })
  },

  lockExpensePdf: async (id) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      pdfGenerated: true,
      pdfLockedAt: serverTimestamp()
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
    const isAutoApproved = amount < 300
    
    const updateData: any = {
      status: isAutoApproved ? 'APPROVED_FOR_PAYMENT' : 'APPROVED_ACCOUNTANT',
      accountantApprovedAt: serverTimestamp(),
      accountantApprovedBy: approvedBy.name || approvedBy.email || 'Accountant'
    }

    if (isAutoApproved) {
      updateData.managerApprovedAt = serverTimestamp()
      updateData.managerApprovedBy = 'System (Auto-approved < $300)'
    }

    await updateDoc(doc(db, 'operationalExpenses', id), updateData)
  },

  approveExpenseByManager: async (id, approvedBy, comment) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'APPROVED_FOR_PAYMENT',
      managerApprovedAt: serverTimestamp(),
      managerApprovedBy: approvedBy.name || approvedBy.email || 'Manager',
      ...(comment ? { managerComment: comment } : {})
    })
  },

  rejectExpenseByAccountant: async (id, rejectedBy, comment) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'REJECTED_ACCOUNTANT',
      accountantRejectedAt: serverTimestamp(),
      accountantRejectedBy: rejectedBy.name || rejectedBy.email || 'Accountant',
      accountantComment: comment
    })
  },

  rejectExpenseByManager: async (id, rejectedBy, comment) => {
    await updateDoc(doc(db, 'operationalExpenses', id), {
      status: 'REJECTED_MANAGER',
      managerRejectedAt: serverTimestamp(),
      managerRejectedBy: rejectedBy.name || rejectedBy.email || 'Manager',
      managerComment: comment
    })
  },

  processExpensePayment: async (id, processedBy, paymentData) => {
    const expense = get().expenses.find(e => e.id === id)
    if (expense) {
      const amount = Number(expense.amount || 0)
      const account = (paymentData.paymentMethod || '').toUpperCase()
      const currentBalance = get().finalBalances[account] || 0
      if (currentBalance < amount) {
        throw new Error(`Insufficient funds in ${account}. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
      }
    }

    const batch = writeBatch(db)
    const expenseRef = doc(db, 'operationalExpenses', id)

    batch.update(expenseRef, {
      status: 'PAYMENT_PROCESSED',
      paymentProcessedAt: serverTimestamp(),
      paymentProcessedBy: processedBy.name || processedBy.email || 'Finance',
      paymentDetails: paymentData
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

        const linkedAdvanceIds = payrollData.linkedAdvanceIds || []
        linkedAdvanceIds.forEach((advId: string) => {
          batch.update(doc(db, 'salaryAdvances', advId), {
            status: 'Processed',
            payrollId: expense.payrollId,
            updatedAt: serverTimestamp()
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
          await updateDoc(jobCardRef, { totalPaid: newTotal })
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

  initiateTransfer: async (data, initiatedBy, autoApprove = false) => {
    const amount = Number(data.amount || 0)
    const account = (data.fromAccount || '').toUpperCase()
    const hasLedgerLoaded = get().expenses.length > 0 || get().jobPayments.length > 0
    if (hasLedgerLoaded) {
      const currentBalance = get().finalBalances[account] || 0
      if (currentBalance < amount) {
        throw new Error(`Insufficient funds in ${account}. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
      }
    }

    await addDoc(collection(db, 'fundTransfers'), {
      ...data,
      status: autoApprove ? 'COMPLETED' : 'PENDING_ACCOUNTANT',
      initiatedBy: initiatedBy?.name || initiatedBy?.email || 'Unknown',
      initiatedByEmail: initiatedBy?.email || '',
      ...(autoApprove ? {
        managerApprovedBy: initiatedBy?.name || initiatedBy?.email || 'System',
        managerApprovedAt: serverTimestamp()
      } : {}),
      createdAt: serverTimestamp()
    })
  },

  accountantInitialTransfer: async (id, by) => {
    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'PENDING_MANAGER',
      accountantInitialedBy: by.name || by.email || 'Accountant',
      accountantInitialedAt: serverTimestamp()
    })
  },

  approveTransfer: async (id, by) => {
    const transfer = get().transfers.find(t => t.id === id)
    if (transfer) {
      const amount = Number(transfer.amount || 0)
      const account = (transfer.fromAccount || '').toUpperCase()
      const hasLedgerLoaded = get().expenses.length > 0 || get().jobPayments.length > 0
      if (hasLedgerLoaded) {
        const currentBalance = get().finalBalances[account] || 0
        if (currentBalance < amount) {
          throw new Error(`Insufficient funds in ${account} to approve this transfer. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
        }
      }
    }

    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'COMPLETED',
      managerApprovedBy: by?.name || by?.email || 'Manager',
      managerApprovedAt: serverTimestamp()
    })

    if (transfer && transfer.toAccount && transfer.toAccount.toUpperCase() === 'SALARIES') {
      try {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
          type: 'TRANSFER',
          source: 'FUND_TRANSFER',
          amount: Number(transfer.amount),
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          description: `Transfer from ${transfer.fromAccount}`,
          referenceId: id,
          createdAt: serverTimestamp()
        })
      } catch (err) {
        console.error('Failed to record Salaries Account transfer:', err)
      }
    }
  },

  rejectTransfer: async (id, by) => {
    await updateDoc(doc(db, 'fundTransfers', id), {
      status: 'REJECTED',
      rejectedBy: by?.name || by?.email || 'Unknown',
      rejectedAt: serverTimestamp()
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
      createdAt: serverTimestamp()
    })

    if (data.jobCardId) {
      const jobCardRef = doc(db, 'jobCards', data.jobCardId)
      const jobSnap = await getDoc(jobCardRef)
      if (jobSnap.exists()) {
        const currentTotal = jobSnap.data().totalPaid || 0
        const newTotal = currentTotal + (Number(data.amount) || 0)
        await updateDoc(jobCardRef, { totalPaid: newTotal })
      }
    }
  },

  recordTopUp: async (data) => {
    await addDoc(collection(db, 'ledgerTopUps'), {
      ...data,
      status: 'PENDING_ACCOUNTANT',
      createdAt: serverTimestamp()
    })
  },

  accountantInitialTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'PENDING_MANAGER',
      accountantInitialedBy: by.name || by.email || 'Accountant',
      accountantInitialedAt: serverTimestamp()
    })
  },

  approveTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'COMPLETED',
      managerApprovedBy: by?.name || by?.email || 'Manager',
      managerApprovedAt: serverTimestamp()
    })
  },

  rejectTopUp: async (id, by) => {
    await updateDoc(doc(db, 'ledgerTopUps', id), {
      status: 'REJECTED',
      rejectedBy: by?.name || by?.email || 'Unknown',
      rejectedAt: serverTimestamp()
    })
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  }
}))
