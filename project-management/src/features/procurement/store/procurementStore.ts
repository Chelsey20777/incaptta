import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  limit,
  getDocs,
  runTransaction
} from 'firebase/firestore'
import type { ProcurementType, ProcurementLineItem, ProcurementRequisition, InventoryItemStatus, Supplier } from '../types'
import type { PurchaseOrder, POStatus, GoodsReceiptNote, GRNLineItem, SupplierInvoice, MatchStatus } from '../types/procurement'

export const useProcurementStore = defineStore('procurement', () => {
  // State
  const suppliers = ref<Supplier[]>([])
  const requisitions = ref<ProcurementRequisition[]>([])
  const purchaseOrders = ref<PurchaseOrder[]>([])
  const grns = ref<GoodsReceiptNote[]>([])
  const loadingSuppliers = ref(false)
  const loadingRequisitions = ref(false)
  const loadingPurchaseOrders = ref(false)
  const loadingGrns = ref(false)
  let suppliersUnsubscribe: (() => void) | null = null
  let requisitionsUnsubscribe: (() => void) | null = null
  let purchaseOrdersUnsubscribe: (() => void) | null = null
  let grnsUnsubscribe: (() => void) | null = null
  const supplierInvoices = ref<SupplierInvoice[]>([])
  const loadingInvoices = ref(false)
  let invoicesUnsubscribe: (() => void) | null = null

  // Actions
  function fetchSuppliers() {
    if (suppliersUnsubscribe) {
      suppliersUnsubscribe()
      suppliersUnsubscribe = null
    }
    loadingSuppliers.value = true
    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'))

    suppliersUnsubscribe = onSnapshot(q, (snapshot) => {
      suppliers.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Supplier))
      loadingSuppliers.value = false
    }, (error) => {
      console.error('Error fetching suppliers:', error)
      loadingSuppliers.value = false
    })
  }

  async function addSupplier(data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'suppliers'), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error adding supplier:', error)
      throw error
    }
  }

  async function updateSupplier(id: string, data: Partial<Supplier>) {
    try {
      const supplierRef = doc(db, 'suppliers', id)
      await updateDoc(supplierRef, {
        ...data,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error updating supplier:', error)
      throw error
    }
  }

  function fetchRequisitions() {
    loadingRequisitions.value = true
    const q = query(collection(db, 'procurementRequisitions'), orderBy('createdAt', 'desc'))

    requisitionsUnsubscribe = onSnapshot(q, (snapshot) => {
      requisitions.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ProcurementRequisition))
      loadingRequisitions.value = false
    }, (error) => {
      console.error('Error fetching requisitions:', error)
      loadingRequisitions.value = false
    })
  }

  async function generatePrNumber(): Promise<string> {
    const counterRef = doc(db, 'systemCounters', 'prNumbers')
    const year = new Date().getFullYear()

    const newSequence = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef)
      let seq = 1

      if (counterSnap.exists()) {
        const data = counterSnap.data()
        if (data.currentYear === year) {
          seq = (data.lastSequence || 0) + 1  // same year: increment
        }
        // different year: seq stays 1 → resets automatically
      }

      transaction.set(counterRef, {
        currentYear: year,
        lastSequence: seq,
        lastUpdatedAt: serverTimestamp()
      })

      return seq
    })

    const padded = String(newSequence).padStart(4, '0')
    return `PR-${year}-${padded}`
  }

  async function generatePoNumber(): Promise<string> {
    const counterRef = doc(db, 'systemCounters', 'poNumbers')
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
    return `PO-${year}-${padded}`
  }

  async function generateGrnNumber(): Promise<string> {
    const counterRef = doc(db, 'systemCounters', 'grnNumbers')
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
    return `GRN-${year}-${padded}`
  }

  async function addRequisition(
    data: Omit<ProcurementRequisition, 'id' | 'prNumber' | 'createdAt' | 'updatedAt'>
  ) {
    try {
      const prNumber = await generatePrNumber()
      
      const docRef = await addDoc(collection(db, 'procurementRequisitions'), {
        ...data,
        prNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (error) {
      console.error('Error adding requisition:', error)
      throw error
    }
  }

  async function updateRequisition(id: string, data: Partial<ProcurementRequisition>) {
    try {
      const requisitionRef = doc(db, 'procurementRequisitions', id)
      await updateDoc(requisitionRef, {
        ...data,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error updating requisition:', error)
      throw error
    }
  }

  function fetchPurchaseOrders() {
    if (purchaseOrdersUnsubscribe) return
    loadingPurchaseOrders.value = true

    purchaseOrdersUnsubscribe = onSnapshot(
      query(
        collection(db, 'procurementPurchaseOrders'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        purchaseOrders.value = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as PurchaseOrder[]
        loadingPurchaseOrders.value = false
      },
      (error) => {
        console.error('PO listener error:', error)
        loadingPurchaseOrders.value = false
      }
    )
  }

  async function addPurchaseOrder(
    data: Omit<PurchaseOrder,
      'id' | 'poNumber' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const poNumber = await generatePoNumber()

    const docRef = await addDoc(
      collection(db, 'procurementPurchaseOrders'),
      {
        ...data,
        poNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    )

    return docRef.id
  }

  async function updatePurchaseOrder(
    id: string,
    data: Partial<PurchaseOrder>
  ): Promise<void> {
    const { doc: docFn, updateDoc, serverTimestamp } =
      await import('firebase/firestore')

    await updateDoc(
      docFn(db, 'procurementPurchaseOrders', id),
      {
        ...data,
        updatedAt: serverTimestamp()
      }
    )
  }

  function fetchGrns() {
    if (grnsUnsubscribe) return
    loadingGrns.value = true

    grnsUnsubscribe = onSnapshot(
      query(
        collection(db, 'procurementGrns'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        grns.value = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as GoodsReceiptNote[]
        loadingGrns.value = false
      },
      (error) => {
        console.error('GRN listener error:', error)
        loadingGrns.value = false
      }
    )
  }

  async function addGrn(
    data: Omit<GoodsReceiptNote,
      'id' | 'grnNumber' | 'createdAt' | 'updatedAt'
      | 'inventoryPostingStatus' | 'inventoryPostingError'>
  ): Promise<string> {
    const grnId = await generateGrnNumber()

    const { collection: colfn, addDoc: add, serverTimestamp: sts } =
      await import('firebase/firestore')

    const docRef = await add(
      colfn(db, 'procurementGrns'),
      {
        ...data,
        grnId, // Note: This was 'grnNumber' in the original but variable was grnNumber. Standardizing.
        grnNumber: grnId,
        inventoryPostingStatus: 'PENDING',
        inventoryPostingError: null,
        createdAt: sts(),
        updatedAt: sts()
      }
    )

    if (data.status === 'CONFIRMED') {
      await processGrnFulfillment(docRef.id, { ...data, id: docRef.id, grnNumber: grnId } as any)
    }

    return docRef.id
  }

  async function updateGrn(
    id: string,
    data: Partial<GoodsReceiptNote>
  ): Promise<void> {
    const { doc: docFn, updateDoc, serverTimestamp, getDoc } =
      await import('firebase/firestore')

    const grnRef = docFn(db, 'procurementGrns', id)
    await updateDoc(
      grnRef,
      {
        ...data,
        updatedAt: serverTimestamp()
      }
    )

    if (data.status === 'CONFIRMED') {
      const snap = await getDoc(grnRef)
      if (snap.exists()) {
        await processGrnFulfillment(id, { id: snap.id, ...snap.data() } as any)
      }
    }
  }

  async function processGrnFulfillment(grnId: string, grnData: GoodsReceiptNote) {
    const { doc: docFn, updateDoc, serverTimestamp } = await import('firebase/firestore')
    const grnRef = docFn(db, 'procurementGrns', grnId)
    
    try {
      // 1. Mark as processing
      await updateDoc(grnRef, { 
        inventoryPostingStatus: 'PROCESSING',
        updatedAt: serverTimestamp()
      })

      // 2. Identify items by type
      const adHocItems = (grnData.items as GRNLineItem[]).filter(item => item.inventoryItemStatus === 'ADHOC')
      const existingItems = (grnData.items as GRNLineItem[]).filter(item => item.inventoryItemStatus === 'EXISTING' && item.inventoryItemId)
      const newPendingItems = (grnData.items as GRNLineItem[]).filter(item => item.inventoryItemStatus === 'NEW_PENDING' && item.inventoryItemId)

      // 3. Sync Ad-Hoc items to Job Card
      if (grnData.jobCardId && adHocItems.length > 0) {
        const { useJobCardsStore } = await import('@/features/jobCards/store/jobCardsStore')
        const jobCardsStore = useJobCardsStore()
        
        for (const item of adHocItems) {
          await jobCardsStore.syncAdHocProcurementToJobCard(
            grnData.jobCardId,
            {
              description: item.description,
              quantity: item.qtyReceived,
              unitPrice: item.unitCostPrice
            },
            {
              grnId: grnData.id,
              grnNumber: grnData.grnNumber,
              poId: grnData.poId,
              poNumber: grnData.poNumber
            }
          )
        }
      }

      // 4. Update Stock for EXISTING items
      if (existingItems.length > 0) {
        const { inventoryApi } = await import('@/features/inventory/api/inventoryApi')
        
        for (const item of existingItems) {
          if (!item.inventoryItemId) continue
          
          await inventoryApi.adjustStock(item.inventoryItemId, {
            type: 'ADD',
            qty: item.qtyReceived,
            reason: `Received via GRN: ${grnData.grnNumber}`,
            reference: grnId,
            unitCost: item.unitCostPrice
          })
        }
      }

      // 5. Activate & stock NEW_PENDING placeholder items
      if (newPendingItems.length > 0) {
        const { inventoryApi } = await import('@/features/inventory/api/inventoryApi')
        const { doc: docFn2, updateDoc: updateDoc2, serverTimestamp: serverTimestamp2 } =
          await import('firebase/firestore')

        for (const item of newPendingItems) {
          if (!item.inventoryItemId) continue

          // a. Activate the placeholder inventory document
          await updateDoc2(docFn2(db, 'inventoryItems', item.inventoryItemId), {
            status: 'ACTIVE',
            isActive: true,
            updatedAt: serverTimestamp2()
          })

          // b. Add the received stock
          await inventoryApi.adjustStock(item.inventoryItemId, {
            type: 'ADD',
            qty: item.qtyReceived,
            reason: `New item received via GRN: ${grnData.grnNumber}`,
            reference: grnId,
            unitCost: item.unitCostPrice
          })
        }
      }

      // 5. Finalize Posting Status
      await updateDoc(grnRef, { 
        inventoryPostingStatus: 'COMPLETE',
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('GRN fulfillment error:', err)
      await updateDoc(grnRef, { 
        inventoryPostingStatus: 'FAILED',
        inventoryPostingError: err.message || String(err),
        updatedAt: serverTimestamp()
      })
    }
  }

  function fetchSupplierInvoices() {
    if (invoicesUnsubscribe) return
    loadingInvoices.value = true

    invoicesUnsubscribe = onSnapshot(
      query(
        collection(db, 'procurementSupplierInvoices'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        supplierInvoices.value = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as SupplierInvoice[]
        loadingInvoices.value = false
      },
      (error) => {
        console.error('Invoice listener error:', error)
        loadingInvoices.value = false
      }
    )
  }

  async function addSupplierInvoice(
    data: Omit<SupplierInvoice, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const { collection: col, addDoc: add, serverTimestamp: sts } =
      await import('firebase/firestore')

    const docRef = await add(
      col(db, 'procurementSupplierInvoices'),
      {
        ...data,
        createdAt: sts(),
        updatedAt: sts()
      }
    )

    return docRef.id
  }

  async function updateSupplierInvoice(
    id: string,
    data: Partial<SupplierInvoice>
  ): Promise<void> {
    const { doc: docFn, updateDoc: upd, serverTimestamp: sts } =
      await import('firebase/firestore')

    await upd(
      docFn(db, 'procurementSupplierInvoices', id),
      {
        ...data,
        updatedAt: sts()
      }
    )
  }

  function computeInvoiceMatch(
    invoiceTotalAmount: number,
    expectedAmount: number
  ): {
    matchVariance: number
    matchVariancePercent: number
    matchStatus: MatchStatus
  } {
    const matchVariance = invoiceTotalAmount - expectedAmount
    const matchVariancePercent =
      expectedAmount > 0
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
  }

  function cleanupListeners() {
    if (suppliersUnsubscribe) {
      suppliersUnsubscribe()
      suppliersUnsubscribe = null
    }
    if (requisitionsUnsubscribe) {
      requisitionsUnsubscribe()
      requisitionsUnsubscribe = null
    }
    if (purchaseOrdersUnsubscribe) {
      purchaseOrdersUnsubscribe()
      purchaseOrdersUnsubscribe = null
    }
    if (grnsUnsubscribe) {
      grnsUnsubscribe()
      grnsUnsubscribe = null
    }
    if (invoicesUnsubscribe) {
      invoicesUnsubscribe()
      invoicesUnsubscribe = null
    }
  }

  async function deleteRequisition(id: string) {
    const { getDoc, deleteDoc, doc: docFn, updateDoc, serverTimestamp } = await import('firebase/firestore')
    
    // 1. Get the PR doc
    const prRef = docFn(db, 'procurementRequisitions', id)
    const prSnap = await getDoc(prRef)
    
    if (!prSnap.exists()) throw new Error('Requisition not found')
    const prData = prSnap.data()
    
    // 2. Prevent deletion if PO is already linked
    if (prData.linkedPoId) {
      throw new Error('Cannot delete requisition with a linked Purchase Order. Delete the PO first.')
    }
    
    // 3. Cleanup NEW_PENDING inventory items
    const items = prData.items || []
    for (const item of items) {
      if (item.inventoryItemStatus === 'NEW_PENDING' && item.inventoryItemId) {
        const invRef = docFn(db, 'inventoryItems', item.inventoryItemId)
        const invSnap = await getDoc(invRef)
        if (invSnap.exists() && invSnap.data().status === 'PENDING_GRN') {
          await deleteDoc(invRef)
        }
      }
    }
    
    // 4. Clear job card links if applicable
    if (prData.jobCardId) {
      const jcRef = docFn(db, 'jobCards', prData.jobCardId)
      const jcSnap = await getDoc(jcRef)
      
      if (jcSnap.exists()) {
        const jcData = jcSnap.data()
        
        // Update requisitionSections (nested)
        const sections = (jcData.requisitionSections ?? []) as any[]
        const updatedSections = sections.map((section: any) => ({
          ...section,
          items: (section.items ?? []).map((item: any) => 
            item.linkedPrId === id 
              ? { ...item, linkedPrId: null, linkedPrStatus: null, stockAtSnapshot: null, linkedPoId: null }
              : item
          )
        }))
        
        // Update requisitionItems (flat)
        const flatItems = (jcData.requisitionItems ?? []) as any[]
        const updatedFlatItems = flatItems.map((item: any) => 
          item.linkedPrId === id 
            ? { ...item, linkedPrId: null, linkedPrStatus: null, stockAtSnapshot: null, linkedPoId: null }
            : item
        )
        
        await updateDoc(jcRef, {
          requisitionSections: updatedSections,
          requisitionItems: updatedFlatItems,
          updatedAt: serverTimestamp()
        })
      }
    }
    
    // 5. Delete the PR doc
    await deleteDoc(prRef)
  }

  function getAdHocItemsByJobCard(jobCardId: string) {
    const items: Array<{
      description: string
      qty: number
      unitPrice: number
      sourceType: 'PR' | 'PO'
      sourceNumber: string
      sourceId: string
    }> = []

    // 1. From Requisitions
    requisitions.value
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

    // 2. From Purchase Orders
    purchaseOrders.value
      .filter(po => po.jobCardId === jobCardId)
      .forEach(po => {
        po.items.forEach((item: any) => {
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

  return {
    // State
    suppliers,
    requisitions,
    purchaseOrders,
    grns,
    loadingSuppliers,
    loadingRequisitions,
    loadingPurchaseOrders,
    loadingGrns,
    
    // Actions
    fetchSuppliers,
    addSupplier,
    updateSupplier,
    fetchRequisitions,
    addRequisition,
    updateRequisition,
    fetchPurchaseOrders,
    addPurchaseOrder,
    updatePurchaseOrder,
    fetchGrns,
    addGrn,
    updateGrn,
    supplierInvoices,
    loadingInvoices,
    fetchSupplierInvoices,
    addSupplierInvoice,
    updateSupplierInvoice,
    computeInvoiceMatch,
    deleteRequisition,
    getAdHocItemsByJobCard,
    cleanupListeners
  }
})