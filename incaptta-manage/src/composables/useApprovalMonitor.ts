import { ref, computed, watch } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { useNotifications } from './useNotifications'
import type { User } from 'firebase/auth'

// ── Shared Global State ──
const counts = ref({
    jobCards: 0,
    opex: 0,
    transfers: 0,
    topUps: 0,
    hr: 0
})

const totalPending = computed(() => 
    Object.values(counts.value).reduce((a, b) => a + b, 0)
)

let initialized = false
const unsubscribers: Array<() => void> = []

function stopListeners() {
    unsubscribers.forEach(unsub => unsub())
    unsubscribers.length = 0
    initialized = false
    counts.value = { jobCards: 0, opex: 0, transfers: 0, topUps: 0, hr: 0 }
}

export function useApprovalMonitor() {
    const { notify } = useNotifications()

    function start(authedUser?: User | null) {
        // Don't start until we have a confirmed authenticated user
        if (!authedUser) {
            console.log('[Monitor] Skipping — no authenticated user yet.')
            return
        }
        if (initialized) return
        initialized = true

        console.log('[Monitor] Starting global approval listeners...')

        const onErr = (label: string) => (err: Error) => {
            console.warn(`[Monitor] Listener error (${label}):`, err.message)
        }

        // 1. Job Cards (Main Approval)
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'jobCards'), where('status', '==', 'APPROVAL_PENDING_MANAGER')),
                (snap) => { counts.value.jobCards = snap.size },
                onErr('jobCards')
            )
        )

        // 2. OPEX (Awaiting Manager)
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'operationalExpenses'), where('status', '==', 'APPROVED_ACCOUNTANT')),
                (snap) => { counts.value.opex = snap.size },
                onErr('opex')
            )
        )

        // 3. Transfers
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'fundTransfers'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
                (snap) => { counts.value.transfers = snap.size },
                onErr('transfers')
            )
        )

        // 4. Top-Ups
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'ledgerTopUps'), where('status', 'in', ['PENDING_MANAGER', 'PENDING_APPROVAL', 'PENDING'])),
                (snap) => { counts.value.topUps = snap.size },
                onErr('topUps')
            )
        )

        // 5. HR (Leave, Tasks, CAA)
        let leave = 0, tasks = 0, caa = 0
        
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'leaveRequests'), where('status', '==', 'Pending')),
                (snap) => { leave = snap.size; counts.value.hr = leave + tasks + caa },
                onErr('leaveRequests')
            )
        )
        
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'hrTasks'), where('status', '==', 'Completed')),
                (snap) => { tasks = snap.docs.filter(d => !d.data().verifiedBy).length; counts.value.hr = leave + tasks + caa },
                onErr('hrTasks')
            )
        )
        
        unsubscribers.push(
            onSnapshot(
                query(collection(db, 'containerAccessRequests'), where('status', '==', 'PENDING')),
                (snap) => { caa = snap.size; counts.value.hr = leave + tasks + caa },
                onErr('containerAccessRequests')
            )
        )
    }

    // Breakdown Notification logic
    const prevTotal = ref(-1)
    watch(totalPending, (newTotal) => {
        if (prevTotal.value === -1) {
            prevTotal.value = newTotal
            return
        }

        if (newTotal > prevTotal.value) {
            const parts: string[] = []
            if (counts.value.jobCards > 0) parts.push(`${counts.value.jobCards} Job Card${counts.value.jobCards > 1 ? 's' : ''}`)
            if (counts.value.opex > 0) parts.push(`${counts.value.opex} Expense${counts.value.opex > 1 ? 's' : ''}`)
            if (counts.value.hr > 0) parts.push(`${counts.value.hr} HR Request${counts.value.hr > 1 ? 's' : ''}`)
            if (counts.value.transfers > 0 || counts.value.topUps > 0) {
                const fin = counts.value.transfers + counts.value.topUps
                parts.push(`${fin} Financial Request${fin > 1 ? 's' : ''}`)
            }

            if (parts.length > 0) {
                const body = parts.join(', ') + ' awaiting your review.'
                notify('New Approvals Pending', body, 'approval')
            }
        }
        prevTotal.value = newTotal
    })

    return {
        counts,
        totalPending,
        start,
        stop: stopListeners
    }
}
