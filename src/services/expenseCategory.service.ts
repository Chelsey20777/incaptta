import { db } from '../config/firebase';
import { ExpenseCategory } from '../models/expenseCategory.model';
import * as admin from 'firebase-admin';

const getCollection = () => db.collection('expenseCategories');

export const ExpenseCategoryService = {
    async create(data: ExpenseCategory) {
        const docRef = await getCollection().add({
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id: docRef.id, ...data };
    },

    async getAll(activeOnly = false) {
        let query: FirebaseFirestore.Query = getCollection();
        if (activeOnly) {
            query = query.where('isActive', '==', true);
        }
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async getById(id: string) {
        const doc = await getCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    },

    async update(id: string, data: Partial<ExpenseCategory>) {
        const docRef = getCollection().doc(id);
        await docRef.update({
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, ...data };
    }
};
