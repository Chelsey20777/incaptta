import { db } from '../config/firebase';
import { StockLedgerEntry, StockLedgerType } from '../models/stockLedger.model';
import * as admin from 'firebase-admin';

const getCollection = () => db.collection('stockLedger');
const getInventoryCollection = () => db.collection('inventoryItems');

export const StockLedgerService = {
    async getById(id: string) {
        const doc = await getCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as StockLedgerEntry & { id: string };
    },

    async query(filters: {
        inventoryItemId?: string;
        sku?: string;
        type?: StockLedgerType;
        jrId?: string;
    }) {
        let query: admin.firestore.Query = getCollection();

        if (filters.inventoryItemId) query = query.where('inventoryItemId', '==', filters.inventoryItemId);
        if (filters.sku) query = query.where('sku', '==', filters.sku);
        if (filters.type) query = query.where('type', '==', filters.type);
        if (filters.jrId) query = query.where('sourceId', '==', filters.jrId);

        const snapshot = await query.orderBy('timestamp', 'desc').get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Manual Stock Adjustment
     */
    async adjustStock(
        inventoryItemId: string,
        quantityChange: number,
        userId: string,
        reason?: string
    ) {
        return db.runTransaction(async (transaction) => {
            const invRef = getInventoryCollection().doc(inventoryItemId);
            const invDoc = await transaction.get(invRef);

            if (!invDoc.exists) throw new Error('Inventory item not found');
            const invData = invDoc.data()!;
            const previousStock = invData.inStock || 0;
            const newStock = previousStock + quantityChange;

            if (newStock < 0) throw new Error('Resulting stock cannot be negative');

            const now = admin.firestore.FieldValue.serverTimestamp();

            // Update Inventory
            transaction.update(invRef, {
                inStock: newStock,
                updatedAt: now,
            });

            // Create Ledger Entry
            const ledgerRef = getCollection().doc();
            const ledgerEntry: StockLedgerEntry = {
                inventoryItemId,
                sku: invData.sku,
                type: 'ADJUSTMENT',
                sourceType: 'MANUAL',
                quantityChange,
                previousStock,
                newStock,
                reason,
                performedBy: userId,
                timestamp: now,
                createdAt: now,
                updatedAt: now,
            };

            transaction.set(ledgerRef, ledgerEntry);

            return { inventoryItemId, newStock };
        });
    },
};
