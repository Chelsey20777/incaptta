import { FieldValue, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'

export type EnsureClientCreditAccountInput = {
  clientId: string
  clientName?: string
  currency?: string
}

/**
 * Ensure clientCreditAccounts/{clientId} exists inside an open transaction.
 * Does not change balances when the account already exists.
 * Must be called after all reads in the transaction (Firestore write-after-read rule).
 */
export function ensureClientCreditAccountInTransaction(
  tx: Transaction,
  input: EnsureClientCreditAccountInput,
  existingSnap: DocumentSnapshot | null,
) {
  const clientId = String(input.clientId || '').trim()
  if (!clientId || !existingSnap || existingSnap.exists) return

  const now = FieldValue.serverTimestamp()
  tx.create(adminDb.collection('clientCreditAccounts').doc(clientId), {
    clientId,
    clientName: String(input.clientName || '').trim(),
    balance: 0,
    totalDeposited: 0,
    totalApplied: 0,
    currency: String(input.currency || 'USD').trim() || 'USD',
    createdAt: now,
    updatedAt: now,
  })
}

export async function readClientCreditAccount(tx: Transaction, clientId: string) {
  const id = String(clientId || '').trim()
  if (!id) return null
  return tx.get(adminDb.collection('clientCreditAccounts').doc(id))
}
