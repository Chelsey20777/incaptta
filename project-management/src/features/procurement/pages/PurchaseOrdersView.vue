<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Loader2, FileText, Calendar, Truck, DollarSign, Eye } from 'lucide-vue-next'
import { format } from 'date-fns'
import type { PurchaseOrder, POStatus } from '../types/procurement'

const router = useRouter()
const procurementStore = useProcurementStore()
const { hasAnyRole } = useSession()
const searchQuery = ref('')
const statusFilter = ref<'ALL' | 'DRAFT' | 'SENT' | 'ACKNOWLEDGED' | 'PARTIALLY_FULFILLED' | 'COMPLETE' | 'CANCELLED'>('ALL')

// Fetch purchase orders on mount
onMounted(() => {
  procurementStore.fetchPurchaseOrders()
})

// Cleanup listeners on unmount
onUnmounted(() => {
  procurementStore.cleanupListeners()
})

// Filter purchase orders based on search and status
const filteredPurchaseOrders = computed(() => {
  let filtered = procurementStore.purchaseOrders

  // Apply status filter
  if (statusFilter.value !== 'ALL') {
    filtered = filtered.filter(po => po.status === statusFilter.value)
  }

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(po =>
      po.poNumber.toLowerCase().includes(query) ||
      po.prNumber.toLowerCase().includes(query) ||
      po.supplierName.toLowerCase().includes(query) ||
      po.department.toLowerCase().includes(query)
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

// Get status badge variant
function getStatusVariant(status: POStatus) {
  switch (status) {
    case 'DRAFT': return 'secondary'
    case 'SENT': return 'default'
    case 'ACKNOWLEDGED': return 'default'
    case 'PARTIALLY_FULFILLED': return 'default'
    case 'COMPLETE': return 'default'
    case 'CANCELLED': return 'destructive'
    default: return 'outline'
  }
}

// Get status badge class for custom coloring
function getStatusClass(status: POStatus) {
  switch (status) {
    case 'DRAFT': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'ACKNOWLEDGED': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'PARTIALLY_FULFILLED': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'COMPLETE': return 'bg-green-100 text-green-700 border-green-200'
    case 'CANCELLED': return 'bg-red-100 text-red-700 border-red-200'
    default: return ''
  }
}

// Get status label
function getStatusLabel(status: POStatus) {
  switch (status) {
    case 'DRAFT': return 'Draft'
    case 'SENT': return 'Sent'
    case 'ACKNOWLEDGED': return 'Acknowledged'
    case 'PARTIALLY_FULFILLED': return 'Partially Fulfilled'
    case 'COMPLETE': return 'Complete'
    case 'CANCELLED': return 'Cancelled'
    default: return status
  }
}

// Navigate to detail view
function navigateToDetail(id: string) {
  router.push(`/procurement/purchase-orders/${id}`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Purchase Orders</h2>
        <p class="text-muted-foreground">Manage supplier purchase orders</p>
      </div>
      <!-- No "New PO" button - POs are created from approved PRs -->
    </div>

    <!-- Search Bar -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        v-model="searchQuery"
        placeholder="Search purchase orders by PO number, PR number, supplier, or department..."
        class="pl-9"
      />
    </div>

    <!-- Status Filter Tabs -->
    <Tabs v-model="statusFilter" class="w-full">
      <TabsList class="bg-muted/50 p-1 w-full justify-start overflow-x-auto">
        <TabsTrigger value="ALL" class="px-4">All</TabsTrigger>
        <TabsTrigger value="DRAFT" class="px-4">Draft</TabsTrigger>
        <TabsTrigger value="SENT" class="px-4">Sent</TabsTrigger>
        <TabsTrigger value="ACKNOWLEDGED" class="px-4">Acknowledged</TabsTrigger>
        <TabsTrigger value="PARTIALLY_FULFILLED" class="px-4">In Progress</TabsTrigger>
        <TabsTrigger value="COMPLETE" class="px-4">Complete</TabsTrigger>
        <TabsTrigger value="CANCELLED" class="px-4">Cancelled</TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- Main Content Card -->
    <Card>
      <CardHeader>
        <CardTitle>Purchase Orders List</CardTitle>
        <CardDescription>
          {{ filteredPurchaseOrders.length }} purchase order{{ filteredPurchaseOrders.length !== 1 ? 's' : '' }} found
          {{ searchQuery || statusFilter !== 'ALL' ? 'matching your criteria' : '' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="procurementStore.loadingPurchaseOrders && procurementStore.purchaseOrders.length === 0" class="space-y-4">
          <div class="flex justify-center py-8">
            <Loader2 class="size-8 animate-spin text-muted-foreground" />
          </div>
          <div class="space-y-3">
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
            <Skeleton class="h-12 w-full" />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredPurchaseOrders.length === 0"
          class="text-center py-12"
        >
          <FileText class="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 class="mt-4 text-lg font-semibold">No purchase orders found</h3>
          <p class="text-muted-foreground max-w-md mx-auto mt-2">
            {{
              searchQuery || statusFilter !== 'ALL'
                ? 'No purchase orders match your search criteria. Try a different search or clear filters.'
                : 'Purchase orders are created from approved purchase requisitions.'
            }}
          </p>
        </div>

        <!-- Purchase Orders Table -->
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>PR Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Department</TableHead>
              <TableHead class="text-right">Total Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="po in filteredPurchaseOrders" :key="po.id" class="hover:bg-muted/50 cursor-pointer" @click="navigateToDetail(po.id)">
              <!-- PO Number -->
              <TableCell class="font-mono text-sm">
                {{ po.poNumber }}
              </TableCell>

              <!-- PR Number -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <FileText class="h-3 w-3 text-muted-foreground" />
                  <span class="text-xs text-muted-foreground truncate max-w-[100px]" :title="po.prNumber">
                    {{ po.prNumber }}
                  </span>
                </div>
              </TableCell>

              <!-- Supplier -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <Truck class="h-3 w-3 text-muted-foreground" />
                  <span class="truncate max-w-[150px]" :title="po.supplierName">{{ po.supplierName }}</span>
                </div>
              </TableCell>

              <!-- Department -->
              <TableCell class="text-sm">
                {{ po.department }}
              </TableCell>

              <!-- Total Order Value -->
              <TableCell class="text-right font-medium">
                {{ formatCurrency(po.totalOrderValue) }}
              </TableCell>

              <!-- Status -->
              <TableCell>
                <Badge :variant="getStatusVariant(po.status)" :class="getStatusClass(po.status)">
                  {{ getStatusLabel(po.status) }}
                </Badge>
              </TableCell>

              <!-- Created Date -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="h-3 w-3 text-muted-foreground" />
                  <span class="text-sm">{{ formatDate(po.createdAt) }}</span>
                </div>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" @click.stop="navigateToDetail(po.id)">
                  <Eye class="mr-2 h-3 w-3" />
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
