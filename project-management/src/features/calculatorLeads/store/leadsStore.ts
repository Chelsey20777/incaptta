import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Lead, LeadFilters, LeadStatus } from '../types/lead.types'

export const useLeadsStore = defineStore('calculatorLeads', () => {
  // State
  const leads = ref<Lead[]>([])
  const loading = ref(false)
  const selectedLead = ref<Lead | null>(null)
  const filters = ref<LeadFilters>({
    status: 'all',
    dateFrom: undefined,
    dateTo: undefined,
    search: ''
  })
  const activeTab = ref<LeadStatus | 'all'>('all')

  // Getters
  const filteredLeads = computed(() => {
    let result = [...leads.value]

    if (filters.value.status && filters.value.status !== 'all') {
      result = result.filter(l => l.status === filters.value.status)
    }

    if (filters.value.search?.trim()) {
      const searchTerm = filters.value.search.toLowerCase().trim()
      result = result.filter(l =>
        l.fullName?.toLowerCase().includes(searchTerm) ||
        l.phone?.toLowerCase().includes(searchTerm) ||
        l.farmLocation?.toLowerCase().includes(searchTerm)
      )
    }

    if (filters.value.dateFrom) {
      const fromTime = filters.value.dateFrom.getTime()
      result = result.filter(l => {
        const createdTime = l.createdAt?.toMillis?.() || new Date(l.createdAt as any).getTime()
        return createdTime >= fromTime
      })
    }

    if (filters.value.dateTo) {
      const toTime = filters.value.dateTo.getTime()
      result = result.filter(l => {
        const createdTime = l.createdAt?.toMillis?.() || new Date(l.createdAt as any).getTime()
        return createdTime <= toTime
      })
    }

    return result
  })

  const newLeadsCount = computed(() => {
    return leads.value.filter(l => l.status === 'new').length
  })

  const stats = computed(() => {
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

  // Actions
  function setLeads(data: Lead[]) {
    leads.value = data
  }

  function setSelectedLead(lead: Lead | null) {
    selectedLead.value = lead
  }

  function setFilter(newFilters: Partial<LeadFilters>) {
    filters.value = { ...filters.value, ...newFilters }
  }

  function setActiveTab(tab: LeadStatus | 'all') {
    activeTab.value = tab
    filters.value.status = tab
  }

  function clearFilters() {
    filters.value = {
      status: 'all',
      dateFrom: undefined,
      dateTo: undefined,
      search: ''
    }
    activeTab.value = 'all'
  }

  function updateLeadInStore(id: string, updates: Partial<Lead>) {
    const index = leads.value.findIndex(l => l.id === id)
    if (index !== -1 && leads.value[index]) {
      const currentLead = leads.value[index]
      leads.value[index] = { ...currentLead, ...updates, id: currentLead.id } as Lead
    }
    if (selectedLead.value?.id === id) {
      const currentSelected = selectedLead.value
      selectedLead.value = { ...currentSelected, ...updates, id: currentSelected.id } as Lead
    }
  }

  return {
    // State
    leads,
    loading,
    selectedLead,
    filters,
    activeTab,
    // Getters
    filteredLeads,
    newLeadsCount,
    stats,
    // Actions
    setLeads,
    setSelectedLead,
    setFilter,
    setActiveTab,
    clearFilters,
    updateLeadInStore
  }
})
