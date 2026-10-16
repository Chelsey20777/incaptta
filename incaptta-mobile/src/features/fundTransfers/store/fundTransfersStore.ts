import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy
} from 'firebase/firestore'
import type { FundTransfer, AccountBalance } from '../types'

export const useFundTransfersStore = defineStore('fundTransfers', () => {
  const transfers = ref<FundTransfer[]>([])
  const accountBalances = ref<AccountBalance[]>([])
  const loading = ref(false)
  const currentTransfer = ref<FundTransfer | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const pendingTransfers = computed(() =>
    transfers.value.filter(t => [
      'PENDING_ACCOUNTANT', 
      'PENDING_MANAGER'
    ].includes(t.status))
  )

  const completedTransfers = computed(() =>
    transfers.value.filter(t => t.status === 'COMPLETED')
  )

  const totalTransferred = computed(() =>
    transfers.value
      .filter(t => t.status === 'COMPLETED')
      .reduce((sum, t) => sum + (t.amount || 0), 0)
  )

  const fetchTransfers = () => {
    loading.value = true
    const q = query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      transfers.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FundTransfer[]
      loading.value = false
    }, (err) => {
      console.error('[TransfersStore] Fetch error:', err)
      error.value = err.message
      loading.value = false
    })
  }

  const setCurrentTransfer = (transfer: FundTransfer | null) => {
    currentTransfer.value = transfer
  }

  const initiateTransfer = async (data: Partial<FundTransfer>, initiatedBy: { name: string; email: string }) => {
    try {
      const payload = {
        ...data,
        status: 'PENDING_ACCOUNTANT',
        initiatedBy: initiatedBy.name || initiatedBy.email,
        initiatedByEmail: initiatedBy.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, 'fundTransfers'), payload)
      return docRef.id
    } catch (err) {
      console.error('[TransfersStore] Error initiating transfer:', err)
      throw err
    }
  }

  const handleApproval = async (id: string, currentStatus: string, role: string, userName: string) => {
    const docRef = doc(db, 'fundTransfers', id)
    let nextStatus = currentStatus
    const isSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'

    if (currentStatus === 'PENDING_ACCOUNTANT' && (isSuper || role === 'ACCOUNTANT')) {
      nextStatus = 'PENDING_MANAGER'
    } else if (currentStatus === 'PENDING_MANAGER' && (isSuper || role === 'MANAGER')) {
      nextStatus = 'COMPLETED'
    }

    if (nextStatus !== currentStatus) {
      const updateData: any = {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }

      if (nextStatus === 'PENDING_MANAGER') {
        updateData.accountantInitialedBy = userName
        updateData.accountantInitialedAt = serverTimestamp()
      } else {
        updateData.managerApprovedBy = userName
        updateData.managerApprovedAt = serverTimestamp()
      }

      await updateDoc(docRef, updateData)
    }
  }

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  onUnmounted(cleanup)

  const recordTopUp = async (data: Partial<FundTransfer>, userId: string, userEmail: string) => {
    try {
      const payload = {
        ...data,
        status: 'PENDING_ACCOUNTANT',
        requestedBy: userEmail,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'ledgerTopUps'), payload)
    } catch (err) {
      console.error('[TransfersStore] Error recording top-up:', err)
      throw err
    }
  }

  const cancelTransfer = async (id: string, userName: string, userEmail: string) => {
    try {
      const docRef = doc(db, 'fundTransfers', id)
      await updateDoc(docRef, {
        status: 'CANCELLED',
        cancelledBy: userName,
        cancelledByEmail: userEmail,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[TransfersStore] Error cancelling transfer:', err)
      throw err
    }
  }

  return {
    transfers,
    accountBalances,
    loading,
    error,
    currentTransfer,
    pendingTransfers,
    completedTransfers,
    totalTransferred,
    fetchTransfers,
    setCurrentTransfer,
    initiateTransfer,
    recordTopUp,
    handleApproval,
    cancelTransfer,
    cleanup
  }
})
