import { defineStore } from 'pinia'
import { ref } from 'vue'
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
} from 'firebase/firestore'
import type { ContainerAccessRequest, ContainerAccessLog, CAAStatus, CAALogAction } from '../types'

export const useContainerAccessStore = defineStore('containerAccess', () => {
    const requests = ref<ContainerAccessRequest[]>([])
    const logs = ref<ContainerAccessLog[]>([])
    const loading = ref(false)
    const logsLoading = ref(false)
    const error = ref<string | null>(null)

    let requestsUnsubscribe: (() => void) | null = null
    let logsUnsubscribe: (() => void) | null = null

    // ── Real-time listeners ────────────────────────────────────────────────────

    function fetchRequests() {
        loading.value = true
        const q = query(
            collection(db, 'containerAccessRequests'),
            orderBy('createdAt', 'desc')
        )
        requestsUnsubscribe = onSnapshot(
            q,
            (snapshot) => {
                requests.value = snapshot.docs.map(
                    (d) => ({ id: d.id, ...d.data() } as ContainerAccessRequest)
                )
                loading.value = false
            },
            (err) => {
                error.value = err.message
                loading.value = false
            }
        )
    }

    function fetchLogs() {
        logsLoading.value = true
        const q = query(
            collection(db, 'containerAccessLogs'),
            orderBy('loggedAt', 'desc')
        )
        logsUnsubscribe = onSnapshot(
            q,
            (snapshot) => {
                logs.value = snapshot.docs.map(
                    (d) => ({ id: d.id, ...d.data() } as ContainerAccessLog)
                )
                logsLoading.value = false
            },
            (err) => {
                error.value = err.message
                logsLoading.value = false
            }
        )
    }

    // ── Counter / numbering ────────────────────────────────────────────────────

    async function generateRequestNumber(): Promise<string> {
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
    }

    // ── CRUD actions ───────────────────────────────────────────────────────────

    async function createRequest(
        data: Omit<
            ContainerAccessRequest,
            'id' | 'requestNumber' | 'status' | 'pdfGenerated' | 'requestedAt' | 'createdAt' | 'updatedAt'
        >
    ): Promise<string> {
        const requestNumber = await generateRequestNumber()
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

        await _addLog({
            requestId: docRef.id,
            requestNumber,
            containerName: data.containerName,
            loggedByUid: data.requestedByUid,
            loggedByName: data.requestedByName,
            loggedByRole: data.requestedByRole,
            action: 'REQUEST_SUBMITTED',
        })

        return docRef.id
    }

    async function approveRequest(
        requestId: string,
        requestNumber: string,
        containerName: string,
        approver: { uid: string; name: string },
        notes?: string
    ): Promise<void> {
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
        await _addLog({
            requestId,
            requestNumber,
            containerName,
            loggedByUid: approver.uid,
            loggedByName: approver.name,
            loggedByRole: 'MANAGER',
            action: 'APPROVED',
            notes,
        })
    }

    async function rejectRequest(
        requestId: string,
        requestNumber: string,
        containerName: string,
        rejector: { uid: string; name: string },
        reason: string
    ): Promise<void> {
        const docRef = doc(db, 'containerAccessRequests', requestId)
        await updateDoc(docRef, {
            status: 'REJECTED' as CAAStatus,
            rejectedByUid: rejector.uid,
            rejectedByName: rejector.name,
            rejectedAt: serverTimestamp(),
            rejectionReason: reason,
            updatedAt: serverTimestamp(),
        })
        await _addLog({
            requestId,
            requestNumber,
            containerName,
            loggedByUid: rejector.uid,
            loggedByName: rejector.name,
            loggedByRole: 'MANAGER',
            action: 'REJECTED',
            notes: reason,
        })
    }

    async function cancelRequest(
        requestId: string,
        requestNumber: string,
        containerName: string,
        canceller: { uid: string; name: string; role: string }
    ): Promise<void> {
        const docRef = doc(db, 'containerAccessRequests', requestId)
        await updateDoc(docRef, {
            status: 'CANCELLED' as CAAStatus,
            cancelledByUid: canceller.uid,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        })
        await _addLog({
            requestId,
            requestNumber,
            containerName,
            loggedByUid: canceller.uid,
            loggedByName: canceller.name,
            loggedByRole: canceller.role,
            action: 'CANCELLED',
        })
    }

    async function logContainerAccess(
        requestId: string,
        requestNumber: string,
        containerName: string,
        accessor: { uid: string; name: string; role: string },
        notes?: string
    ): Promise<void> {
        await _addLog({
            requestId,
            requestNumber,
            containerName,
            loggedByUid: accessor.uid,
            loggedByName: accessor.name,
            loggedByRole: accessor.role,
            action: 'CONTAINER_ACCESSED',
            notes,
        })
    }

    // ── Internal helper ────────────────────────────────────────────────────────

    async function _addLog(
        entry: Omit<ContainerAccessLog, 'id' | 'loggedAt' | 'createdAt'> & { action: CAALogAction }
    ): Promise<void> {
        await addDoc(collection(db, 'containerAccessLogs'), {
            ...entry,
            loggedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        })
    }

    function cleanup() {
        requestsUnsubscribe?.()
        requestsUnsubscribe = null
        logsUnsubscribe?.()
        logsUnsubscribe = null
    }

    return {
        requests,
        logs,
        loading,
        logsLoading,
        error,
        fetchRequests,
        fetchLogs,
        generateRequestNumber,
        createRequest,
        approveRequest,
        rejectRequest,
        cancelRequest,
        logContainerAccess,
        cleanup,
    }
})
