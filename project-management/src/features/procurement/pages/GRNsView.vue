<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  FileText,
  Package,
  Truck,
  Calendar,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-vue-next'
import { format } from 'date-fns'
import type { GoodsReceiptNote, GRNStatus } from '../types/procurement'

const router = useRouter()
const procurementStore = useProcurementStore()
const loading = ref(true)
const searchQuery = ref('')
const activeTab = ref('all')

// Fetch GRNs on mount
onMounted(async () => {
  procurementStore.fetchGrns()
  loading.value = false
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

// Get status badge variant
function getStatusVariant(status: GRNStatus) {
  switch (status) {
    case 'DRAFT': return 'secondary'
    case 'CONFIRMED': return 'default'
    case 'DISPUTED': return 'destructive'
    default: return 'outline'
  }
}

// Get status badge class for custom coloring
function getStatusClass(status: GRNStatus) {
  switch (status) {
    case 'DRAFT': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'CONFIRMED': return 'bg-green-100 text-green-700 border-green-200'
    case 'DISPUTED': return 'bg-red-100 text-red-700 border-red-200'
    default: return ''
  }
}

// Get status label
function getStatusLabel(status: GRNStatus) {
  switch (status) {
    case 'DRAFT': return 'Draft'
    case 'CONFIRMED': return 'Confirmed'
    case 'DISPUTED': return 'Disputed'
    default: return status
  }
}

// Get posting status badge variant
function getPostingStatusVariant(status: string) {
  switch (status) {
    case 'PENDING': return 'secondary'
    case 'PROCESSING': return 'default'
    case 'COMPLETE': return 'default'
    case 'FAILED': return 'destructive'
    default: return 'outline'
  }
}

// Get posting status badge class
function getPostingStatusClass(status: string) {
  switch (status) {
    case 'PENDING': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'PROCESSING': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'COMPLETE': return 'bg-green-100 text-green-700 border-green-200'
    case 'FAILED': return 'bg-red-100 text-red-700 border-red-200'
    default: return ''
  }
}

// Get posting status label
function getPostingStatusLabel(status: string) {
  switch (status) {
    case 'PENDING': return 'Pending'
    case 'PROCESSING': return 'Processing'
    case 'COMPLETE': return 'Complete'
    case 'FAILED': return 'Failed'
    default: return status
  }
}

// Filter GRNs based on search and active tab
const filteredGrns = computed(() => {
  let items = procurementStore.grns

  // Filter by tab
  if (activeTab.value !== 'all') {
    items = items.filter((grn: GoodsReceiptNote) => grn.status === activeTab.value.toUpperCase())
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter((grn: GoodsReceiptNote) =>
      grn.grnNumber.toLowerCase().includes(query) ||
      grn.poNumber.toLowerCase().includes(query) ||
      grn.supplierName.toLowerCase().includes(query) ||
      grn.department.toLowerCase().includes(query)
    )
  }

  return items
})

// Navigate to GRN detail
function navigateToGrn(id: string) {
  router.push(`/procurement/grns/${id}`)
}

// Navigate to PO detail
function navigateToPO(poId: string) {
  router.push(`/procurement/purchase-orders/${poId}`)
}

// Navigate back
function navigateBack() {
  router.push('/procurement/purchase-orders')
}
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="navigateBack">
          <ArrowLeft class="size-4" />
        </Button>
        <div>
          <h2 class="text-2xl font-extrabold tracking-tight">Goods Receipts</h2>
          <p class="text-muted-foreground">Manage goods receipt notes for purchase orders</p>
        </div>
      </div>
    </div>

    <!-- Search and Filters -->
    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div class="w-full md:w-auto md:flex-1">
            <Input
              v-model="searchQuery"
              placeholder="Search by GRN number, PO number, supplier..."
              class="w-full"
            />
          </div>
          
          <Tabs v-model="activeTab" class="w-full md:w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="disputed">Disputed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardContent>
    </Card>

    <!-- GRNs Table -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Package class="size-5" />
          Goods Receipt Notes ({{ filteredGrns.length }})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="space-y-4">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>

        <div v-else-if="filteredGrns.length === 0" class="text-center py-12">
          <Package class="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 class="text-lg font-bold">No GRNs found</h3>
          <p class="text-muted-foreground">
            {{ activeTab !== 'all' ? `No ${activeTab} GRNs found` : 'No goods receipt notes have been created yet' }}
          </p>
        </div>

        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>GRN Number</TableHead>
              <TableHead>PO Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Posting Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="grn in filteredGrns" :key="grn.id">
              <TableCell class="font-mono font-bold">
                {{ grn.grnNumber }}
              </TableCell>
              <TableCell>
                <Button variant="link" class="p-0 h-auto" @click.stop="navigateToPO(grn.poId)">
                  {{ grn.poNumber }}
                </Button>
              </TableCell>
              <TableCell>
                {{ grn.supplierName }}
              </TableCell>
              <TableCell>
                {{ grn.department }}
              </TableCell>
              <TableCell>
                <Badge 
                  :variant="getStatusVariant(grn.status)" 
                  :class="getStatusClass(grn.status)" 
                  class="uppercase text-xs tracking-wider font-bold"
                >
                  {{ getStatusLabel(grn.status) }}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge 
                  v-if="grn.hasVariance" 
                  variant="outline" 
                  class="uppercase text-xs tracking-wider font-bold border-amber-500 text-amber-700 bg-amber-50"
                >
                  Variance
                </Badge>
                <span v-else class="text-muted-foreground text-sm">—</span>
              </TableCell>
              <TableCell>
                <Badge 
                  :variant="getPostingStatusVariant(grn.inventoryPostingStatus)" 
                  :class="getPostingStatusClass(grn.inventoryPostingStatus)" 
                  class="uppercase text-xs tracking-wider font-bold"
                >
                  {{ getPostingStatusLabel(grn.inventoryPostingStatus) }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Calendar class="size-4 text-muted-foreground" />
                  <span class="text-sm">{{ formatDate(grn.createdAt) }}</span>
                </div>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="outline" size="sm" @click.stop="navigateToGrn(grn.id)">
                  <Eye class="size-4 mr-2" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Legend -->
    <Card class="bg-muted/30">
      <CardContent class="pt-6">
        <h3 class="font-bold text-sm mb-3">Status Legend</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="flex items-center gap-2">
            <Badge variant="secondary" class="uppercase text-xs">Draft</Badge>
            <span class="text-sm text-muted-foreground">GRN saved but not confirmed</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="default" class="uppercase text-xs bg-green-100 text-green-700 border-green-200">Confirmed</Badge>
            <span class="text-sm text-muted-foreground">Goods received and confirmed</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="destructive" class="uppercase text-xs">Disputed</Badge>
            <span class="text-sm text-muted-foreground">Quantity or quality issues</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="uppercase text-xs border-amber-500 text-amber-700 bg-amber-50">Variance</Badge>
            <span class="text-sm text-muted-foreground">Quantity differs from PO</span>
          </div>
        </div>

        <Separator class="my-4" />

        <h3 class="font-bold text-sm mb-3">Posting Status Legend</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="flex items-center gap-2">
            <Badge variant="secondary" class="uppercase text-xs">Pending</Badge>
            <span class="text-sm text-muted-foreground">Waiting to process</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="default" class="uppercase text-xs bg-blue-100 text-blue-700 border-blue-200">Processing</Badge>
            <span class="text-sm text-muted-foreground">Updating inventory</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="default" class="uppercase text-xs bg-green-100 text-green-700 border-green-200">Complete</Badge>
            <span class="text-sm text-muted-foreground">Inventory updated</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="destructive" class="uppercase text-xs">Failed</Badge>
            <span class="text-sm text-muted-foreground">Posting failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>