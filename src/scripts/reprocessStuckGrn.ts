/**
 * reprocessStuckGrn.ts
 *
 * Manually re-processes a GRN that is stuck in inventoryPostingStatus=PENDING
 * because the onGRNConfirmed function was not deployed when the GRN was confirmed.
 *
 * Run: npx ts-node src/scripts/reprocessStuckGrn.ts
 */

import { db } from '../config/firebase'
import { FieldValue } from 'firebase-admin/firestore'

const GRN_ID = 'JkGdG4iQIWW0iZUx08qx' // from URL: /procurement/grns/JkGdG4iQIWW0iZUx08qx

async function run() {
  const grnRef = db.collection('procurementGrns').doc(GRN_ID)
  const grnSnap = await grnRef.get()

  if (!grnSnap.exists) {
    console.error('GRN not found:', GRN_ID)
    process.exit(1)
  }

  const grn = grnSnap.data()!
  console.log(`GRN: ${grn.grnNumber} | status: ${grn.status} | postingStatus: ${grn.inventoryPostingStatus}`)

  if (grn.status !== 'CONFIRMED') {
    console.error('GRN is not CONFIRMED — aborting.')
    process.exit(1)
  }

  if (grn.inventoryPostingStatus !== 'PENDING') {
    console.log('GRN inventoryPostingStatus is not PENDING — already processed or processing. Aborting.')
    process.exit(0)
  }

  // Mark as PROCESSING
  await grnRef.update({ inventoryPostingStatus: 'PROCESSING', updatedAt: FieldValue.serverTimestamp() })
  console.log('Marked as PROCESSING — starting inventory posting...')

  try {
    const items = grn.items as any[]
    for (const item of items) {
      const qtyReceived = item.qtyReceived as number
      if (qtyReceived <= 0) continue

      console.log(`  Processing item: ${item.description} | status: ${item.inventoryItemStatus} | qty: ${qtyReceived}`)

      switch (item.inventoryItemStatus) {
        case 'EXISTING':
          await handleExistingItem(item, qtyReceived, GRN_ID, grn)
          break
        case 'NEW_PENDING':
          await handleNewPendingItem(item, qtyReceived, GRN_ID, grn)
          break
        case 'ADHOC':
          await handleAdhocItem(item, qtyReceived, GRN_ID, grn)
          break
        default:
          console.log(`  Skipping item with unknown status: ${item.inventoryItemStatus}`)
      }
    }

    await grnRef.update({ inventoryPostingStatus: 'COMPLETE', updatedAt: FieldValue.serverTimestamp() })
    console.log('✓ GRN posted successfully — inventoryPostingStatus set to COMPLETE')
  } catch (err: any) {
    console.error('✗ Error during GRN posting:', err.message)
    await grnRef.update({
      inventoryPostingStatus: 'FAILED',
      inventoryPostingError: err?.message ?? 'Unknown error',
      updatedAt: FieldValue.serverTimestamp()
    })
    process.exit(1)
  }
}

async function handleExistingItem(item: any, qtyReceived: number, grnId: string, grn: any) {
  const inventoryItemId = item.inventoryItemId
  if (!inventoryItemId) throw new Error(`EXISTING item missing inventoryItemId: ${item.description}`)

  await db.runTransaction(async (tx) => {
    const invRef = db.collection('inventoryItems').doc(inventoryItemId)
    const invSnap = await tx.get(invRef)
    if (!invSnap.exists) throw new Error(`Inventory item not found: ${inventoryItemId}`)

    const currentOnHand = invSnap.data()?.onHand ?? 0
    const newOnHand = currentOnHand + qtyReceived

    tx.update(invRef, { onHand: newOnHand, updatedAt: FieldValue.serverTimestamp() })

    const ledgerRef = db.collection('stockLedger').doc()
    tx.set(ledgerRef, {
      movementType: 'ADD',
      inventoryItemId,
      sku: item.sku,
      description: item.description,
      qtyDelta: qtyReceived,
      qtyBefore: currentOnHand,
      qtyAfter: newOnHand,
      reason: `GRN confirmed: ${grn.grnNumber}`,
      referenceNo: grn.poNumber,
      grnId,
      poId: grn.poId,
      supplierId: grn.supplierId,
      postedBy: grn.receivedBy,
      createdAt: FieldValue.serverTimestamp()
    })
    console.log(`    EXISTING: ${item.description} onHand ${currentOnHand} → ${newOnHand}`)
  })
}

async function handleNewPendingItem(item: any, qtyReceived: number, grnId: string, grn: any) {
  const inventoryItemId = item.inventoryItemId
  if (!inventoryItemId) throw new Error(`NEW_PENDING item missing inventoryItemId: ${item.description}`)

  await db.runTransaction(async (tx) => {
    const invRef = db.collection('inventoryItems').doc(inventoryItemId)
    const invSnap = await tx.get(invRef)
    if (!invSnap.exists) throw new Error(`NEW_PENDING inventory doc not found: ${inventoryItemId}`)

    const currentStatus = invSnap.data()?.status
    if (currentStatus === 'ACTIVE') {
      console.log(`    Item ${inventoryItemId} already ACTIVE — skipping`)
      return
    }
    if (currentStatus !== 'PENDING_GRN') {
      throw new Error(`Unexpected inventory status: ${currentStatus} for item ${inventoryItemId}`)
    }

    tx.update(invRef, { status: 'ACTIVE', onHand: qtyReceived, updatedAt: FieldValue.serverTimestamp() })

    const ledgerRef = db.collection('stockLedger').doc()
    tx.set(ledgerRef, {
      movementType: 'ADD',
      inventoryItemId,
      sku: item.sku,
      description: item.description,
      qtyDelta: qtyReceived,
      qtyBefore: 0,
      qtyAfter: qtyReceived,
      reason: `New item registered via GRN: ${grn.grnNumber}`,
      referenceNo: grn.poNumber,
      grnId,
      poId: grn.poId,
      supplierId: grn.supplierId,
      postedBy: grn.receivedBy,
      createdAt: FieldValue.serverTimestamp()
    })
    console.log(`    NEW_PENDING: ${item.description} activated — onHand set to ${qtyReceived}`)
  })
}

async function handleAdhocItem(item: any, qtyReceived: number, grnId: string, grn: any) {
  if (!grn.jobCardId) return
  const totalCost = (item.unitCostPrice ?? 0) * qtyReceived
  await db.collection('jobCards').doc(grn.jobCardId).update({
    adHocExpenses: FieldValue.arrayUnion({
      id: `grn-${grnId}-${item.lineItemId}`,
      description: item.description,
      qty: qtyReceived,
      unitPrice: item.unitCostPrice ?? 0,
      totalCost,
      source: 'PROCUREMENT',
      grnId,
      poId: grn.poId,
      createdAt: new Date().toISOString()
    }),
    updatedAt: FieldValue.serverTimestamp()
  })
  console.log(`    ADHOC: ${item.description} posted to job card ${grn.jobCardId}`)
}

run().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
