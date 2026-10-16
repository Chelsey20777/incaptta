import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs } from 'firebase/firestore'

export const useInventoryStore = defineStore('inventory', () => {
    const items = ref<any[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    const lowStockItems = computed(() =>
        items.value.filter(item => item.reorderLevel !== undefined && item.onHand <= item.reorderLevel)
    )

    const totalValue = computed(() =>
        items.value.reduce((total, item) => total + (item.onHand * (item.sellingPrice || 0)), 0)
    )

    const normalizeInventoryItem = (doc: any) => {
        const data = doc.data();
        const purchasePrice = Number(data.purchasePrice ?? data.avgUnitCost ?? data.totalCost ?? 0);
        const freightDuty = Number(data.freightDuty ?? 0);
        const totalCost = Number(data.totalCost ?? (purchasePrice + freightDuty));
        const markupPercent = Number(data.markupPercent ?? 0);
        const sellingPrice = Number(data.sellingPrice ?? (totalCost * (1 + markupPercent / 100)));

        return {
            id: doc.id,
            onHand: Number(data.onHand ?? data.inStock ?? 0),
            sellingPrice,
            reorderLevel: data.reorderLevel !== undefined ? Number(data.reorderLevel) : undefined,
            ...data
        }
    }

    async function fetchItems() {
        loading.value = true
        error.value = null
        try {
            const q = query(collection(db, 'inventoryItems'))
            const snapshot = await getDocs(q)
            items.value = snapshot.docs.map(normalizeInventoryItem)
        } catch (err: any) {
            error.value = err.message
            console.error('[InventoryStore] Failed to fetch inventory:', err)
        } finally {
            loading.value = false
        }
    }

    return {
        items,
        loading,
        error,
        lowStockItems,
        totalValue,
        fetchItems
    }
})
