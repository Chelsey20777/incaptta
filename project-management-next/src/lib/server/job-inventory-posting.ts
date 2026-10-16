import { FieldValue, type Transaction } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import {
  cloneJobRows,
  postJobInventoryLineInTransaction,
  updateMatchingLine,
  type InventoryJobCardRecord,
  type InventoryLineRecord,
  type InventoryMovementType,
  type InventoryPostingActor,
  type InventoryPostingResult,
  type InventoryPostingTransaction,
  type StockLedgerRecord,
} from './job-inventory-posting-core'

export type {
  InventoryJobCardRecord,
  InventoryLineRecord,
  InventoryMovementType,
  InventoryPostingActor,
  InventoryPostingResult,
} from './job-inventory-posting-core'

export {
  cloneJobRows,
  inventoryLedgerId,
  isEligibleForManagerStockPost,
  listInventoryLines,
  updateMatchingLine,
} from './job-inventory-posting-core'

interface PostInventoryLineInput {
  jobCardId: string
  lineId: string
  movementType: InventoryMovementType
  actor: InventoryPostingActor
}

function firestorePostingTransaction(transaction: Transaction): InventoryPostingTransaction {
  return {
    async getJob(jobCardId) {
      const snap = await transaction.get(adminDb.collection('jobCards').doc(jobCardId))
      return snap.exists ? snap.data() as InventoryJobCardRecord : null
    },
    async getLedger(ledgerId) {
      const snap = await transaction.get(adminDb.collection('stockLedger').doc(ledgerId))
      return snap.exists ? snap.data() as StockLedgerRecord : null
    },
    async getInventory(itemId) {
      const snap = await transaction.get(adminDb.collection('inventoryItems').doc(itemId))
      return snap.exists ? snap.data() as { onHand?: number; inStock?: number; uom?: string } : null
    },
    updateInventory(itemId, onHand) {
      transaction.update(adminDb.collection('inventoryItems').doc(itemId), {
        onHand,
        updatedAt: FieldValue.serverTimestamp(),
      })
    },
    createLedger(ledgerId, record) {
      transaction.create(adminDb.collection('stockLedger').doc(ledgerId), {
        ...record,
        createdAt: FieldValue.serverTimestamp(),
      })
    },
    updateJob(jobCardId, data) {
      transaction.update(adminDb.collection('jobCards').doc(jobCardId), {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
      })
    },
  }
}

export async function postJobInventoryLineTransaction(input: PostInventoryLineInput): Promise<InventoryPostingResult> {
  return adminDb.runTransaction(transaction =>
    postJobInventoryLineInTransaction(firestorePostingTransaction(transaction), input)
  )
}

export async function markJobInventoryLinePostingFailed(
  jobCardId: string,
  lineId: string,
  reason: string
) {
  if (!lineId) return
  const jobRef = adminDb.collection('jobCards').doc(jobCardId)
  await adminDb.runTransaction(async transaction => {
    const jobSnap = await transaction.get(jobRef)
    if (!jobSnap.exists) return
    const rows = cloneJobRows(jobSnap.data() as InventoryJobCardRecord)
    const patchLine = (item: InventoryLineRecord): InventoryLineRecord => item.approvalStatus === 'APPROVED_ACCOUNTANT'
      ? { ...item, postingState: 'FAILED', postingError: reason }
      : item
    transaction.update(jobRef, {
      ...updateMatchingLine(rows, lineId, patchLine),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}
