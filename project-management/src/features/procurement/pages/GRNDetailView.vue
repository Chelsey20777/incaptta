<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { doc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Truck,
  User,
  Calendar,
  Link,
  TriangleAlert
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { toast } from 'vue-sonner'
import type { GoodsReceiptNote, GRNStatus } from '../types/procurement'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const { user: currentUser, hasAnyRole } = useSession()

const grnId = route.params.id as string
const loading = ref(true)
const updating = ref(false)
const grn = ref<GoodsReceiptNote | null>(null)

// Real-time listener for GRN updates
onMounted(() => {
  const unsubGrn = onSnapshot(
    doc(db, 'procurementGrns', grnId),
    (snap) => {
      if (snap.exists()) {
        grn.value = { id: snap.id, ...snap.data() } as GoodsReceiptNote
      }
      loading.value = false
    },
    (error) => {
      console.error('Error fetching GRN:', error)
      toast.error('Failed to load GRN')
      loading.value = false
    }
  )

  onUnmounted(() => unsubGrn())
})

// Format date
function formatDate(date: any) {
  if (!date) return 'N/A'
  try {
    return format(date.toDate(), 'MMM dd, yyyy HH:mm')
  } catch {
    return 'Invalid date'
  }
}

// Format short date
function formatShortDate(date: any) {
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

// Get posting status icon and color
function getPostingStatusInfo(status: string) {
  switch (status) {
    case 'PENDING':
      return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Pending' }
    case 'PROCESSING':
      return { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Processing' }
    case 'COMPLETE':
      return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Complete' }
    case 'FAILED':
      return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' }
    default:
      return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: status }
  }
}

// Get variance color class
function getVarianceClass(variance: number) {
  if (variance === 0) return 'text-green-600'
  if (variance < 0) return 'text-amber-600'
  return 'text-blue-600'
}

// Get variance text
function getVarianceText(variance: number) {
  if (variance === 0) return '0'
  if (variance > 0) return `+${variance}`
  return variance.toString()
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

// Calculate total received value
const totalReceivedValue = computed(() => {
  if (!grn.value) return 0
  return grn.value.items.reduce((total, item) => {
    return total + (item.qtyReceived * item.unitCostPrice)
  }, 0)
})

// Check if all items are fulfilled
const allFulfilled = computed(() => {
  if (!grn.value) return false
  return grn.value.items.every(item => item.qtyReceived >= item.qtyOrdered)
})

// Role check for actions
const canManageGRN = computed(() => 
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STOREKEEPER', 'TECHNICAL'])
)

// Confirm GRN
async function handleConfirmGrn() {
  if (!grn.value) return
  if (grn.value.status !== 'DRAFT') return
  if (!canManageGRN.value) {
    toast.error('Insufficient permissions')
    return
  }

  updating.value = true
  try {
    await procurementStore.updateGrn(grn.value.id, {
      status: 'CONFIRMED',
      receivedAt: serverTimestamp()
    })

    // Update PO status
    await procurementStore.updatePurchaseOrder(grn.value.poId, {
      status: allFulfilled.value ? 'COMPLETE' : 'PARTIALLY_FULFILLED'
    })

    toast.success('GRN confirmed')
  } catch (error) {
    console.error('Error confirming GRN:', error)
    toast.error('Failed to confirm GRN')
  } finally {
    updating.value = false
  }
}

// Resolve dispute
async function handleResolveDispute() {
  if (!grn.value) return
  if (grn.value.status !== 'DISPUTED') return
  if (!canManageGRN.value) {
    toast.error('Insufficient permissions')
    return
  }

  updating.value = true
  try {
    await procurementStore.updateGrn(grn.value.id, {
      status: 'CONFIRMED',
      disputeReason: null,
      receivedAt: serverTimestamp()
    })

    // Update PO status
    await procurementStore.updatePurchaseOrder(grn.value.poId, {
      status: allFulfilled.value ? 'COMPLETE' : 'PARTIALLY_FULFILLED'
    })

    toast.success('Dispute resolved, GRN confirmed')
  } catch (error) {
    console.error('Error resolving dispute:', error)
    toast.error('Failed to resolve dispute')
  } finally {
    updating.value = false
  }
}

// Navigate back
function navigateBack() {
  router.push(`/procurement/purchase-orders/${grn.value?.poId || ''}`)
}

// Navigate to PO
function navigateToPO() {
  if (grn.value?.poId) {
    router.push(`/procurement/purchase-orders/${grn.value.poId}`)
  }
}

// Navigate to PR
function navigateToPR() {
  if (grn.value?.prId) {
    router.push(`/procurement/requisitions/${grn.value.prId}`)
  }
}
</script>

<template>
  <div v-if="loading && !grn" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else-if="grn" class="space-y-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="navigateBack">
          <ArrowLeft class="size-4" />
        </Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Goods Receipt Note</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            <span class="font-mono">{{ grn.grnNumber }}</span>
            <Badge :variant="getStatusVariant(grn.status)" :class="getStatusClass(grn.status)" class="uppercase text-xs tracking-wider font-bold">
              {{ getStatusLabel(grn.status) }}
            </Badge>
            <Badge v-if="grn.hasVariance" variant="outline" class="uppercase text-xs tracking-wider font-bold border-amber-500 text-amber-700 bg-amber-50">
              Variance
            </Badge>
          </h2>
          <p class="text-muted-foreground">From PO: 
            <Button variant="link" class="p-0 h-auto" @click="navigateToPO">
              {{ grn.poNumber }}
            </Button>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Actions based on status and role -->
        <template v-if="canManageGRN">
          <template v-if="grn.status === 'DRAFT'">
            <Button variant="outline" @click="router.push(`/procurement/grns/${grn.id}/edit`)">
              Edit GRN
            </Button>
            <Button variant="default" @click="handleConfirmGrn" :disabled="updating">
              <Loader2 v-if="updating" class="size-4 mr-2 animate-spin" />
              <CheckCircle v-else class="size-4 mr-2" />
              Confirm Receipt
            </Button>
          </template>

          <template v-if="grn.status === 'DISPUTED'">
            <Button variant="outline" @click="handleResolveDispute" :disabled="updating">
              <Loader2 v-if="updating" class="size-4 mr-2 animate-spin" />
              Resolve Dispute
            </Button>
          </template>
        </template>

        <!-- Create Invoice -->
        <Button
          v-if="grn.status === 'CONFIRMED'
            && grn.inventoryPostingStatus === 'COMPLETE'
            && !grn.linkedInvoiceId
            && hasAnyRole(['SUPER_ADMIN','ADMIN','ACCOUNTANT','MANAGER'])"
          variant="default"
          @click="router.push(`/procurement/invoices/new?grnId=${grn.id}`)"
        >
          <FileText class="size-4 mr-2" />
          Create Invoice
        </Button>

        <!-- View Linked Invoice -->
        <Button
          v-else-if="grn.linkedInvoiceId"
          variant="outline"
          @click="router.push(`/procurement/invoices/${grn.linkedInvoiceId}`)"
        >
          <FileText class="size-4 mr-2" />
          View Invoice
        </Button>

        <!-- Back to List -->
        <Button variant="outline" @click="router.push('/procurement/grns')">
          <ArrowLeft class="mr-2 size-4" />
          Back to List
        </Button>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column - Info Card (1/3) -->
      <div class="space-y-6">
        <!-- Info Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileText class="size-5" />
              GRN Information
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">GRN Number</p>
              <p class="font-bold font-mono">{{ grn.grnNumber }}</p>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">PO Reference</p>
              <Button variant="link" class="p-0 h-auto" @click="navigateToPO">
                {{ grn.poNumber }}
              </Button>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">PR Reference</p>
              <Button variant="link" class="p-0 h-auto" @click="navigateToPR">
                {{ grn.prNumber }}
              </Button>
            </div>

            <Separator />

            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Supplier</p>
              <p class="font-bold">{{ grn.supplierName }}</p>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Department</p>
              <p class="font-bold">{{ grn.department }}</p>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Received By</p>
              <div class="flex items-center gap-2">
                <User class="size-4 text-muted-foreground" />
                <span class="font-medium">{{ grn.receivedBy }}</span>
              </div>
            </div>

            <div v-if="grn.status === 'CONFIRMED'" class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Received At</p>
              <div class="flex items-center gap-2">
                <Calendar class="size-4 text-muted-foreground" />
                <span class="font-medium">{{ formatDate(grn.receivedAt) }}</span>
              </div>
            </div>

            <div v-if="grn.disputeReason" class="mt-4">
              <Alert variant="destructive">
                <TriangleAlert class="size-4" />
                <AlertDescription class="text-sm">
                  <p class="font-bold mb-1">Dispute Reason</p>
                  <p class="whitespace-pre-line">{{ grn.disputeReason }}</p>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>

        <!-- Posting Status Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Package class="size-5" />
              Inventory Posting
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-center gap-3">
              <div :class="`p-2 rounded-full ${getPostingStatusInfo(grn.inventoryPostingStatus).bg}`">
                <component 
                  :is="getPostingStatusInfo(grn.inventoryPostingStatus).icon" 
                  class="size-5" 
                  :class="[getPostingStatusInfo(grn.inventoryPostingStatus).color, { 'animate-spin': grn.inventoryPostingStatus === 'PROCESSING' }]"
                />
              </div>
              <div>
                <p class="font-bold text-lg" :class="getPostingStatusInfo(grn.inventoryPostingStatus).color">
                  {{ getPostingStatusInfo(grn.inventoryPostingStatus).label }}
                </p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="grn.inventoryPostingStatus === 'PENDING'">
                    Waiting to process...
                  </template>
                  <template v-else-if="grn.inventoryPostingStatus === 'PROCESSING'">
                    Updating inventory...
                  </template>
                  <template v-else-if="grn.inventoryPostingStatus === 'COMPLETE'">
                    Inventory updated successfully
                  </template>
                  <template v-else-if="grn.inventoryPostingStatus === 'FAILED'">
                    Posting failed — contact administrator
                  </template>
                </p>
              </div>
            </div>

            <div v-if="grn.inventoryPostingError" class="mt-3">
              <Alert variant="destructive">
                <AlertCircle class="size-4" />
                <AlertDescription class="text-sm">
                  <p class="font-bold mb-1">Error Details</p>
                  <p class="font-mono text-xs whitespace-pre-wrap">{{ grn.inventoryPostingError }}</p>
                </AlertDescription>
              </Alert>
            </div>

            <div class="pt-3 border-t">
              <p class="text-xs text-muted-foreground">
                This status updates automatically when the Firebase Function processes the GRN.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Column - Line Items Table (2/3) -->
      <div class="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Package class="size-5" />
              Line Items ({{ grn.items.length }})
            </CardTitle>
            <CardDescription>Received quantities and variances</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead class="text-center">UOM</TableHead>
                  <TableHead class="text-center">Ordered</TableHead>
                  <TableHead class="text-center">Received</TableHead>
                  <TableHead class="text-center">Variance</TableHead>
                  <TableHead class="text-right">Unit Cost</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, index) in grn.items" :key="index">
                  <TableCell class="font-mono text-xs">
                    {{ item.sku || 'N/A' }}
                  </TableCell>
                  <TableCell class="font-medium">
                    {{ item.description }}
                  </TableCell>
                  <TableCell class="text-center font-mono">
                    {{ item.uom }}
                  </TableCell>
                  <TableCell class="text-center font-mono">
                    {{ item.qtyOrdered }}
                  </TableCell>
                  <TableCell class="text-center font-mono">
                    {{ item.qtyReceived }}
                  </TableCell>
                  <TableCell class="text-center font-mono font-bold" :class="getVarianceClass(item.qtyVariance)">
                    {{ getVarianceText(item.qtyVariance) }}
                  </TableCell>
                  <TableCell class="text-right font-mono">
                    {{ formatCurrency(item.unitCostPrice) }}
                  </TableCell>
                  <TableCell class="text-sm">
                    {{ item.notes || '—' }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!-- Totals Footer -->
            <div class="mt-6 border-t pt-4">
              <div class="flex justify-between">
                <div>
                  <p class="text-sm text-muted-foreground">
                    Total Ordered Value: {{ formatCurrency(grn.items.reduce((total, item) => total + (item.qtyOrdered * item.unitCostPrice), 0)) }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    Total Received Value: {{ formatCurrency(totalReceivedValue) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-bold">
                    Variance Value: 
                    <span :class="getVarianceClass(totalReceivedValue - grn.items.reduce((total, item) => total + (item.qtyOrdered * item.unitCostPrice), 0))">
                      {{ formatCurrency(totalReceivedValue - grn.items.reduce((total, item) => total + (item.qtyOrdered * item.unitCostPrice), 0)) }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>

  <div v-else class="h-[400px] flex items-center justify-center">
    <Alert variant="destructive">
      <AlertCircle class="size-4" />
      <AlertDescription>
        GRN not found
      </AlertDescription>
    </Alert>
  </div>
</template>