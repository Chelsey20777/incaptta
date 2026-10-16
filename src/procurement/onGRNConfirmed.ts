import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, DocumentData } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

export const onGRNConfirmed = onDocumentWritten(
  'procurementGrns/{grnId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const grnId = event.params.grnId;

    if (!after) return;
    // Fire for a newly-created confirmed GRN or a transition to CONFIRMED.
    if (before?.status === after?.status && before?.inventoryPostingStatus === after?.inventoryPostingStatus) return;
    if (after?.status !== 'CONFIRMED') return;

    const grnRef = db.collection('procurementGrns').doc(grnId);
    const claimed = await db.runTransaction(async transaction => {
      const current = await transaction.get(grnRef);
      if (!current.exists) return false;
      const data = current.data();
      if (data?.status !== 'CONFIRMED' || data?.inventoryPostingStatus !== 'PENDING') return false;
      transaction.update(grnRef, {
        inventoryPostingStatus: 'PROCESSING',
        inventoryPostingError: null,
        updatedAt: FieldValue.serverTimestamp()
      });
      return true;
    });
    if (!claimed) return;

    try {
      const current = await grnRef.get();
      await processGRNItems(grnId, current.data() || after);

      // Mark as COMPLETE
      await db
        .collection('procurementGrns')
        .doc(grnId)
        .update({
          inventoryPostingStatus: 'COMPLETE',
          updatedAt: FieldValue.serverTimestamp()
        });
    } catch (error: any) {
      console.error('GRN posting failed:', error);

      // Mark as FAILED with error message
      await db
        .collection('procurementGrns')
        .doc(grnId)
        .update({
          inventoryPostingStatus: 'FAILED',
          inventoryPostingError:
            error?.message ?? 'Unknown error',
          updatedAt: FieldValue.serverTimestamp()
        });
    }
  }
);

async function processGRNItems(
  grnId: string,
  grn: DocumentData
): Promise<void> {
  const items = grn.items as any[];

  for (const item of items) {
    const qtyReceived = item.qtyReceived as number;
    if (qtyReceived <= 0) continue;
    // Skip items with zero received — nothing to post

    switch (item.inventoryItemStatus) {
      case 'EXISTING':
        await handleExistingItem(item, qtyReceived, grnId, grn);
        break;

      case 'NEW_PENDING':
        await handleNewPendingItem(item, qtyReceived, grnId, grn);
        break;

      case 'ADHOC':
        await handleAdhocItem(item, qtyReceived, grnId, grn);
        break;
    }
  }
}

async function handleExistingItem(
  item: any,
  qtyReceived: number,
  grnId: string,
  grn: any
): Promise<void> {
  const inventoryItemId = item.inventoryItemId;
  if (!inventoryItemId) {
    throw new Error(
      `EXISTING item missing inventoryItemId:
      ${item.description}`
    );
  }

  // Run as transaction for atomicity
  await db.runTransaction(async (transaction) => {
    const inventoryRef = db
      .collection('inventoryItems')
      .doc(inventoryItemId);
    const inventorySnap = await transaction.get(inventoryRef);

    if (!inventorySnap.exists) {
      throw new Error(
        `Inventory item not found: ${inventoryItemId}`
      );
    }

    const sourceLineId = item.lineItemId || item.id;
    if (!sourceLineId) throw new Error('GRN inventory line is missing a stable line ID');
    const ledgerRef = db.collection('stockLedger').doc(`GRN_RECEIPT_${grnId}_${sourceLineId}`);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (ledgerSnap.exists) return;
    const currentOnHand = inventorySnap.data()?.onHand ?? 0;
    const newOnHand = currentOnHand + qtyReceived;

    transaction.update(inventoryRef, {
      onHand: newOnHand,
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.set(ledgerRef, {
      movementType: 'RECEIPT',
      inventoryItemId,
      sku: item.sku,
      description: item.description,
      qtyDelta: qtyReceived,
      qtyBefore: currentOnHand,
      qtyAfter: newOnHand,
      sourceType: 'GRN_RECEIPT',
      sourceId: grnId,
      sourceLineId,
      reason: `GRN confirmed: ${grn.grnNumber}`,
      referenceNo: grn.poNumber,
      grnId,
      poId: grn.poId,
      supplierId: grn.supplierId,
      postedBy: grn.receivedBy,
      createdAt: FieldValue.serverTimestamp()
    });
  });
}

async function handleNewPendingItem(
  item: any,
  qtyReceived: number,
  grnId: string,
  grn: any
): Promise<void> {
  const inventoryItemId = item.inventoryItemId;
  if (!inventoryItemId) {
    throw new Error(
      `NEW_PENDING item missing inventoryItemId:
      ${item.description}`
    );
  }

  // ⚠️ CRITICAL: Read from inventoryItems doc directly
  // newItemData was stripped from PR in Phase 3
  // The inventoryItems doc is the source of truth
  await db.runTransaction(async (transaction) => {
    const inventoryRef = db
      .collection('inventoryItems')
      .doc(inventoryItemId);
    const inventorySnap = await transaction.get(inventoryRef);

    if (!inventorySnap.exists) {
      throw new Error(
        `NEW_PENDING inventory doc not found: 
        ${inventoryItemId}`
      );
    }

    const sourceLineId = item.lineItemId || item.id;
    if (!sourceLineId) throw new Error('GRN inventory line is missing a stable line ID');
    const ledgerRef = db.collection('stockLedger').doc(`GRN_RECEIPT_${grnId}_${sourceLineId}`);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (ledgerSnap.exists) return;
    const currentStatus = inventorySnap.data()?.status;

    // Idempotency: skip if already activated
    if (currentStatus === 'ACTIVE') {
      console.log(
        `Item ${inventoryItemId} already ACTIVE — skipping`
      );
      return;
    }

    if (currentStatus !== 'PENDING_GRN') {
      throw new Error(
        `Unexpected inventory status: ${currentStatus}
        for item ${inventoryItemId}`
      );
    }

    // Activate the inventory item and set onHand
    transaction.update(inventoryRef, {
      status: 'ACTIVE',
      onHand: qtyReceived,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Write stockLedger entry — first ever entry for this item
    transaction.set(ledgerRef, {
      movementType: 'RECEIPT',
      inventoryItemId,
      sku: item.sku,
      description: item.description,
      qtyDelta: qtyReceived,
      qtyBefore: 0,
      qtyAfter: qtyReceived,
      sourceType: 'GRN_RECEIPT',
      sourceId: grnId,
      sourceLineId,
      reason: `New item registered via GRN: ${grn.grnNumber}`,
      referenceNo: grn.poNumber,
      grnId,
      poId: grn.poId,
      supplierId: grn.supplierId,
      postedBy: grn.receivedBy,
      createdAt: FieldValue.serverTimestamp()
    });
  });
}

async function handleAdhocItem(
  item: any,
  qtyReceived: number,
  grnId: string,
  grn: any
): Promise<void> {
  // ADHOC items: no inventory touch
  // Post cost to jobCard.adHocExpenses if linked to a job card
  if (!grn.jobCardId) return;

  const totalCost =
    (item.unitCostPrice ?? 0) * qtyReceived;

  const jobCardRef = db
    .collection('jobCards')
    .doc(grn.jobCardId);

  await jobCardRef.update({
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
      // Note: FieldValue.serverTimestamp() cannot be used
      // inside arrayUnion objects — use ISO string instead
    }),
    updatedAt: FieldValue.serverTimestamp()
  });
}
