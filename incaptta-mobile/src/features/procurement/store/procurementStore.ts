import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, getDoc
} from 'firebase/firestore'
import type { ProcurementRequisition, PurchaseOrder } from '../types'

export const useProcurementStore = defineStore('procurement', () => {
  const requisitions = ref<ProcurementRequisition[]>([])
  const purchaseOrders = ref<PurchaseOrder[]>([])
  const loading = ref(false)
  const currentRequisition = ref<ProcurementRequisition | null>(null)
  const error = ref<string | null>(null)

  let unsubRequisitions: (() => void) | null = null
  let unsubPurchaseOrders: (() => void) | null = null

  const pendingRequisitions = computed(() =>
    requisitions.value.filter(r => r.status === 'SUBMITTED')
  )

  const approvedRequisitions = computed(() =>
    requisitions.value.filter(r => r.status === 'APPROVED')
  )

  const fetchRequisitions = () => {
    loading.value = true
    const q = query(collection(db, 'procurementRequisitions'), orderBy('createdAt', 'desc'))
    unsubRequisitions = onSnapshot(q, (snapshot) => {
      requisitions.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProcurementRequisition[]
      loading.value = false
    })
  }

  const fetchPurchaseOrders = () => {
    const q = query(collection(db, 'procurementPurchaseOrders'), orderBy('createdAt', 'desc'))
    unsubPurchaseOrders = onSnapshot(q, (snapshot) => {
      purchaseOrders.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PurchaseOrder[]
    })
  }

  const setCurrentRequisition = (requisition: ProcurementRequisition | null) => {
    currentRequisition.value = requisition
  }

  const addRequisition = async (data: Partial<ProcurementRequisition>, userId: string, userName: string) => {
    try {
      const payload = {
        ...data,
        status: 'SUBMITTED',
        createdBy: userId,
        requestedBy: userId,
        requestedByName: userName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      await addDoc(collection(db, 'procurementRequisitions'), payload)
    } catch (err) {
      console.error('[ProcurementStore] Error adding requisition:', err)
      throw err
    }
  }

  const updateRequisitionStatus = async (id: string, status: string) => {
    try {
      const docRef = doc(db, 'procurementRequisitions', id)
      await updateDoc(docRef, { status, updatedAt: serverTimestamp() })
    } catch (err) {
      console.error('[ProcurementStore] Error updating requisition:', err)
      throw err
    }
  }

  const cleanup = () => {
    unsubRequisitions?.()
    unsubPurchaseOrders?.()
  }

  onUnmounted(cleanup)

  return {
    requisitions,
    purchaseOrders,
    loading,
    error,
    currentRequisition,
    pendingRequisitions,
    approvedRequisitions,
    fetchRequisitions,
    fetchPurchaseOrders,
    setCurrentRequisition,
    addRequisition,
    updateRequisitionStatus,
    cleanup
  }
})
