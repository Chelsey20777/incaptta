'use client'

import { create } from 'zustand'
import { db, auth } from '@/lib/firebase'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  limit,
  runTransaction
} from 'firebase/firestore'
import { toast } from 'sonner'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  uom: string
  onHand: number
  isActive: boolean
  categoryId?: string
  categoryName?: string
  description?: string
  purchasePrice: number
  freightDuty: number
  totalCost: number
  markupPercent: number
  sellingPrice: number
  location?: string
  notes?: string
  updatedAt?: any
  updatedBy?: { uid: string; email: string }
  createdAt?: any
  createdBy?: { uid: string; email: string }
  reorderLevel?: number
}

export interface StockLedgerEntry {
  id: string
  inventoryItemId: string
  jobCardId?: string
  movementType: 'ISSUE' | 'RETURN' | 'ADJUST'
  qty: number
  unitCost?: number
  totalCost?: number
  postedAt: any
  postedByUid: string
  reference?: string
}

export interface InventoryFilter {
  search?: string
  isActive?: boolean
  lowStockOnly?: boolean
  uom?: string
  sortBy?: 'name' | 'onHand' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

interface InventoryState {
  items: InventoryItem[]
  selectedItem: InventoryItem | null
  categories: any[]
  movements: StockLedgerEntry[]
  loading: boolean
  error: string | null

  lowStockItems: () => InventoryItem[]
  totalValue: () => number

