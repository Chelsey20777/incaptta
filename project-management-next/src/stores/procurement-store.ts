'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
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
  runTransaction,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore'
import type { Supplier, ProcurementLineItem, ProcurementRequisition, InventoryItemStatus } from '@/features/procurement/types'
import type { PurchaseOrder, POStatus, GoodsReceiptNote, SupplierInvoice, MatchStatus, InvoiceStatus } from '@/features/procurement/types/procurement'

interface ProcurementState {
  // State
  suppliers: Supplier[]
  requisitions: ProcurementRequisition[]
  purchaseOrders: PurchaseOrder[]
  grns: GoodsReceiptNote[]
  supplierInvoices: SupplierInvoice[]
  loadingSuppliers: boolean
  loadingRequisitions: boolean
  loadingPurchaseOrders: boolean
  loadingGrns: boolean
  loadingInvoices: boolean

  // Firestore listeners cleanup
  cleanupListeners: () => void

  // Suppliers
  fetchSuppliers: () => void
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>

  // Requisitions
  fetchRequisitions: () => void
  addRequisition: (data: Omit<ProcurementRequisition, 'id' | 'prNumber' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateRequisition: (id: string, data: Partial<ProcurementRequisition>) => Promise<void>
  deleteRequisition: (id: string) => Promise<void>
  generatePrNumber: () => Promise<string>

  // Purchase Orders
  fetchPurchaseOrders: () => void
  addPurchaseOrder: (data: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updatePurchaseOrder: (id: string, data: Partial<PurchaseOrder>) => Promise<void>
  generatePoNumber: () => Promise<string>

  // GRNs
  fetchGrns: () => void
  addGrn: (data: Omit<GoodsReceiptNote, 'id' | 'grnNumber' | 'createdAt' | 'updatedAt' | 'inventoryPostingStatus' | 'inventoryPostingError'>) => Promise<string>
  updateGrn: (id: string, data: Partial<GoodsReceiptNote>) => Promise<void>
  generateGrnNumber: () => Promise<string>

  // Supplier Invoices
  fetchSupplierInvoices: () => void
  addSupplierInvoice: (data: Omit<SupplierInvoice, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateSupplierInvoice: (id: string, data: Partial<SupplierInvoice>) => Promise<void>

  // Utility
  computeInvoiceMatch: (invoiceTotalAmount: number, expectedAmount: number) => {
    matchVariance: number
    matchVariancePercent: number
    matchStatus: MatchStatus
  }
  getAdHocItemsByJobCard: (jobCardId: string) => Array<{
    description: string
    qty: number
    unitPrice: number
    sourceType: 'PR' | 'PO'
    sourceNumber: string
    sourceId: string
  }>
}

// Internal listener refs
let suppliersUnsub: Unsubscribe | null = null
let requisitionsUnsub: Unsubscribe | null = null
let purchaseOrdersUnsub: Unsubscribe | null = null
let grnsUnsub: Unsubscribe | null = null
let invoicesUnsub: Unsubscribe | null = null

async function generateCounterNumber(counterName: string, prefix: string): Promise<string> {
  const counterRef = doc(db, 'systemCounters', counterName)
  const year = new Date().getFullYear()

  const newSequence = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef)
    let seq = 1
    if (counterSnap.exists()) {
      const data = counterSnap.data()
      if (data.currentYear === year) {
        seq = (data.lastSequence || 0) + 1
      }
    }
    transaction.set(counterRef, {
      currentYear: year,
      lastSequence: seq,
      lastUpdatedAt: serverTimestamp()
    })
    return seq
  })

  const padded = String(newSequence).padStart(4, '0')
  return `${prefix}-${year}-${padded}`
}

