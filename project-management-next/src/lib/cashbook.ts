import { collection, getDocs, query, type QuerySnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { normalizeAccountKey, isNonUsd, COMMITTED_OPEX_STATUSES } from '@/lib/account-keys'
import { transferLegAmount } from '@/lib/ird-fx'

export interface CashbookBalances {
  BANK: number
  CASH: number
  ECOCASH: number
  IRD: number
  SALARIES: number
  RESERVE: number
  [key: string]: number
}

/**
 * One-shot server read of the live cashbook, applying the SAME rules as
 * finance-store.updateLedger(): committed OPEX statuses deduct, only COMPLETED
 * transfers/top-ups move funds, all jobPayments credit, salaries/reserve come
 * from their wallet collections, and non-USD / unknown-account entries are
 * excluded from the four liquid accounts.
 *
 * IRD transfer legs use amountZar (ZAR) when present; other legs use amount (USD).
 *
 * Used by reports so the balance sheet agrees with the ledger page and
 * dashboard instead of reading the deprecated `ledger` collection.
 */
export async function fetchCashbookBalances(): Promise<CashbookBalances> {
  const [expensesSnap, transfersSnap, paymentsSnap, invoicePaymentsSnap, topUpsSnap, salariesSnap, reserveSnap, loansSnap] = await Promise.all([
    getDocs(query(collection(db, 'operationalExpenses'))),
    getDocs(query(collection(db, 'fundTransfers'))),
    getDocs(query(collection(db, 'jobPayments'))),
    getDocs(query(collection(db, 'invoicePayments'))),
    getDocs(query(collection(db, 'ledgerTopUps'))),
    getDocs(query(collection(db, 'salariesAccountTransactions'))),
    getDocs(query(collection(db, 'reserveAccountTransactions'))),
    getDocs(query(collection(db, 'businessLoanTransactions'))),
  ])

  const balances: CashbookBalances = { BANK: 0, CASH: 0, ECOCASH: 0, IRD: 0, SALARIES: 0, RESERVE: 0 }

  expensesSnap.docs.forEach((d) => {
    const e = d.data()
    if (!(COMMITTED_OPEX_STATUSES as readonly string[]).includes(e.status)) return
    if (isNonUsd(e.currency)) return
    const acc = normalizeAccountKey(e.paymentMethod)
    // RESERVE/SALARIES balances come only from wallet collections (below).
    if (acc === 'RESERVE' || acc === 'SALARIES') return
    if (acc === 'UNKNOWN') return
    balances[acc] = (balances[acc] || 0) - Math.abs(Number(e.amount || 0))
  })

  transfersSnap.docs.forEach((d) => {
    const t = d.data()
    if (t.status !== 'COMPLETED') return
    // Virtual-wallet legs are recorded in salaries/reserve side collections; skip here
    // so wallet override is the sole source (avoids double-count before overwrite).
    const from = normalizeAccountKey(t.fromAccount)
    const to = normalizeAccountKey(t.toAccount)
    if (from !== 'RESERVE' && from !== 'SALARIES' && from !== 'UNKNOWN') {
      balances[from] = (balances[from] || 0) - transferLegAmount(from, t)
    }
    if (to !== 'RESERVE' && to !== 'SALARIES' && to !== 'UNKNOWN') {
      balances[to] = (balances[to] || 0) + transferLegAmount(to, t)
    }
  })

  paymentsSnap.docs.forEach((d) => {
    const p = d.data()
    const acc = normalizeAccountKey(p.paymentMethod)
    if (acc === 'UNKNOWN' || acc === 'RESERVE' || acc === 'SALARIES') return
    balances[acc] = (balances[acc] || 0) + Math.abs(Number(p.amount || 0))
  })

  // Unlinked invoice receipts (no jobCardId) credit BANK/CASH/ECOCASH directly.
  // Linked invoices already credit via jobPayments; RESERVE via wallet FUNDING.
  invoicePaymentsSnap.docs.forEach((d) => {
    const p = d.data()
    if (String(p.jobCardId || '').trim()) return
    const acc = normalizeAccountKey(p.method || p.paymentMethod)
    if (acc === 'UNKNOWN' || acc === 'RESERVE' || acc === 'SALARIES') return
    balances[acc] = (balances[acc] || 0) + Math.abs(Number(p.amount || 0))
  })

  topUpsSnap.docs.forEach((d) => {
    const t = d.data()
    if (t.status !== 'COMPLETED') return
    const acc = normalizeAccountKey(t.account)
    if (acc === 'UNKNOWN' || acc === 'RESERVE' || acc === 'SALARIES') return
    // Signed: negative COMPLETED top-ups are reconciliation write-downs.
    balances[acc] = (balances[acc] || 0) + Number(t.amount || 0)
  })

  loansSnap.docs.forEach((d) => {
    const loan = d.data()
    if (loan.status !== 'COMPLETED') return
    const acc = normalizeAccountKey(loan.account)
    // Reserve is posted through its deterministic virtual-wallet entry.
    if (acc === 'UNKNOWN' || acc === 'RESERVE') return
    const amount = Math.abs(Number(loan.amount || 0))
    balances[acc] = (balances[acc] || 0) + (loan.transactionType === 'REPAYMENT' ? -amount : amount)
  })

  const walletCash = (snap: QuerySnapshot<DocumentData>) =>
    snap.docs.reduce((sum, d) => {
      const t = d.data()
      const amt = Number(t.amount || 0)
      if (t.type === 'FUNDING' || t.type === 'TRANSFER') return sum + amt
      if (t.type === 'PAYMENT') return sum - amt
      return sum
    }, 0)

  balances.SALARIES = walletCash(salariesSnap)
  balances.RESERVE = walletCash(reserveSnap)

  return balances
}
