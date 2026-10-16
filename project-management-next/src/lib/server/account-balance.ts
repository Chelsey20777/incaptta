import type { Transaction } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { normalizeAccountKey, type CanonicalAccount } from '@/lib/account-keys'
import { transferLegAmount } from '@/lib/ird-fx'

const COMMITTED_EXPENSES = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])

export async function getAccountBalanceInTransaction(
  transaction: Transaction,
  account: CanonicalAccount
): Promise<number> {
  const [expenses, payments, invoicePayments, transfers, topUps, loans] = await Promise.all([
    transaction.get(adminDb.collection('operationalExpenses')),
    transaction.get(adminDb.collection('jobPayments')),
    transaction.get(adminDb.collection('invoicePayments')),
    transaction.get(adminDb.collection('fundTransfers').where('status', '==', 'COMPLETED')),
    transaction.get(adminDb.collection('ledgerTopUps').where('status', '==', 'COMPLETED')),
    transaction.get(adminDb.collection('businessLoanTransactions').where('status', '==', 'COMPLETED')),
  ])

  let balance = 0
  for (const doc of expenses.docs) {
    const row = doc.data()
    if (COMMITTED_EXPENSES.has(String(row.status || '')) && normalizeAccountKey(row.paymentMethod) === account) {
      balance -= Math.abs(Number(row.amount || 0))
    }
  }
  for (const doc of payments.docs) {
    const row = doc.data()
    if (normalizeAccountKey(row.paymentMethod) === account) balance += Math.abs(Number(row.amount || 0))
  }
  // Unlinked invoice receipts only — linked ones already credit via jobPayments;
  // RESERVE is overwritten by the wallet block below.
  if (account !== 'RESERVE' && account !== 'SALARIES') {
    for (const doc of invoicePayments.docs) {
      const row = doc.data()
      if (String(row.jobCardId || '').trim()) continue
      if (normalizeAccountKey(row.method || row.paymentMethod) === account) {
        balance += Math.abs(Number(row.amount || 0))
      }
    }
  }
  for (const doc of transfers.docs) {
    const row = doc.data()
    const fromAccount = normalizeAccountKey(row.fromAccount)
    const toAccount = normalizeAccountKey(row.toAccount)
    if (fromAccount === account) balance -= transferLegAmount(fromAccount, row)
    if (toAccount === account) balance += transferLegAmount(toAccount, row)
  }
  for (const doc of topUps.docs) {
    const row = doc.data()
    if (normalizeAccountKey(row.account) === account) balance += Number(row.amount || 0)
  }
  for (const doc of loans.docs) {
    const row = doc.data()
    if (normalizeAccountKey(row.account) !== account) continue
    const amount = Math.abs(Number(row.amount || 0))
    balance += row.transactionType === 'REPAYMENT' ? -amount : amount
  }

  if (account === 'SALARIES' || account === 'RESERVE') {
    const collectionName = account === 'SALARIES' ? 'salariesAccountTransactions' : 'reserveAccountTransactions'
    const wallet = await transaction.get(adminDb.collection(collectionName))
    balance = wallet.docs.reduce((sum, doc) => {
      const row = doc.data()
      const amount = Number(row.amount || 0)
      if (row.type === 'FUNDING' || row.type === 'TRANSFER') return sum + amount
      if (row.type === 'PAYMENT') return sum - amount
      return sum
    }, 0)
  }

  return Math.round((balance + Number.EPSILON) * 100) / 100
}