export const useProcurementStore = create<ProcurementState>((set, get) => ({
  // Initial State
  suppliers: [],
  requisitions: [],
  purchaseOrders: [],
  grns: [],
  supplierInvoices: [],
  loadingSuppliers: false,
  loadingRequisitions: false,
  loadingPurchaseOrders: false,
  loadingGrns: false,
  loadingInvoices: false,

  cleanupListeners: () => {
    if (suppliersUnsub) { suppliersUnsub(); suppliersUnsub = null }
    if (requisitionsUnsub) { requisitionsUnsub(); requisitionsUnsub = null }
    if (purchaseOrdersUnsub) { purchaseOrdersUnsub(); purchaseOrdersUnsub = null }
    if (grnsUnsub) { grnsUnsub(); grnsUnsub = null }
    if (invoicesUnsub) { invoicesUnsub(); invoicesUnsub = null }
  },

  // === SUPPLIERS ===
  fetchSuppliers: () => {
    if (suppliersUnsub) { suppliersUnsub(); suppliersUnsub = null }
    set({ loadingSuppliers: true })
    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'))
    suppliersUnsub = onSnapshot(q, (snapshot) => {
      set({
        suppliers: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)),
        loadingSuppliers: false
      })
    }, (error) => {
      console.error('Error fetching suppliers:', error)
      set({ loadingSuppliers: false })
    })
  },

  addSupplier: async (data) => {
    const docRef = await addDoc(collection(db, 'suppliers'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updateSupplier: async (id, data) => {
    await updateDoc(doc(db, 'suppliers', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  // === REQUISITIONS ===
  generatePrNumber: () => generateCounterNumber('prNumbers', 'PR'),

  fetchRequisitions: () => {
    set({ loadingRequisitions: true })
    const q = query(collection(db, 'procurementRequisitions'), orderBy('createdAt', 'desc'))
    requisitionsUnsub = onSnapshot(q, (snapshot) => {
      set({
        requisitions: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcurementRequisition)),
        loadingRequisitions: false
      })
    }, (error) => {
      console.error('Error fetching requisitions:', error)
      set({ loadingRequisitions: false })
    })
  },

  addRequisition: async (data) => {
    const prNumber = await get().generatePrNumber()
    const docRef = await addDoc(collection(db, 'procurementRequisitions'), {
      ...data,
      prNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updateRequisition: async (id, data) => {
    await updateDoc(doc(db, 'procurementRequisitions', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  deleteRequisition: async (id) => {
    const prRef = doc(db, 'procurementRequisitions', id)
    const prSnap = await getDoc(prRef)
    if (!prSnap.exists()) throw new Error('Requisition not found')
    const prData = prSnap.data()

    if (prData.linkedPoId) {
      throw new Error('Cannot delete requisition with a linked Purchase Order. Delete the PO first.')
    }

    // Cleanup NEW_PENDING inventory items
    const items = prData.items || []
    for (const item of items) {
      if (item.inventoryItemStatus === 'NEW_PENDING' && item.inventoryItemId) {
        const invRef = doc(db, 'inventoryItems', item.inventoryItemId)
        const invSnap = await getDoc(invRef)
        if (invSnap.exists() && invSnap.data().status === 'PENDING_GRN') {
          await deleteDoc(invRef)
        }
      }
    }

    // Clear job card links
    if (prData.jobCardId) {
      const jcRef = doc(db, 'jobCards', prData.jobCardId)
      const jcSnap = await getDoc(jcRef)
      if (jcSnap.exists()) {
        const jcData = jcSnap.data()
        const sections = (jcData.requisitionSections ?? []).map((section: any) => ({
          ...section,
          items: (section.items ?? []).map((item: any) =>
            item.linkedPrId === id
              ? { ...item, linkedPrId: null, linkedPrStatus: null, stockAtSnapshot: null, linkedPoId: null }
              : item
          )
        }))
        const flatItems = (jcData.requisitionItems ?? []).map((item: any) =>
          item.linkedPrId === id
            ? { ...item, linkedPrId: null, linkedPrStatus: null, stockAtSnapshot: null, linkedPoId: null }
            : item
        )
        await updateDoc(jcRef, {
          requisitionSections: sections,
          requisitionItems: flatItems,
          updatedAt: serverTimestamp()
        })
      }
    }

    await deleteDoc(prRef)
  },

  // === PURCHASE ORDERS ===
  generatePoNumber: () => generateCounterNumber('poNumbers', 'PO'),

  fetchPurchaseOrders: () => {
    if (purchaseOrdersUnsub) return
    set({ loadingPurchaseOrders: true })
    purchaseOrdersUnsub = onSnapshot(
      query(collection(db, 'procurementPurchaseOrders'), orderBy('createdAt', 'desc')),
      (snap) => {
        set({
          purchaseOrders: snap.docs.map(d => ({ id: d.id, ...d.data() }) as PurchaseOrder),
          loadingPurchaseOrders: false
        })
      },
      (error) => {
        console.error('PO listener error:', error)
        set({ loadingPurchaseOrders: false })
      }
    )
  },

  addPurchaseOrder: async (data) => {
    const poNumber = await get().generatePoNumber()
    const docRef = await addDoc(collection(db, 'procurementPurchaseOrders'), {
      ...data,
      poNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updatePurchaseOrder: async (id, data) => {
    await updateDoc(doc(db, 'procurementPurchaseOrders', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  // === GOODS RECEIPT NOTES ===
  generateGrnNumber: () => generateCounterNumber('grnNumbers', 'GRN'),

  fetchGrns: () => {
    if (grnsUnsub) return
    set({ loadingGrns: true })
    grnsUnsub = onSnapshot(
      query(collection(db, 'procurementGrns'), orderBy('createdAt', 'desc')),
      (snap) => {
        set({
          grns: snap.docs.map(d => ({ id: d.id, ...d.data() }) as GoodsReceiptNote),
          loadingGrns: false
        })
      },
      (error) => {
        console.error('GRN listener error:', error)
        set({ loadingGrns: false })
      }
    )
  },

  addGrn: async (data) => {
    const grnNumber = await get().generateGrnNumber()
    const docRef = await addDoc(collection(db, 'procurementGrns'), {
      ...data,
      grnNumber,
      inventoryPostingStatus: 'PENDING',
      inventoryPostingError: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    return docRef.id
  },

  updateGrn: async (id, data) => {
    const grnRef = doc(db, 'procurementGrns', id)
    await updateDoc(grnRef, {
      ...data,
      updatedAt: serverTimestamp()
    })

  },

  // === SUPPLIER INVOICES ===
  fetchSupplierInvoices: () => {
    if (invoicesUnsub) return
    set({ loadingInvoices: true })
    invoicesUnsub = onSnapshot(
      query(collection(db, 'procurementSupplierInvoices'), orderBy('createdAt', 'desc')),
      (snap) => {
        set({
          supplierInvoices: snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupplierInvoice),
          loadingInvoices: false
        })
      },
      (error) => {
        console.error('Invoice listener error:', error)
        set({ loadingInvoices: false })
      }
    )
  },

  addSupplierInvoice: async (data) => {
    const docRef = await addDoc(collection(db, 'procurementSupplierInvoices'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updateSupplierInvoice: async (id, data) => {
    await updateDoc(doc(db, 'procurementSupplierInvoices', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  // === UTILITY ===
  computeInvoiceMatch: (invoiceTotalAmount, expectedAmount) => {
    const matchVariance = invoiceTotalAmount - expectedAmount
    const matchVariancePercent = expectedAmount > 0
      ? Math.abs(matchVariance / expectedAmount * 100)
      : 0

    let matchStatus: MatchStatus
    if (matchVariancePercent === 0) {
      matchStatus = 'MATCHED'
    } else if (matchVariancePercent <= 10) {
      matchStatus = 'VARIANCE_WITHIN_THRESHOLD'
    } else {
      matchStatus = 'VARIANCE_EXCEEDED'
    }

    return { matchVariance, matchVariancePercent, matchStatus }
  },

  getAdHocItemsByJobCard: (jobCardId) => {
    const items: Array<{
      description: string
      qty: number
      unitPrice: number
      sourceType: 'PR' | 'PO'
      sourceNumber: string
      sourceId: string
    }> = []

    const state = get()
    state.requisitions
      .filter(r => r.jobCardId === jobCardId)
      .forEach(r => {
        r.items.forEach(item => {
          if (item.inventoryItemStatus === 'ADHOC') {
            items.push({
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitCostPrice,
              sourceType: 'PR',
              sourceNumber: r.id.substring(0, 8),
              sourceId: r.id
            })
          }
        })
      })

state.purchaseOrders
      .filter(po => po.jobCardId === jobCardId)
      .forEach(po => {
        po.items.forEach((item: ProcurementLineItem) => {
          if (item.inventoryItemStatus === 'ADHOC') {
            items.push({
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitCostPrice,
              sourceType: 'PO',
              sourceNumber: po.poNumber,
              sourceId: po.id
            })
          }
        })
      })

    return items
  }
}))
