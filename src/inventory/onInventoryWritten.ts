import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { db } from '../config/firebase';
import { createAuditOnce, inventoryChanges } from './audit';

export const onInventoryWritten = onDocumentWrittenWithAuthContext(
    { document: 'inventoryItems/{id}', retry: true, region: 'us-central1' },
    async event => {
        if (!event.data) throw new Error('Inventory event missing snapshots');
        const before = event.data.before.data();
        const after = event.data.after.data();
        const changes = inventoryChanges(before, after);
        if (!changes.length && before && after) return;
        const item = after || before || {};
        try {
            await createAuditOnce(db.collection('inventoryAuditLogs').doc(encodeURIComponent(event.id)), {
                eventId: event.id, inventoryItemId: event.params.id,
                action: !before ? 'CREATE' : !after ? 'DELETE' : 'UPDATE',
                name: item.name ?? item.itemName ?? '', sku: item.sku ?? '',
                occurredAt: Timestamp.fromDate(new Date(event.time)), recordedAt: FieldValue.serverTimestamp(),
                principal: { type: event.authType || 'unknown', id: event.authId || null },
                itemProvidedActor: { before: before?.updatedBy ?? before?.createdBy ?? null, after: after?.updatedBy ?? after?.createdBy ?? null },
                changes,
            });
        } catch (error) {
            logger.error('Inventory audit capture failed', { eventId: event.id, itemId: event.params.id, error });
            throw error;
        }
    },
);
