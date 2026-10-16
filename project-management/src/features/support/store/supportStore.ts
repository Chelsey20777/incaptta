import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import {
    collection, query, orderBy, onSnapshot, addDoc, updateDoc,
    doc, serverTimestamp, arrayUnion, where
} from 'firebase/firestore'

export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed'
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type TicketCategory = 'Technical Issue' | 'Billing' | 'Feature Request' | 'General Enquiry' | 'Bug Report'

export interface TicketResponse {
    id: string
    message: string
    authorName: string
    authorUid: string
    isStaff: boolean
    createdAt: string
}

export interface SupportTicket {
    id: string
    title: string
    description: string
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    createdBy: { uid: string; name: string; email: string; role: string }
    responses: TicketResponse[]
    createdAt: any
    updatedAt: any
}

export const useSupportStore = defineStore('support', () => {
    const tickets = ref<SupportTicket[]>([])
    const loading = ref(false)
    const unsubscribers: (() => void)[] = []

    function fetchTickets(uid: string, isAdmin: boolean) {
        loading.value = true
        unsubscribers.forEach(u => u())
        unsubscribers.length = 0

        const col = collection(db, 'supportTickets')
        const q = isAdmin
            ? query(col, orderBy('createdAt', 'desc'))
            : query(col, where('createdBy.uid', '==', uid))

        const unsub = onSnapshot(q, (snap) => {
            const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportTicket))
            
            // Sort locally to avoid needing a composite index in Firestore for non-admins
            fetched.sort((a, b) => {
                const timeA = a.createdAt?.toMillis?.() || Date.now()
                const timeB = b.createdAt?.toMillis?.() || Date.now()
                return timeB - timeA
            })
            
            tickets.value = fetched
            loading.value = false
        }, (err) => { 
            console.error("Failed to fetch tickets:", err)
            loading.value = false 
        })

        unsubscribers.push(unsub)
    }

    async function createTicket(data: {
        title: string
        description: string
        category: TicketCategory
        priority: TicketPriority
        createdBy: { uid: string; name: string; email: string; role: string }
    }) {
        await addDoc(collection(db, 'supportTickets'), {
            ...data,
            status: 'Open' as TicketStatus,
            responses: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })
    }

    async function addResponse(ticketId: string, response: Omit<TicketResponse, 'id'>) {
        const docRef = doc(db, 'supportTickets', ticketId)
        await updateDoc(docRef, {
            responses: arrayUnion({ ...response, id: crypto.randomUUID() }),
            updatedAt: serverTimestamp()
        })
    }

    async function updateStatus(ticketId: string, status: TicketStatus) {
        await updateDoc(doc(db, 'supportTickets', ticketId), {
            status,
            updatedAt: serverTimestamp()
        })
    }

    function cleanup() {
        unsubscribers.forEach(u => u())
        unsubscribers.length = 0
    }

    return { tickets, loading, fetchTickets, createTicket, addResponse, updateStatus, cleanup }
})
