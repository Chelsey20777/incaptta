import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, deleteDoc
} from 'firebase/firestore'
import type { OperationalExpense } from '../types'

export const useOperationalExpensesStore = defineStore('operationalExpenses', () => {
  const expenses = ref<OperationalExpense[]>([])
  const loading = ref(false)
  const currentExpense = ref<OperationalExpense | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const pendingExpenses = computed(() =>
    expenses.value.filter(e => [
      'PENDING_ACCOUNTANT', 
      'APPROVED_ACCOUNTANT', 
      'PENDING_MANAGER'
    ].includes(e.status))
  )

  const approvedExpenses = computed(() =>
    expenses.value.filter(e => [
      'APPROVED', 
      'APPROVED_FOR_PAYMENT', 
      'PAYMENT_PROCESSED'
    ].includes(e.status))
  )

  const totalMonthlyExpenses = computed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    return expenses.value
      .filter(e => {
        const createdAtRaw = e.createdAt as any
        const date = createdAtRaw?.toDate ? createdAtRaw.toDate() : new Date(e.createdAt as any)
        return date >= startOfMonth && ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(e.status)
      })
      .reduce((sum, e) => sum + (e.amount || 0), 0)
  })

  const fetchExpenses = () => {
    loading.value = true
    const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      expenses.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OperationalExpense[]
      loading.value = false
    }, (err) => {
      console.error('[OpexStore] Fetch error:', err)
      error.value = err.message
      loading.value = false
    })
  }

  const setCurrentExpense = (expense: OperationalExpense | null) => {
    currentExpense.value = expense
  }

  const createExpense = async (data: Partial<OperationalExpense>, userId: string, userEmail: string) => {
    try {
      const payload = {
        title: data.title || 'Untitled Expense',
        description: data.description || '',
        category: data.category || '',
        amount: data.amount || 0,
        items: data.items || [],
        paymentMethod: data.paymentMethod || 'CASH',
        department: data.department || '',
        beneficiary: data.beneficiary || '',
        attachmentUrl: data.attachmentUrl || '',
        attachmentUrls: data.attachmentUrls || [],
        status: 'PENDING_ACCOUNTANT',
        createdBy: userId,
        createdByEmail: userEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, 'operationalExpenses'), payload)
      return docRef.id
    } catch (err) {
      console.error('[OpexStore] Error creating expense:', err)
      throw err
    }
  }

  const handleApproval = async (id: string, currentStatus: string, role: string, userEmail: string, userName: string) => {
    const docRef = doc(db, 'operationalExpenses', id)
    let nextStatus = currentStatus
    const isSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'

    if (currentStatus === 'PENDING_ACCOUNTANT' && (isSuper || role === 'ACCOUNTANT')) {
      nextStatus = 'APPROVED_ACCOUNTANT'
    } else if (currentStatus === 'APPROVED_ACCOUNTANT' && (isSuper || role === 'MANAGER')) {
      nextStatus = 'APPROVED_FOR_PAYMENT'
    }

    if (nextStatus !== currentStatus) {
      const updateData: any = {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }

      if (nextStatus === 'APPROVED_ACCOUNTANT') {
        updateData.accountantApprovedAt = serverTimestamp()
        updateData.accountantApprovedBy = userName || userEmail
      } else {
        updateData.managerApprovedAt = serverTimestamp()
        updateData.managerApprovedBy = userName || userEmail
      }

      await updateDoc(docRef, updateData)
    }
  }

  const approveExpense = async (id: string, userEmail: string) => {
    const docRef = doc(db, 'operationalExpenses', id)
    await updateDoc(docRef, {
      status: 'APPROVED',
      approvedBy: userEmail,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }

  const rejectExpense = async (id: string, userEmail: string, reason: string) => {
    const docRef = doc(db, 'operationalExpenses', id)
    await updateDoc(docRef, {
      status: 'REJECTED',
      rejectedBy: userEmail,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason,
      updatedAt: serverTimestamp()
    })
  }

  const deleteExpense = async (id: string) => {
    try {
      const docRef = doc(db, 'operationalExpenses', id)
      await deleteDoc(docRef)
    } catch (err) {
      console.error('[OpexStore] Error deleting expense:', err)
      throw err
    }
  }

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  onUnmounted(cleanup)

  return {
    expenses,
    loading,
    error,
    currentExpense,
    pendingExpenses,
    approvedExpenses,
    totalMonthlyExpenses,
    fetchExpenses,
    setCurrentExpense,
    createExpense,
    handleApproval,
    approveExpense,
    rejectExpense,
    deleteExpense,
    cleanup
  }
})
