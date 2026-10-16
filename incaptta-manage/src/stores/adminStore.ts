import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, auth } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

export const useAdminStore = defineStore('admin', () => {
    const appSettings = ref<any>({ logoUrl: '' })
    const loading = ref(false)
    const error = ref<string | null>(null)

    let subscriptions: (() => void)[] = []

    function fetchSettings() {
        if (!auth.currentUser) return
        subscriptions.push(onSnapshot(doc(db, 'appSettings', 'general'),
            (s) => {
                if (s.exists()) {
                    appSettings.value = { id: s.id, ...s.data() }
                }
            },
            (e) => {
                error.value = e.message
                console.error('[AdminStore] Error fetching settings:', e)
            }
        ))
    }

    function cleanup() {
        subscriptions.forEach(unsub => unsub())
        subscriptions = []
    }

    return {
        appSettings,
        loading,
        error,
        fetchSettings,
        cleanup
    }
})
