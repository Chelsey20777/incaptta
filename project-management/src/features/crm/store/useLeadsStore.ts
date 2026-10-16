import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    getDocs,
    where
} from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'

// ── Types ────────────────────────────────────────────────────────────────────

export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
export type LeadPriority = 'Low' | 'Medium' | 'High'

export interface Lead {
    id: string
    companyName: string
    contactName: string
    email: string
    phone: string
    stage: LeadStage
    priority: LeadPriority
    value: number
    source: string
    notes: string
    assignedTo: string
    expectedCloseDate: string
    createdBy: { uid: string; name: string }
    createdAt: Timestamp
    updatedAt: Timestamp
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useLeadsStore = defineStore('leads', () => {
    const leads = ref<Lead[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    let unsubLeads: (() => void) | null = null

    function fetchLeads() {
        loading.value = true
        const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
        unsubLeads = onSnapshot(q, (snap) => {
            leads.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead))
            loading.value = false
        }, (err) => {
            console.error('Error fetching leads:', err)
            error.value = err.message
            loading.value = false
        })
    }

    async function addLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) {
        try {
            await addDoc(collection(db, 'leads'), {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })
        } catch (err: any) {
            console.error('Error adding lead:', err)
            throw err
        }
    }

    async function updateLead(id: string, data: Partial<Omit<Lead, 'id' | 'createdAt'>>) {
        try {
            await updateDoc(doc(db, 'leads', id), {
                ...data,
                updatedAt: serverTimestamp()
            })
        } catch (err: any) {
            console.error('Error updating lead:', err)
            throw err
        }
    }

    async function deleteLead(id: string) {
        try {
            await deleteDoc(doc(db, 'leads', id))
        } catch (err: any) {
            console.error('Error deleting lead:', err)
            throw err
        }
    }

    async function moveStageLead(id: string, stage: LeadStage) {
        try {
            await updateDoc(doc(db, 'leads', id), {
                stage,
                updatedAt: serverTimestamp()
            })
        } catch (err: any) {
            console.error('Error moving lead stage:', err)
            throw err
        }
    }

    /**
     * Finds a lead by contact name or email and updates its stage.
     * If no lead is found and stage is 'New' or 'Won', creates a new lead.
     */
    async function syncLeadStage(contactName: string, email: string, companyName: string, stage: LeadStage, value: number = 0) {
        try {
            const leadsRef = collection(db, 'leads')
            // Try to find by email first
            let q = query(leadsRef, where('email', '==', email))
            let snap = await getDocs(q)

            if (snap.empty && contactName) {
                // Try to find by contact name
                q = query(leadsRef, where('contactName', '==', contactName))
                snap = await getDocs(q)
            }

            if (!snap.empty) {
                const leadDoc = snap.docs[0]
                if (!leadDoc) return
                const currentStage = leadDoc.data().stage as LeadStage
                
                // Don't downgrade from Won
                if (currentStage === 'Won' && stage !== 'Won') return

                await updateDoc(leadDoc.ref, {
                    stage,
                    value: value || leadDoc.data().value || 0,
                    updatedAt: serverTimestamp()
                })
            } else if (stage === 'New' || stage === 'Won' || stage === 'Negotiation') {
                // Create new lead if not found for specific stages
                await addDoc(leadsRef, {
                    contactName,
                    email,
                    companyName,
                    stage,
                    priority: 'Medium',
                    value,
                    source: 'System Sync',
                    notes: 'Automatically created from Customer/Quote/Job activity',
                    assignedTo: '',
                    expectedCloseDate: '',
                    createdBy: { uid: 'system', name: 'System' },
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
            }
        } catch (err) {
            console.error('Error syncing lead stage:', err)
        }
    }

    function cleanup() {
        if (unsubLeads) unsubLeads()
    }

    return {
        leads,
        loading,
        error,
        fetchLeads,
        addLead,
        updateLead,
        deleteLead,
        moveStageLead,
        syncLeadStage,
        cleanup
    }
})
