import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore'

export const useAccountingStore = defineStore('accounting', () => {
  const inventoryValue = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInventoryValuation() {
    loading.value = true
    try {
      const snapshot = await getDocs(collection(db, 'inventoryItems'))
      let total = 0
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const qty = Number(data.onHand ?? data.inStock ?? 0)
        const cost = Number(data.totalCost ?? data.purchasePrice ?? 0)
        total += qty * cost
      })
      inventoryValue.value = total
    } catch (err: any) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  return {
    inventoryValue,
    loading,
    error,
    fetchInventoryValuation
  }
})
