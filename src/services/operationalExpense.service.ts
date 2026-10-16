import { OperationalExpense, OperationalExpenseSchema } from '../models/operationalExpense.model';
import { NotificationService } from './notification.service';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

const getExpenseCollection = () => db.collection('operationalExpenses');
const getCounterDoc = () => db.collection('counters').doc('operationalExpenses');

export const OperationalExpenseService = {
    /**
     * Create a new Operational Expense with unique incremental number
     */
    async createExpense(payload: any, userId: string, userName: string) {
        return db.runTransaction(async (transaction) => {
            // 1. GENERATE EXPENSE NUMBER
            const counterRef = getCounterDoc();
            const counterDoc = await transaction.get(counterRef);

            let nextNumber = 1;
            if (counterDoc.exists) {
                nextNumber = (counterDoc.data()?.lastNumber || 0) + 1;
            }

            const expenseNumber = `EXP-${nextNumber.toString().padStart(5, '0')}`;

            // 2. FETCH CATEGORY
            const catRef = db.collection('expenseCategories').doc(payload.categoryId);
            const catDoc = await transaction.get(catRef);

            if (!catDoc.exists) throw new Error(`Expense Category ${payload.categoryId} not found`);
            const categoryName = catDoc.data()?.name;

            // 3. UPDATE COUNTER (Now safe to write)
            transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true });

            // 3. ASSEMBLE DATA
            const expenseData: OperationalExpense = {
                ...payload,
                expenseNumber,
                categoryName,
                status: 'DRAFT',
                createdBy: {
                    uid: userId,
                    name: userName
                },
                expenseDate: payload.expenseDate ? admin.firestore.Timestamp.fromDate(new Date(payload.expenseDate)) : admin.firestore.FieldValue.serverTimestamp()
            };

            // 4. VALIDATE
            const validated = OperationalExpenseSchema.parse(expenseData);

            const docRef = getExpenseCollection().doc();
            transaction.set(docRef, {
                ...validated,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Notify Managers about new Opex
            NotificationService.sendToRole('MANAGER', 'New Opex Entry', `Operational Expense ${expenseNumber} created by ${userName}.`, {
                expenseId: docRef.id,
                type: 'OPEX_CREATED'
            });

            return { id: docRef.id, expenseNumber };
        });
    },

    async getById(id: string) {
        const doc = await getExpenseCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as OperationalExpense & { id: string };
    },

    async query(filters: any) {
        let query: admin.firestore.Query = getExpenseCollection();
        // Filters can be added here
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
};