  fetchItems: (filters?: InventoryFilter) => Promise<void>
  fetchItem: (id: string) => Promise<void>
  createItem: (payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>, user: { uid: string; email: string }) => Promise<string>
  updateItem: (id: string, patch: Partial<InventoryItem>, user: { uid: string; email: string }) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  adjustStock: (id: string, adjustment: {
    type: 'ADD' | 'REMOVE' | 'SET'
    qty: number
    reason: string
    reference?: string
    unitCost?: number
    skipFinancials?: boolean
  }) => Promise<void>
  fetchCategories: () => Promise<void>
  getMovements: (inventoryItemId: string) => Promise<void>
}

const COLLECTION_NAME = 'inventoryItems'
const LEDGER_COLLECTION = 'stockLedger'

const normalizeInventoryItem = (docSnap: any): InventoryItem => {
  const data = docSnap.data()
  const purchasePrice = Number(data.purchasePrice ?? data.avgUnitCost ?? data.totalCost ?? 0)
  const freightDuty = Number(data.freightDuty ?? 0)
  const totalCost = Number(data.totalCost ?? (purchasePrice + freightDuty))
  const markupPercent = Number(data.markupPercent ?? 0)
  const sellingPrice = Number(data.sellingPrice ?? (totalCost * (1 + markupPercent / 100)))

  return {
    id: docSnap.id,
    sku: data.sku || '',
    name: data.name || data.itemName || '',
    uom: data.uom || 'PCS',
    onHand: Number(data.onHand ?? data.inStock ?? 0),
    isActive: data.isActive !== false,
    categoryId: data.categoryId || '',
    categoryName: data.categoryName || '',
    purchasePrice,
    freightDuty,
    totalCost,
    markupPercent,
    sellingPrice,
    location: data.location || '',
    notes: data.notes || data.description || '',
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
    createdAt: data.createdAt,
    createdBy: data.createdBy,
    reorderLevel: data.reorderLevel !== undefined ? Number(data.reorderLevel) : undefined
  }
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  selectedItem: null,
  categories: [],
  movements: [],
  loading: false,
  error: null,

  lowStockItems: () => {
    return get().items.filter(item => item.reorderLevel !== undefined && item.onHand <= item.reorderLevel)
  },

  totalValue: () => {
    return get().items.reduce((total, item) => total + (item.onHand * (item.sellingPrice || 0)), 0)
  },

  fetchItems: async (filters = {}) => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, COLLECTION_NAME))
      const snapshot = await getDocs(q)
      let itemsList = snapshot.docs.map(normalizeInventoryItem)

      if (filters.isActive !== undefined) {
        itemsList = itemsList.filter(i => i.isActive === filters.isActive)
      }

      if (filters.search) {
        const s = filters.search.toLowerCase()
        itemsList = itemsList.filter(i =>
          i.name.toLowerCase().includes(s) ||
          i.sku.toLowerCase().includes(s)
        )
      }

      if (filters.lowStockOnly) {
        itemsList = itemsList.filter(i => (i.reorderLevel !== undefined && i.onHand <= i.reorderLevel))
      }

      if (filters.uom) {
        itemsList = itemsList.filter(i => i.uom === filters.uom)
      }

      itemsList.sort((a, b) => {
        const dateA = a.updatedAt?.toMillis?.() || 0
        const dateB = b.updatedAt?.toMillis?.() || 0
        return dateB - dateA
      })

      set({ items: itemsList })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch inventory:', err)
    } finally {
      set({ loading: false })
    }
  },

  fetchItem: async (id) => {
    set({ loading: true, error: null })
    try {
      const docRef = doc(db, COLLECTION_NAME, id)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        set({ selectedItem: normalizeInventoryItem(snap) })
      } else {
        set({ selectedItem: null })
      }
    } catch (err: any) {
      set({ error: err.message })
      console.error('Failed to fetch inventory item:', err)
    } finally {
      set({ loading: false })
    }
  },

  createItem: async (payload, user) => {
    set({ loading: true, error: null })
    try {
      const q = query(collection(db, COLLECTION_NAME), where('sku', '==', payload.sku), limit(1))
      const snap = await getDocs(q)
      if (!snap.empty) {
        throw new Error(`SKU ${payload.sku} already exists.`)
      }

      const itemPayload = {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user,
        updatedBy: user
      }
      
      const docRef = await addDoc(collection(db, COLLECTION_NAME), itemPayload)
      await get().fetchItems()
      return docRef.id
    } catch (err: any) {
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  updateItem: async (id, patch, user) => {
    set({ loading: true, error: null })
    try {
      const docRef = doc(db, COLLECTION_NAME, id)
      const payload = {
        ...patch,
        updatedAt: serverTimestamp(),
        updatedBy: user
      }
      delete (payload as any).id
      await updateDoc(docRef, payload)
      
      if (get().selectedItem?.id === id) {
        await get().fetchItem(id)
      }
      await get().fetchItems()
    } catch (err: any) {
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  deleteItem: async (id) => {
    set({ loading: true, error: null })
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id))
      await get().fetchItems()
    } catch (err: any) {
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  adjustStock: async (id, adjustment) => {
    set({ loading: true, error: null })
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Authentication required')

      const itemRef = doc(db, COLLECTION_NAME, id)
      const ledgerRef = doc(collection(db, LEDGER_COLLECTION))

      if (adjustment.type === 'SET') {
        await runTransaction(db, async (transaction) => {
          const itemSnap = await transaction.get(itemRef)
          if (!itemSnap.exists()) {
            throw new Error(`Inventory item ${id} does not exist.`)
          }
          const data = itemSnap.data()
          const currentOnHand = Number(data.onHand ?? data.inStock ?? 0)
          const newOnHand = adjustment.qty
          const qtyChange = newOnHand - currentOnHand

          if (qtyChange !== 0) {
            transaction.update(itemRef, {
              onHand: newOnHand,
              updatedAt: serverTimestamp()
            })

            transaction.set(ledgerRef, {
              inventoryItemId: id,
              movementType: 'ADJUST',
              qty: qtyChange,
              reason: adjustment.reason || 'Stock Take',
              reference: adjustment.reference || 'Stock Take CSV Sync',
              unitCost: adjustment.unitCost || 0,
              totalCost: (adjustment.unitCost || 0) * qtyChange,
              postedAt: serverTimestamp(),
              postedByUid: user.uid
            })
          }
        })
      } else {
        await runTransaction(db, async (transaction) => {
          const itemSnap = await transaction.get(itemRef)
          if (!itemSnap.exists()) {
            throw new Error(`Inventory item ${id} does not exist.`)
          }

          const data = itemSnap.data()
          const currentOnHand = Number(data.onHand ?? data.inStock ?? 0)
          
          let qtyChange = 0
          if (adjustment.type === 'ADD') qtyChange = adjustment.qty
          else if (adjustment.type === 'REMOVE') qtyChange = -adjustment.qty

          const newOnHand = currentOnHand + qtyChange

          if (adjustment.type === 'REMOVE' && newOnHand < 0) {
            throw new Error(`Insufficient stock for ${data.name || data.itemName}. Available: ${currentOnHand}, Requested: ${adjustment.qty}`)
          }

          transaction.update(itemRef, {
            onHand: newOnHand,
            updatedAt: serverTimestamp()
          })

          if (!adjustment.skipFinancials) {
            transaction.set(ledgerRef, {
              inventoryItemId: id,
              movementType: 'ADJUST',
              qty: qtyChange,
              reason: adjustment.reason,
              reference: adjustment.reference || 'Manual Adjustment',
              unitCost: adjustment.unitCost || 0,
              totalCost: (adjustment.unitCost || 0) * qtyChange,
              postedAt: serverTimestamp(),
              postedByUid: user.uid
            })
          }

          if (qtyChange < 0 && !adjustment.skipFinancials) {
            const cogsRef = doc(collection(db, 'operationalExpenses'))
            const costAmount = Math.abs(qtyChange * (adjustment.unitCost || 0))
            
            if (costAmount > 0) {
              transaction.set(cogsRef, {
                type: 'COST_OF_SALES',
                description: `COGS: ${adjustment.reason} (Ref: ${adjustment.reference || 'Manual'})`,
                amount: costAmount,
                status: 'APPROVED',
                category: 'Cost of Sales',
                paymentMethod: 'INVENTORY',
                inventoryItemId: id,
                reference: adjustment.reference || 'Manual',
                createdAt: serverTimestamp(),
                approvedAt: serverTimestamp()
              })
            }
          }
        })
      }
      
      await get().fetchItems()
      if (get().selectedItem?.id === id) {
        await get().fetchItem(id)
      }
    } catch (err: any) {
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
    }
  },

  fetchCategories: async () => {
    try {
      let snapshot = await getDocs(collection(db, 'inventoryCategories'))
      if (snapshot.empty) {
        snapshot = await getDocs(collection(db, 'jobCategories'))
      }
      set({ categories: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) })
    } catch (err: any) {
      console.error('Error in fetchCategories:', err)
    }
  },

  getMovements: async (inventoryItemId) => {
    set({ loading: true, error: null })
    try {
      const q = query(
        collection(db, LEDGER_COLLECTION),
        where('inventoryItemId', '==', inventoryItemId),
        orderBy('postedAt', 'desc')
      )
      const snapshot = await getDocs(q)
      set({ movements: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockLedgerEntry)) })
    } catch (err: any) {
      set({ error: err.message })
      console.error('Error in getMovements:', err)
    } finally {
      set({ loading: false })
    }
  }
}))
