import { db } from '../config/firebase';
import { Client } from '../models/client.model';

const collection = db.collection('clients');

export const ClientService = {
    async create(data: Client) {
        const docRef = await collection.add({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return { id: docRef.id, ...data };
    },

    async getAll() {
        const snapshot = await collection.where('isActive', '==', true).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getById(id: string) {
        const doc = await collection.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    },

    async update(id: string, data: Partial<Client>) {
        const docRef = collection.doc(id);
        await docRef.update({
            ...data,
            updatedAt: new Date(),
        });
        return { id, ...data };
    }
};
