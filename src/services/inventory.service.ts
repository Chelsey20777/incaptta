import { db } from '../config/firebase';
import { InventoryItem } from '../models/inventory.model';

const collection = db.collection('inventoryItems');

export const InventoryService = {
    async create(data: InventoryItem) {
        // Check SKU uniqueness
        const snapshot = await collection.where('sku', '==', data.sku).get();
        if (!snapshot.empty) {
            throw new Error('SKU already exists');
        }

        const docRef = await collection.add({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return { id: docRef.id, ...data };
    },

    async getAll(filters?: { category?: string; sku?: string; isActive?: boolean }) {
        let query: FirebaseFirestore.Query = collection;

        if (filters?.category) query = query.where('category', '==', filters.category);
        if (filters?.sku) query = query.where('sku', '==', filters.sku);
        if (filters?.isActive !== undefined) query = query.where('isActive', '==', filters.isActive);

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getById(id: string) {
        const doc = await collection.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    },

    async update(id: string, data: Partial<InventoryItem>) {
        const docRef = collection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) throw new Error('Item not found');

        if (data.sku) {
            const snapshot = await collection.where('sku', '==', data.sku).get();
            if (!snapshot.empty && snapshot.docs[0].id !== id) {
                throw new Error('SKU already exists');
            }
        }

        await docRef.update({
            ...data,
            updatedAt: new Date(),
        });

        return { id, ...data };
    }
};
