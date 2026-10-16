'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore'
import type {
  ContainerAccessRequest,
  ContainerAccessLog,
  CAAStatus,
  CAALogAction,
} from '@/features/container-access/types'

interface ContainerAccessState {
  // State
  requests: ContainerAccessRequest[]
  logs: ContainerAccessLog[]
  loading: boolean
  logsLoading: boolean
  error: string | null

  // Listeners
  fetchRequests: () => void
  fetchLogs: () => void
  cleanup: () => void

  // Counter
  generateRequestNumber: () => Promise<string>

  // CRUD
  createRequest: (
    data: Omit<
      ContainerAccessRequest,
      'id' | 'requestNumber' | 'status' | 'pdfGenerated' | 'requestedAt' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<string>
  approveRequest: (
    requestId: string,
    requestNumber: string,
    containerName: string,
    approver: { uid: string; name: string },
    notes?: string
  ) => Promise<void>
  rejectRequest: (
    requestId: string,
    requestNumber: string,
    containerName: string,
    rejector: { uid: string; name: string },
    reason: string
  ) => Promise<void>
  cancelRequest: (
    requestId: string,
    requestNumber: string,
    containerName: string,
    canceller: { uid: string; name: string; role: string }
  ) => Promise<void>
  logContainerAccess: (
    requestId: string,
    requestNumber: string,
    containerName: string,
    accessor: { uid: string; name: string; role: string },
    notes?: string
  ) => Promise<void>
}

let requestsUnsubscribe: Unsubscribe | null = null
let logsUnsubscribe: Unsubscribe | null = null

export const useContainerAccessStore = create<ContainerAccessState>((set, get) => ({
  requests: [],
  logs: [],
  loading: false,
  logsLoading: false,
  error: null,

  // ── Real-time listeners ────────────────────────────────────────────────────

  fetchRequests: () => {
    set({ loading: true })
    const q = query(
      collection(db, 'containerAccessRequests'),
      orderBy('createdAt', 'desc')
    )
    requestsUnsubscribe?.()
    requestsUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        set({
          requests: snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as ContainerAccessRequest)
          ),
          loading: false,
        })
      },
      (err) => {
        set({ error: err.message, loading: false })
      }
    )
  },

  fetchLogs: () => {
    set({ logsLoading: true })
    const q = query(
      collection(db, 'containerAccessLogs'),
      orderBy('loggedAt', 'desc')
    )
    logsUnsubscribe?.()
    logsUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        set({
          logs: snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as ContainerAccessLog)
          ),
          logsLoading: false,
        })
      },
      (err) => {
        set({ error: err.message, logsLoading: false })
      }
    )
  },

  // ── Counter / numbering ────────────────────────────────────────────────────

  generateRequestNumber: async (): Promise<string> => {
    const currentYear = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'containerAccessRequests')

    const seq = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef)
      let next = 1
      if (snap.exists()) {
        const data = snap.data()
        next = data.currentYear === currentYear ? (data.sequence || 0) + 1 : 1
      }
      transaction.set(counterRef, {
        currentYear,
        sequence: next,
        lastUpdatedAt: serverTimestamp(),
      })
      return next
    })

    return `CAA-${currentYear}-${String(seq).padStart(4, '0')}`
  },

  // ── CRUD actions ───────────────────────────────────────────────────────────

  createRequest: async (data) => {
    const requestNumber = await get().generateRequestNumber()
    const verificationToken = crypto.randomUUID()

    const docRef = await addDoc(collection(db, 'containerAccessRequests'), {
      ...data,
      requestNumber,
      status: 'PENDING' as CAAStatus,
      pdfGenerated: false,
      verificationToken,
      requestedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    await addDoc(collection(db, 'containerAccessLogs'), {
      requestId: docRef.id,
      requestNumber,
      containerName: data.containerName,
      loggedByUid: data.requestedByUid,
      loggedByName: data.requestedByName,
      loggedByRole: data.requestedByRole,
      action: 'REQUEST_SUBMITTED' as CAALogAction,
      loggedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })

    return docRef.id
  },

  approveRequest: async (requestId, requestNumber, containerName, approver, notes) => {
    const docRef = doc(db, 'containerAccessRequests', requestId)
    await updateDoc(docRef, {
      status: 'APPROVED' as CAAStatus,
      approvedByUid: approver.uid,
      approvedByName: approver.name,
      approvedAt: serverTimestamp(),
      approvalNotes: notes || '',
      pdfGenerated: false,
      updatedAt: serverTimestamp(),
    })
    await addDoc(collection(db, 'containerAccessLogs'), {
      requestId,
      requestNumber,
      containerName,
      loggedByUid: approver.uid,
      loggedByName: approver.name,
      loggedByRole: 'MANAGER',
      action: 'APPROVED' as CAALogAction,
      notes: notes || '',
      loggedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  },

  rejectRequest: async (requestId, requestNumber, containerName, rejector, reason) => {
    const docRef = doc(db, 'containerAccessRequests', requestId)
    await updateDoc(docRef, {
      status: 'REJECTED' as CAAStatus,
      rejectedByUid: rejector.uid,
      rejectedByName: rejector.name,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    })
    await addDoc(collection(db, 'containerAccessLogs'), {
      requestId,
      requestNumber,
      containerName,
      loggedByUid: rejector.uid,
      loggedByName: rejector.name,
      loggedByRole: 'MANAGER',
      action: 'REJECTED' as CAALogAction,
      notes: reason,
      loggedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  },

  cancelRequest: async (requestId, requestNumber, containerName, canceller) => {
    const docRef = doc(db, 'containerAccessRequests', requestId)
    await updateDoc(docRef, {
      status: 'CANCELLED' as CAAStatus,
      cancelledByUid: canceller.uid,
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await addDoc(collection(db, 'containerAccessLogs'), {
      requestId,
      requestNumber,
      containerName,
      loggedByUid: canceller.uid,
      loggedByName: canceller.name,
      loggedByRole: canceller.role,
      action: 'CANCELLED' as CAALogAction,
      loggedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  },

  logContainerAccess: async (requestId, requestNumber, containerName, accessor, notes) => {
    await addDoc(collection(db, 'containerAccessLogs'), {
      requestId,
      requestNumber,
      containerName,
      loggedByUid: accessor.uid,
      loggedByName: accessor.name,
      loggedByRole: accessor.role,
      action: 'CONTAINER_ACCESSED' as CAALogAction,
      notes: notes || '',
      loggedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
  },

  cleanup: () => {
    requestsUnsubscribe?.()
    requestsUnsubscribe = null
    logsUnsubscribe?.()
    logsUnsubscribe = null
  },
}))