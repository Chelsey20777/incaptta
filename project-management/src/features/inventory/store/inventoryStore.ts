import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { inventoryApi } from '../api/inventoryApi'
import type { InventoryItem, InventoryFilter } from '../types'
import { useSession } from '@/composables/useSession'

export const useInventoryStore = defineStore('inventory', () => {
    const items = ref<InventoryItem[]>([])
    const selectedItem = ref<InventoryItem | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const { user } = useSession()

    const lowStockItems = computed(() =>
        items.value.filter(item => item.reorderLevel !== undefined && item.onHand <= item.reorderLevel)
    )

    const totalValue = computed(() =>
        items.value.reduce((total, item) => total + (item.onHand * (item.sellingPrice || 0)), 0)
    )

    async function fetchItems(filters: InventoryFilter = {}) {
        loading.value = true
        error.value = null
        try {
            items.value = await inventoryApi.listInventory(filters)
        } catch (err: any) {
            error.value = err.message
            console.error('Failed to fetch inventory:', err)
        } finally {
            loading.value = false
        }
    }

    async function fetchItem(id: string) {
        loading.value = true
        error.value = null
        try {
            selectedItem.value = await inventoryApi.getInventoryItem(id)
        } catch (err: any) {
            error.value = err.message
            console.error('Failed to fetch inventory item:', err)
        } finally {
            loading.value = false
        }
    }

    async function createItem(payload: Omit<InventoryItem, 'id' | 'updatedAt' | 'createdAt'>) {
        if (!user.value) throw new Error('Authentication required')
        loading.value = true
        try {
            const id = await inventoryApi.createInventoryItem(payload, { uid: user.value.uid, email: user.value.email || '' })
            await fetchItems()
            return id
        } catch (err: any) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    async function updateItem(id: string, patch: Partial<InventoryItem>) {
        if (!user.value) throw new Error('Authentication required')
        loading.value = true
        try {
            await inventoryApi.updateInventoryItem(id, patch, { uid: user.value.uid, email: user.value.email || '' })
            if (selectedItem.value?.id === id) {
                await fetchItem(id)
            }
            await fetchItems()
        } catch (err: any) {
            error.value = err.message
            throw err
        } finally {
            loading.value = false
        }
    }

    return {
        items,
        selectedItem,
        loading,
        error,
        lowStockItems,
        totalValue,
        fetchItems,
        fetchItem,
        createItem,
        updateItem
    }
})
