import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, where, orderBy } from 'firebase/firestore'

export const useCommissionsStore = defineStore('commissions', () => {
    const commissions = ref<any[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    let unsubscribe: (() => void) | null = null

    function fetchMyCommissions(userUid: string) {
        loading.value = true
        const q = query(
            collection(db, 'commissions'),
            where('salesRepUid', '==', userUid),
            orderBy('createdAt', 'desc')
        )

        unsubscribe = onSnapshot(q, (snapshot) => {
            commissions.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching commissions:', err)
            error.value = err.message
            loading.value = false
        })
    }

    function fetchAllCommissions() {
        loading.value = true
        const q = query(collection(db, 'commissions'), orderBy('createdAt', 'desc'))

        unsubscribe = onSnapshot(q, (snapshot) => {
            commissions.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching all commissions:', err)
            error.value = err.message
            loading.value = false
        })
    }

    function cleanup() {
        if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
        }
    }

    return {
        commissions,
        loading,
        error,
        fetchMyCommissions,
        fetchAllCommissions,
        cleanup
    }
})
