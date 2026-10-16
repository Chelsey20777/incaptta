import { db } from '../config/firebase';
import { ExpenseLedgerEntry, ExpenseLedgerStatus } from '../models/expenseLedger.model';
import * as admin from 'firebase-admin';

const getCollection = () => db.collection('expenseLedger');

export const ExpenseLedgerService = {
    async getById(id: string) {
        const doc = await getCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as ExpenseLedgerEntry & { id: string };
    },

    async query(filters: { jrId?: string; status?: ExpenseLedgerStatus }) {
        let query: admin.firestore.Query = getCollection();

        if (filters.jrId) query = query.where('jrId', '==', filters.jrId);
        if (filters.status) query = query.where('status', '==', filters.status);

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async markPaid(id: string, userId: string, paymentRef?: string) {
        return db.runTransaction(async (transaction) => {
            const docRef = getCollection().doc(id);
            const doc = await transaction.get(docRef);

            if (!doc.exists) throw new Error('Ledger entry not found');
            const data = doc.data() as ExpenseLedgerEntry;

            if (data.status !== 'ACCRUED') {
                throw new Error(`Cannot pay an item with status: ${data.status}`);
            }

            transaction.update(docRef, {
                status: 'PAID',
                payment: {
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    paidByUserId: userId,
                    paymentRef,
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return { id, status: 'PAID' };
        });
    }
};
