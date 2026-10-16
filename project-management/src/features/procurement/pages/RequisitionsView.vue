<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Search, Plus, Loader2, FileText, Calendar, User, ShoppingCart } from 'lucide-vue-next'
import { format } from 'date-fns'

const router = useRouter()
const procurementStore = useProcurementStore()
const searchQuery = ref('')
const statusFilter = ref<'ALL' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'>('ALL')

// Fetch requisitions on mount
onMounted(() => {
  procurementStore.fetchRequisitions()
})

// Cleanup listeners on unmount
onUnmounted(() => {
  procurementStore.cleanupListeners()
})

// Filter requisitions based on search and status
const filteredRequisitions = computed(() => {
  let filtered = procurementStore.requisitions

  // Apply status filter
  if (statusFilter.value !== 'ALL') {
    filtered = filtered.filter(req => req.status === statusFilter.value)
  }

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(req =>
      req.prNumber.toLowerCase().includes(query) ||
      req.title.toLowerCase().includes(query) ||
      req.description.toLowerCase().includes(query) ||
      req.department.toLowerCase().includes(query) ||
      (req.supplierName && req.supplierName.toLowerCase().includes(query))
    )
  }

  return filtered
})

// Format date
function formatDate(date: any) {
  if (!date) return 'N/A'
  try {
    return format(date.toDate(), 'MMM dd, yyyy')
  } catch {
    return 'Invalid date'
  }
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Get procurement type badge variant
function getProcurementTypeVariant(type: string) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'blue'
    case 'INVENTORY': return 'purple'
    case 'CAPEX': return 'orange'
    case 'SERVICE': return 'teal'
    case 'ADHOC': return 'gray'
    default: return 'outline'
  }
}

// Get procurement type label
function getProcurementTypeLabel(type: string) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'Project Material'
    case 'INVENTORY': return 'Inventory'
    case 'CAPEX': return 'CAPEX'
    case 'SERVICE': return 'Service'
    case 'ADHOC': return 'Ad-hoc'
    default: return type
  }
}

// Get procurement type badge classes
function getProcurementTypeClasses(type: string) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'INVENTORY': return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'CAPEX': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'SERVICE': return 'bg-teal-100 text-teal-800 border-teal-200'
    case 'ADHOC': return 'bg-gray-100 text-gray-800 border-gray-200'
    default: return ''
  }
}

// Get status badge variant
function getStatusVariant(status: string) {
  switch (status) {
    case 'DRAFT': return 'secondary'
    case 'SUBMITTED': return 'default'
    case 'APPROVED': return 'default'
    case 'REJECTED': return 'destructive'
    default: return 'outline'
  }
}

// Get status label
function getStatusLabel(status: string) {
  switch (status) {
    case 'DRAFT': return 'Draft'
    case 'SUBMITTED': return 'Submitted'
    case 'APPROVED': return 'Approved'
    case 'REJECTED': return 'Rejected'
    default: return status
  }
}

// Navigate to new requisition
function navigateToNewRequisition() {
  router.push('/procurement/requisitions/new')
}

// Navigate to detail view
function navigateToDetail(id: string) {
  router.push(`/procurement/requisitions/${id}`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Purchase Requisitions</h2>
        <p class="text-muted-foreground">Manage and track purchase requests</p>
      </div>
      <Button @click="navigateToNewRequisition" class="bg-orange-600 hover:bg-orange-700 text-white">
        <Plus class="mr-2 h-4 w-4" />
        New Requisition
      </Button>
    </div>

    <!-- Search Bar -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        v-model="searchQuery"
        placeholder="Search requisitions by PR number, title, department, or supplier..."
        class="pl-9"
      />
    </div>

    <!-- Status Filter Tabs -->
    <Tabs v-model="statusFilter" class="w-full">
      <TabsList class="bg-muted/50 p-1 w-full justify-start overflow-x-auto">
        <TabsTrigger value="ALL" class="px-6">All</TabsTrigger>
        <TabsTrigger value="DRAFT" class="px-6">Draft</TabsTrigger>
        <TabsTrigger value="SUBMITTED" class="px-6">Submitted</TabsTrigger>
        <TabsTrigger value="APPROVED" class="px-6">Approved</TabsTrigger>
        <TabsTrigger value="REJECTED" class="px-6">Rejected</TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- Main Content Card -->
    <Card>
      <CardHeader>
        <CardTitle>Requisitions List</CardTitle>
        <CardDescription>
          {{ filteredRequisitions.length }} requisition{{ filteredRequisitions.length !== 1 ? 's' : '' }} found
          {{ searchQuery || statusFilter !== 'ALL' ? 'matching your criteria' : '' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="procurementStore.loadingRequisitions && procurementStore.requisitions.length === 0" class="space-y-4">
          <div class="flex justify-center py-8">
            <Loader2 class="size-8 animate-spin text-muted-foreground" />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredRequisitions.length === 0"
          class="text-center py-12"
        >
          <ShoppingCart class="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 class="mt-4 text-lg font-semibold">No requisitions found</h3>
          <p class="text-muted-foreground max-w-md mx-auto mt-2">
            {{
              searchQuery || statusFilter !== 'ALL'
                ? 'No requisitions match your search criteria. Try a different search or clear filters.'
                : 'Get started by creating your first purchase requisition.'
            }}
          </p>
          <Button v-if="!searchQuery && statusFilter === 'ALL'" @click="navigateToNewRequisition" class="mt-4">
            <Plus class="mr-2 h-4 w-4" />
            Create Your First Requisition
          </Button>
        </div>

        <!-- Requisitions Table -->
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>PR Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead class="text-right">Total Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="req in filteredRequisitions" :key="req.id" class="hover:bg-muted/50 cursor-pointer" @click="navigateToDetail(req.id)">
              <!-- PR Number -->
              <TableCell class="font-mono font-bold">
                {{ req.prNumber }}
              </TableCell>

              <!-- Title -->
              <TableCell class="font-medium">
                <div class="flex items-center gap-2">
                  <FileText class="h-4 w-4 text-muted-foreground" />
                  <span class="truncate max-w-[200px]" :title="req.title">{{ req.title }}</span>
                </div>
              </TableCell>

              <!-- Procurement Type -->
              <TableCell>
                <Badge :class="getProcurementTypeClasses(req.procurementType)">
                  {{ getProcurementTypeLabel(req.procurementType) }}
                </Badge>
              </TableCell>

              <!-- Department -->
              <TableCell>
                {{ req.department }}
              </TableCell>

              <!-- Supplier -->
              <TableCell>
                <div v-if="req.supplierName" class="flex items-center gap-2">
                  <User class="h-3 w-3 text-muted-foreground" />
                  <span class="truncate max-w-[150px]" :title="req.supplierName">{{ req.supplierName }}</span>
                </div>
                <span v-else class="text-sm text-muted-foreground italic">—</span>
              </TableCell>

              <!-- Total Cost -->
              <TableCell class="text-right font-medium">
                {{ formatCurrency(req.totalEstimatedCost) }}
              </TableCell>

              <!-- Status -->
              <TableCell>
                <Badge :variant="getStatusVariant(req.status)">
                  {{ getStatusLabel(req.status) }}
                </Badge>
              </TableCell>

              <!-- Requested Date -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-3 w-3 text-muted-foreground" />
                  <span class="text-sm">{{ formatDate(req.createdAt) }}</span>
                </div>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" @click.stop="navigateToDetail(req.id)">
                  View
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
