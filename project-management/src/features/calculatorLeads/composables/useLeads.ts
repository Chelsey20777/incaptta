import { ref, computed } from 'vue'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore'
import type { Lead, LeadStatus, LeadStats, LeadFilters } from '../types/lead.types'

const LEADS_LIMIT = 200

export function useLeads() {
  const leads = ref<Lead[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  let unsubscribe: (() => void) | null = null

  // Stats computed from leads
  const stats = computed<LeadStats>(() => {
    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      quoted: 0,
      won: 0,
      lost: 0
    }

    let totalEstimatedValue = 0
    let wonCount = 0
    let lostCount = 0

    leads.value.forEach(lead => {
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1
      totalEstimatedValue += lead.estimatedMaterialCost || 0
      if (lead.status === 'won') wonCount++
      if (lead.status === 'lost') lostCount++
    })

    const conversionRate = wonCount + lostCount > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100)
      : 0

    return {
      total: leads.value.length,
      byStatus,
      totalEstimatedValue,
      conversionRate
    }
  })

  // Count of new leads (for sidebar badge)
  const newLeadsCount = computed(() => {
    return leads.value.filter(l => l.status === 'new').length
  })

  // Fetch leads with real-time listener
  async function fetchLeads(filters?: LeadFilters): Promise<void> {
    loading.value = true
    error.value = null

    // Clean up existing listener
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    try {
      const leadsRef = collection(db, 'leads')
      const q = query(
        leadsRef,
        orderBy('createdAt', 'desc'),
        limit(LEADS_LIMIT)
      )

      unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Lead))

        // Apply client-side filters
        if (filters) {
          if (filters.status && filters.status !== 'all') {
            data = data.filter(l => l.status === filters.status)
          }

          if (filters.dateFrom) {
            const fromDate = filters.dateFrom.getTime()
            data = data.filter(l => {
              const createdAt = (l.createdAt as Timestamp)?.toMillis?.() || new Date(l.createdAt as any).getTime()
              return createdAt >= fromDate
            })
          }

          if (filters.dateTo) {
            const toDate = filters.dateTo.getTime()
            data = data.filter(l => {
              const createdAt = (l.createdAt as Timestamp)?.toMillis?.() || new Date(l.createdAt as any).getTime()
              return createdAt <= toDate
            })
          }

          if (filters.search?.trim()) {
            const searchTerm = filters.search.toLowerCase().trim()
            data = data.filter(l =>
              l.fullName?.toLowerCase().includes(searchTerm) ||
              l.phone?.toLowerCase().includes(searchTerm) ||
              l.farmLocation?.toLowerCase().includes(searchTerm)
            )
          }
        }

        leads.value = data
        loading.value = false
      }, (err) => {
        console.error('Error fetching leads:', err)
        error.value = err.message || 'Failed to fetch leads'
        loading.value = false
      })
    } catch (err: any) {
      console.error('Error setting up leads listener:', err)
      error.value = err.message || 'Failed to fetch leads'
      loading.value = false
    }
  }

  // Update lead status
  async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
    try {
      const leadRef = doc(db, 'leads', id)
      await updateDoc(leadRef, {
        status,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error updating lead status:', err)
      throw new Error(err.message || 'Failed to update status')
    }
  }

  // Update internal notes
  async function updateLeadNotes(id: string, notes: string): Promise<void> {
    try {
      const leadRef = doc(db, 'leads', id)
      await updateDoc(leadRef, {
        internalNotes: notes,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error updating lead notes:', err)
      throw new Error(err.message || 'Failed to update notes')
    }
  }

  // Assign lead to user
  async function assignLead(id: string, assignedTo: string): Promise<void> {
    try {
      const leadRef = doc(db, 'leads', id)
      await updateDoc(leadRef, {
        assignedTo,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error assigning lead:', err)
      throw new Error(err.message || 'Failed to assign lead')
    }
  }

  // Cleanup listener
  function cleanup(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  return {
    leads,
    loading,
    error,
    stats,
    newLeadsCount,
    fetchLeads,
    updateLeadStatus,
    updateLeadNotes,
    assignLead,
    cleanup
  }
}
