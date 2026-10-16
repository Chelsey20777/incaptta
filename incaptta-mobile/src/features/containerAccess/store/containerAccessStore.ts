import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import {
  collection, query, onSnapshot, addDoc, doc, updateDoc,
  serverTimestamp, orderBy, runTransaction
} from 'firebase/firestore'
import type { ContainerAccessAuthorization } from '../types'

export const useContainerAccessStore = defineStore('containerAccess', () => {
  const caaRecords = ref<ContainerAccessAuthorization[]>([])
  const loading = ref(false)
  const currentCAA = ref<ContainerAccessAuthorization | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const pendingCAA = computed(() =>
    caaRecords.value.filter(r => r.status === 'SUBMITTED' || r.status === 'PENDING')
  )

  const approvedCAA = computed(() =>
    caaRecords.value.filter(r => r.status === 'APPROVED')
  )

  const fetchCAARecords = () => {
    loading.value = true
    const q = query(collection(db, 'containerAccessRequests'), orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(q, (snapshot) => {
      caaRecords.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ContainerAccessAuthorization[]
      loading.value = false
    })
  }

  const setCurrentCAA = (caa: ContainerAccessAuthorization | null) => {
    currentCAA.value = caa
  }

  const generateCAANumber = async () => {
    const year = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'containerAccess')
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef)
      const n = snap.exists() && snap.data().currentYear === year
        ? (snap.data().sequence || 0) + 1 : 1
      tx.set(counterRef, { currentYear: year, sequence: n, updatedAt: serverTimestamp() })
      return n
    })
    return `CAA-${year}-${String(seq).padStart(4, '0')}`
  }

  const createCAA = async (data: Partial<ContainerAccessAuthorization>, userId: string, userName: string) => {
    try {
      const caaNumber = await generateCAANumber()
      const payload = {
        ...data,
        caaNumber,
        status: 'SUBMITTED',
        createdBy: userId,
        requestedBy: userId,
        requestedByName: userName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      await addDoc(collection(db, 'containerAccessRequests'), payload)
    } catch (err) {
      console.error('[CAAStore] Error creating CAA:', err)
      throw err
    }
  }

  const updateCAAStatus = async (id: string, status: string) => {
    try {
      const docRef = doc(db, 'containerAccessRequests', id)
      await updateDoc(docRef, { status, updatedAt: serverTimestamp() })
    } catch (err) {
      console.error('[CAAStore] Error updating CAA:', err)
      throw err
    }
  }

  const approveCAA = async (id: string, userEmail: string, comment?: string) => {
    try {
      const docRef = doc(db, 'containerAccessRequests', id)
      await updateDoc(docRef, {
        status: 'APPROVED',
        approvedBy: userEmail,
        approvedAt: serverTimestamp(),
        approvalComment: comment || '',
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[CAAStore] Error approving CAA:', err)
      throw err
    }
  }

  const rejectCAA = async (id: string, userEmail: string, reason: string) => {
    try {
      const docRef = doc(db, 'containerAccessRequests', id)
      await updateDoc(docRef, {
        status: 'REJECTED',
        rejectedBy: userEmail,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[CAAStore] Error rejecting CAA:', err)
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
    caaRecords,
    loading,
    error,
    currentCAA,
    pendingCAA,
    approvedCAA,
    fetchCAARecords,
    setCurrentCAA,
    createCAA,
    updateCAAStatus,
    approveCAA,
    rejectCAA,
    cleanup
  }
})
