import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db, auth } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, getDoc, increment, writeBatch, where
} from 'firebase/firestore'
import type { InventoryItem, StockAdjustment } from '../types'

export const useInventoryStore = defineStore('inventory', () => {
  const inventoryItems = ref<InventoryItem[]>([])
  const stockMovements = ref<any[]>([])
  const loading = ref(false)
  const currentItem = ref<InventoryItem | null>(null)
  const error = ref<string | null>(null)

  let unsubItems: (() => void) | null = null
  let unsubMovements: (() => void) | null = null

  const lowStockItems = computed(() =>
    inventoryItems.value.filter(item => item.currentStock <= item.minimumStock)
  )

  const outOfStockItems = computed(() =>
    inventoryItems.value.filter(item => item.currentStock <= 0)
  )

  const activeItems = computed(() =>
    inventoryItems.value.filter(item => item.isActive !== false)
  )

  const normalizeItem = (id: string, data: any): InventoryItem => {
    const purchasePrice = Number(data.purchasePrice ?? data.avgUnitCost ?? 0)
    const freightDuty = Number(data.freightDuty ?? 0)
    const totalCost = Number(data.totalCost ?? (purchasePrice + freightDuty))
    const twidMarkupPercent = Number(data.twidMarkupPercent ?? data.markupPercent ?? 0)
    const sellingPrice = Number(data.sellingPrice ?? (totalCost * (1 + twidMarkupPercent / 100)))

    return {
      id,
      itemCode: data.itemCode || data.sku || '',
      itemName: data.itemName || data.name || '',
      description: data.description || data.notes || '',
      category: data.category || data.categoryName || '',
      unit: data.unit || data.uom || 'PCS',
      purchasePrice,
      freightDuty,
      totalCost,
      sellingPrice,
      twidMarkupPercent,
      currentStock: Number(data.currentStock ?? data.onHand ?? data.inStock ?? 0),
      minimumStock: Number(data.minimumStock ?? data.reorderLevel ?? 0),
      location: data.location || '',
      supplier: data.supplier || '',
      isActive: data.isActive !== false,
      lastStockUpdate: data.lastStockUpdate,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    } as InventoryItem
  }

  const fetchItems = () => {
    loading.value = true
    const q = query(collection(db, 'inventoryItems'), orderBy('updatedAt', 'desc'))

    unsubItems = onSnapshot(q, (snapshot) => {
      inventoryItems.value = snapshot.docs.map(doc => normalizeItem(doc.id, doc.data()))
      loading.value = false
    }, (err) => {
      console.error('[InventoryStore] Fetch error:', err)
      error.value = err.message
      loading.value = false
    })
  }

  const fetchMovements = (itemId: string) => {
    const q = query(
      collection(db, 'stockLedger'), 
      where('inventoryItemId', '==', itemId),
      orderBy('postedAt', 'desc')
    )
    unsubMovements = onSnapshot(q, (snapshot) => {
      stockMovements.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    })
  }

  const setCurrentItem = (item: InventoryItem | null) => {
    currentItem.value = item
  }

  const adjustStock = async (id: string, quantity: number, type: 'ADD' | 'REMOVE', reason: string) => {
    const user = auth.currentUser
    if (!user) throw new Error('Auth required')

    const batch = writeBatch(db)
    const itemRef = doc(db, 'inventoryItems', id)
    const ledgerRef = doc(collection(db, 'stockLedger'))

    const qtyChange = type === 'ADD' ? quantity : -quantity

    batch.update(itemRef, {
      onHand: increment(qtyChange),
      updatedAt: serverTimestamp(),
      updatedBy: { uid: user.uid, email: user.email }
    })

    batch.set(ledgerRef, {
      inventoryItemId: id,
      movementType: 'ADJUST',
      qty: qtyChange,
      reason,
      reference: 'Mobile App Adjustment',
      postedAt: serverTimestamp(),
      postedByUid: user.uid
    })

    await batch.commit()
  }

  const cleanup = () => {
    unsubItems?.()
    unsubMovements?.()
  }

  onUnmounted(cleanup)

  return {
    inventoryItems,
    stockMovements,
    loading,
    error,
    currentItem,
    lowStockItems,
    outOfStockItems,
    activeItems,
    fetchItems,
    fetchMovements,
    setCurrentItem,
    adjustStock,
    cleanup
  }
})
