import { db } from '@/lib/firebase'
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore'

export const jobCardExpensesApi = {
    subscribeToExpenses(jobCardId: string, callback: (expenses: any[]) => void) {
        const q = query(
            collection(db, 'jobCards', jobCardId, 'expenses'),
            orderBy('createdAt', 'asc')
        )

        return onSnapshot(q, (snapshot) => {
            const expenses = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            callback(expenses)
        })
    },

    async createExpense(jobCardId: string, payload: any) {
        const colRef = collection(db, 'jobCards', jobCardId, 'expenses')
        return await addDoc(colRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })
    },

    async updateExpense(jobCardId: string, expenseId: string, patch: any) {
        const docRef = doc(db, 'jobCards', jobCardId, 'expenses', expenseId)
        return await updateDoc(docRef, {
            ...patch,
            updatedAt: serverTimestamp()
        })
    },

    async deleteExpense(jobCardId: string, expenseId: string) {
        const docRef = doc(db, 'jobCards', jobCardId, 'expenses', expenseId)
        return await deleteDoc(docRef)
    }
}
