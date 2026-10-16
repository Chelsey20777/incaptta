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
} from 'firebase/firestore'
import { toast } from 'sonner'

export interface InventoryItem {
  id: string
  sku: string
  name: string
  uom: string
  onHand: number
  reserved?: number
  available?: number
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
  categoriesLoading: boolean
  categoriesError: string | null
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
    requestId?: string
    deferRefresh?: boolean
  }) => Promise<void>
  fetchCategories: () => Promise<void>
  renameCategory: (oldName: string, newName: string) => Promise<{ categoriesUpdated: number; itemsUpdated: number }>
  getMovements: (inventoryItemId: string) => Promise<void>
}

const COLLECTION_NAME = 'inventoryItems'
const LEDGER_COLLECTION = 'stockLedger'

const REQUIRED_TEXT_FIELDS = ['sku', 'name', 'categoryId', 'uom'] as const
const NON_NEGATIVE_NUMBER_FIELDS = [
  'onHand',
  'purchasePrice',
  'freightDuty',
  'totalCost',
  'markupPercent',
  'sellingPrice',
  'reorderLevel',
] as const

function validateInventoryValues<T extends Partial<InventoryItem>>(values: T, requireAllFields = false): T {
  const validated = { ...values }

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (requireAllFields || Object.prototype.hasOwnProperty.call(validated, field)) {
      const value = String(validated[field] ?? '').trim()
      if (!value) throw new Error(`${field === 'categoryId' ? 'Category' : field.toUpperCase()} is required.`)
      ;(validated as Record<string, unknown>)[field] = value
    }
  }

  for (const field of NON_NEGATIVE_NUMBER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(validated, field)) continue
    const rawValue: unknown = validated[field]
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      throw new Error(`${field} must be a non-negative number.`)
    }
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a non-negative number.`)
    }
    ;(validated as Record<string, unknown>)[field] = value
  }

  if (Object.prototype.hasOwnProperty.call(validated, 'isActive') && typeof validated.isActive !== 'boolean') {
    throw new Error('Active status must be either active or inactive.')
  }

  return validated
}

async function ensureUniqueSku(sku: string, excludeId?: string): Promise<void> {
  const normalizedSku = sku.trim().toLowerCase()
  const snapshot = await getDocs(collection(db, COLLECTION_NAME))
  const duplicate = snapshot.docs.find((item) => (
    item.id !== excludeId && String(item.data().sku || '').trim().toLowerCase() === normalizedSku
  ))
  if (duplicate) throw new Error(`SKU ${sku.trim()} already exists.`)
}

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
    reserved: Number(data.reserved ?? 0),
    available: Number(data.onHand ?? data.inStock ?? 0) - Number(data.reserved ?? 0),
    isActive: data.isActive !== false,
    categoryId: data.categoryId || '',
    categoryName: data.categoryName || '',
    description: data.description || '',
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
  categoriesLoading: false,
  categoriesError: null,
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
      const validated = validateInventoryValues(payload, true)
      await ensureUniqueSku(validated.sku!)

      const initialOnHand = Number(validated.onHand || 0)
      const itemPayload = {
        ...validated,
        onHand: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user,
        updatedBy: user
      }
      
      const docRef = await addDoc(collection(db, COLLECTION_NAME), itemPayload)
      if (initialOnHand > 0) {
        await get().adjustStock(docRef.id, {
          type: 'ADD', qty: initialOnHand, reason: 'Initial stock balance',
          reference: `Inventory item ${validated.sku}`,
          unitCost: Number(validated.totalCost || validated.purchasePrice || 0), skipFinancials: true,
        })
      }
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
      if (Object.prototype.hasOwnProperty.call(patch, 'onHand')) {
        throw new Error('Stock quantity cannot be changed through item editing. Use a controlled stock adjustment.')
      }
      const validated = validateInventoryValues(patch)
      if (validated.sku !== undefined) await ensureUniqueSku(validated.sku, id)
      const payload = {
        ...validated,
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

      const token = await user.getIdToken()
      const response = await fetch(`/api/inventory/${encodeURIComponent(id)}/adjust`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adjustment, requestId: adjustment.requestId ?? crypto.randomUUID() }),
      })
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null
      if (!response.ok) {
        throw new Error(body?.error || body?.message || `Inventory adjustment failed (${response.status})`)
      }
      
      if (!adjustment.deferRefresh) await get().fetchItems()
      if (!adjustment.deferRefresh && get().selectedItem?.id === id) {
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
    set({ categoriesLoading: true, categoriesError: null })
    try {
      const snapshot = await getDocs(query(collection(db, 'inventoryCategories'), orderBy('name')))
      set({ categories: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) })
    } catch (err: any) {
      console.error('Error in fetchCategories:', err)
      const message = err.code === 'permission-denied'
        ? 'You do not have permission to load inventory categories.'
        : err.message || 'Inventory categories could not be loaded.'
      set({ categories: [], categoriesError: message })
      toast.error('Inventory Categories Failed', { description: message })
    } finally {
      set({ categoriesLoading: false })
    }
  },

  renameCategory: async (oldName, newName) => {
    set({ loading: true, error: null })
    try {
      const oldLower = oldName.trim().toLowerCase()
      const newTrimmed = newName.trim()
      if (!oldLower || !newTrimmed) {
        throw new Error('Both old and new category names are required')
      }

      const catSnap = await getDocs(collection(db, 'inventoryCategories'))
      let categoriesUpdated = 0
      for (const d of catSnap.docs) {
        const name = String(d.data().name || '')
        if (name.toLowerCase() === oldLower) {
          await updateDoc(doc(db, 'inventoryCategories', d.id), {
            name: newTrimmed,
            updatedAt: serverTimestamp(),
          })
          categoriesUpdated++
        }
      }

      const itemsSnap = await getDocs(collection(db, COLLECTION_NAME))
      let itemsUpdated = 0
      let batch = writeBatch(db)
      let batchCount = 0

      for (const d of itemsSnap.docs) {
        const itemCategory = String(d.data().categoryName || '')
        if (itemCategory.toLowerCase() === oldLower) {
          batch.update(doc(db, COLLECTION_NAME, d.id), {
            categoryName: newTrimmed,
            updatedAt: serverTimestamp(),
          })
          itemsUpdated++
          batchCount++
          if (batchCount >= 500) {
            await batch.commit()
            batch = writeBatch(db)
            batchCount = 0
          }
        }
      }
      if (batchCount > 0) {
        await batch.commit()
      }

      await get().fetchCategories()
      await get().fetchItems()

      return { categoriesUpdated, itemsUpdated }
    } catch (err: any) {
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
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
