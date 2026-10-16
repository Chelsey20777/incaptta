<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useLeads } from '@/features/calculatorLeads/composables/useLeads'
import { useLeadsStore } from '@/features/calculatorLeads/store/leadsStore'
import type { Lead, LeadStatus } from '@/features/calculatorLeads/types/lead.types'
import { LEAD_STATUS_CONFIG } from '@/features/calculatorLeads/types/lead.types'
import { toast } from 'vue-sonner'

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

// Icons
import {
  Users,
  Search,
  Calendar,
  Loader2,
  TrendingUp,
  DollarSign,
  Target,
  Eye,
  Calculator
} from 'lucide-vue-next'

// Components
import LeadStatusBadge from '@/features/calculatorLeads/components/LeadStatusBadge.vue'
import LeadDetailSlideOver from '@/features/calculatorLeads/components/LeadDetailSlideOver.vue'

const { leads, loading, stats, fetchLeads, cleanup } = useLeads()
const leadsStore = useLeadsStore()

const searchQuery = ref('')
const isSlideOverOpen = ref(false)
const selectedLead = ref<Lead | null>(null)

const statusTabs: (LeadStatus | 'all')[] = ['all', 'new', 'contacted', 'quoted', 'won', 'lost']

// Sync composable leads with store
leadsStore.setLeads(leads.value)

// Watch for leads changes and update store
onMounted(() => {
  fetchLeads()
})

onUnmounted(() => {
  cleanup()
})

// Filtered leads based on store filters
const filteredLeads = computed(() => {
  let result = [...leads.value]

  // Status filter
  if (leadsStore.activeTab !== 'all') {
    result = result.filter(l => l.status === leadsStore.activeTab)
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const searchTerm = searchQuery.value.toLowerCase().trim()
    result = result.filter(l =>
      l.fullName?.toLowerCase().includes(searchTerm) ||
      l.phone?.toLowerCase().includes(searchTerm) ||
      l.farmLocation?.toLowerCase().includes(searchTerm)
    )
  }

  return result
})

const todayCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return leads.value.filter(l => {
    const createdAt = l.createdAt?.toDate?.() || new Date(l.createdAt as any)
    return createdAt >= today
  }).length
})

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value || 0)
}

const formatDate = (timestamp: any): string => {
  if (!timestamp) return 'N/A'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function handleTabClick(tab: LeadStatus | 'all') {
  leadsStore.setActiveTab(tab)
}

function handleViewLead(lead: Lead) {
  selectedLead.value = lead
  leadsStore.setSelectedLead(lead)
  isSlideOverOpen.value = true
}

function handleSlideOverClose() {
  isSlideOverOpen.value = false
  selectedLead.value = null
  leadsStore.setSelectedLead(null)
}

function getStatusCount(status: LeadStatus | 'all'): number {
  if (status === 'all') return stats.value.total
  return stats.value.byStatus[status as LeadStatus] || 0
}
</script>

<template>
  <div class="space-y-6 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users class="h-8 w-8 text-brand-primary" />
          Leads
        </h2>
        <p class="text-muted-foreground">Calculator quote requests from potential customers</p>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Leads -->
      <Card class="border-l-4 border-l-brand-primary">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Leads</p>
              <p class="text-2xl font-bold">{{ stats.total }}</p>
            </div>
            <div class="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
              <Users class="h-5 w-5 text-brand-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- New Today -->
      <Card class="border-l-4 border-l-blue-500">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">New Today</p>
              <p class="text-2xl font-bold">{{ todayCount }}</p>
            </div>
            <div class="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Calendar class="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Total Est. Value -->
      <Card class="border-l-4 border-l-amber-500">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Total Est. Value</p>
              <p class="text-2xl font-bold">{{ formatCurrency(stats.totalEstimatedValue) }}</p>
            </div>
            <div class="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <DollarSign class="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Win Rate -->
      <Card class="border-l-4 border-l-green-500">
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-muted-foreground">Win Rate</p>
              <p class="text-2xl font-bold">{{ stats.conversionRate }}%</p>
            </div>
            <div class="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <Target class="h-5 w-5 text-green-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Filter Bar -->
    <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
      <!-- Status Tabs -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tab in statusTabs"
          :key="tab"
          @click="handleTabClick(tab)"
          :class="[
            'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
            leadsStore.activeTab === tab
              ? 'bg-brand-primary text-white shadow-sm'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          ]"
        >
          {{ tab === 'all' ? 'All' : LEAD_STATUS_CONFIG[tab as LeadStatus].label }}
          <Badge
            variant="secondary"
            class="ml-1.5 h-5 min-w-[20px] px-1 text-[10px]"
            :class="leadsStore.activeTab === tab ? 'bg-white/20 text-white' : ''"
          >
            {{ getStatusCount(tab) }}
          </Badge>
        </button>
      </div>

      <!-- Search -->
      <div class="relative w-full md:w-80">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Search by name, phone, or location..."
          class="pl-9"
        />
      </div>
    </div>

    <!-- Leads Table -->
    <Card>
      <CardHeader>
        <CardTitle>Lead Requests</CardTitle>
        <CardDescription>
          {{ filteredLeads.length }} lead{{ filteredLeads.length !== 1 ? 's' : '' }} found
        </CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <!-- Loading State -->
        <div v-if="loading && leads.length === 0" class="p-4 space-y-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-4">
            <Skeleton class="h-12 flex-1" />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredLeads.length === 0"
          class="text-center py-12"
        >
          <Calculator class="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 class="mt-4 text-lg font-semibold">No leads yet</h3>
          <p class="text-muted-foreground max-w-md mx-auto mt-2">
            Share the calculator link to start receiving quote requests from potential customers.
          </p>
        </div>

        <!-- Table -->
        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[50px]">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Size</TableHead>
                <TableHead class="text-right">Est. Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(lead, index) in filteredLeads"
                :key="lead.id"
                class="cursor-pointer transition-colors"
                :class="[
                  'hover:bg-muted/50',
                  lead.status === 'new' ? 'border-l-2 border-l-brand-primary' : ''
                ]"
                @click="handleViewLead(lead)"
              >
                <TableCell class="text-muted-foreground">{{ index + 1 }}</TableCell>
                <TableCell class="whitespace-nowrap">{{ formatDate(lead.createdAt) }}</TableCell>
                <TableCell class="font-medium">{{ lead.fullName }}</TableCell>
                <TableCell>{{ lead.phone }}</TableCell>
                <TableCell>{{ lead.farmLocation }}</TableCell>
                <TableCell>{{ lead.structureSize }}</TableCell>
                <TableCell class="text-right font-medium">
                  {{ formatCurrency(lead.estimatedMaterialCost) }}
                </TableCell>
                <TableCell>
                  <LeadStatusBadge :status="lead.status" />
                </TableCell>
                <TableCell class="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    @click.stop="handleViewLead(lead)"
                  >
                    <Eye class="h-4 w-4 mr-1" />
                    View
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Lead Detail Slide Over -->
    <LeadDetailSlideOver
      :open="isSlideOverOpen"
      :lead="selectedLead"
      @update:open="handleSlideOverClose"
    />
  </div>
</template>
