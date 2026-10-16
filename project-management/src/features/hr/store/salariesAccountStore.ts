import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, where, Timestamp } from 'firebase/firestore'

export interface SalariesAccountTransaction {
    id?: string
    type: 'ACCUMULATION' | 'TRANSFER' | 'PAYMENT'
    source: 'STAFF_RATE' | 'PAYROLL_NET' | 'STATUTORY_LIABILITY' | 'FUND_TRANSFER'
    amount: number
    month: number
    year: number
    description: string
    referenceId: string
    createdAt: any
}

export const useSalariesAccountStore = defineStore('salariesAccount', () => {
    const transactions = ref<SalariesAccountTransaction[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    let unsub: (() => void) | null = null

    function fetchTransactions() {
        loading.value = true
        const q = query(collection(db, 'salariesAccountTransactions'), orderBy('createdAt', 'desc'))
        unsub = onSnapshot(q, (snap) => {
            transactions.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as SalariesAccountTransaction))
            loading.value = false
        })
    }

    async function recordTransaction(data: Omit<SalariesAccountTransaction, 'id' | 'createdAt'>) {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
            ...data,
            createdAt: serverTimestamp()
        })
    }

    function cleanup() {
        unsub?.()
    }

    onUnmounted(cleanup)

    return {
        transactions,
        loading,
        error,
        fetchTransactions,
        recordTransaction,
        cleanup
    }
})
