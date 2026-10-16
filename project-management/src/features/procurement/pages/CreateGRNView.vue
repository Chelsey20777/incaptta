<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Calendar,
  Package,
  TriangleAlert,
  CheckCircle,
  AlertCircle,
  Clock,
  Truck
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { toast } from 'vue-sonner'
import type { PurchaseOrder, POStatus, GRNStatus, GRNLineItem } from '../types/procurement'
import type { ProcurementLineItem } from '../types'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const { user: currentUser, hasAnyRole } = useSession()

const poId = route.query.poId as string
const loading = ref(true)
const saving = ref(false)
const purchaseOrder = ref<PurchaseOrder | null>(null)
const receivedAt = ref(format(new Date(), 'yyyy-MM-dd'))
const notes = ref('')

// Line item state
const receivedQtys = ref<number[]>([])
const itemNotes = ref<string[]>([])

// Validation state
const hasVariance = ref(false)
const varianceAcknowledged = ref(false)
const disputeReason = ref('')
const showDisputeDialog = ref(false)

// Fetch purchase order on mount
onMounted(async () => {
  if (!poId) {
    toast.error('No purchase order specified')
    router.push('/procurement/purchase-orders')
    return
  }

  const docRef = doc(db, 'procurementPurchaseOrders', poId)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    toast.error('Purchase Order not found')
    router.push('/procurement/purchase-orders')
    return
  }

  const po = { id: docSnap.id, ...docSnap.data() } as PurchaseOrder

  // Validate PO status
  if (po.status !== 'SENT' && po.status !== 'ACKNOWLEDGED') {
    toast.error('GRN can only be created for sent or acknowledged POs')
    router.push(`/procurement/purchase-orders/${poId}`)
    return
  }

  purchaseOrder.value = po
  // Pre-fill received quantities with ordered quantities
  receivedQtys.value = po.items.map(item => item.qty)
  itemNotes.value = Array(po.items.length).fill('')
  loading.value = false
})

// Watch for variance changes
watch(receivedQtys, (newQtys) => {
  if (!purchaseOrder.value) return
  hasVariance.value = newQtys.some((qty, index) => {
    const poItem = purchaseOrder.value!.items[index]
    return qty !== poItem?.qty
  })
}, { deep: true })

// Format date
function formatDate(date: any) {
  if (!date) return 'N/A'
  try {
    return format(date.toDate(), 'MMM dd, yyyy HH:mm')
  } catch {
    return 'Invalid date'
  }
}

// Calculate variance for a line item
function calculateVariance(received: number, ordered: number) {
  return received - ordered
}

// Get safe received quantity (fallback to ordered quantity)
function getSafeReceivedQty(index: number): number {
  const received = receivedQtys.value[index]
  return received ?? purchaseOrder.value?.items[index]?.qty ?? 0
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

// Get inventory item status badge
function getItemStatusBadge(status: 'EXISTING' | 'NEW_PENDING' | 'ADHOC') {
  switch (status) {
    case 'EXISTING':
      return { variant: 'secondary' as const, label: 'Existing' }
    case 'NEW_PENDING':
      return { variant: 'default' as const, label: 'Pending Registration' }
    case 'ADHOC':
      return { variant: 'outline' as const, label: 'Ad-hoc' }
    default:
      return { variant: 'secondary' as const, label: status }
  }
}

// Validate form
function validateForm(status: GRNStatus) {
  if (status === 'CONFIRMED') {
    // All quantities must be >= 0
    if (receivedQtys.value.some(qty => qty < 0)) {
      toast.error('All received quantities must be zero or greater')
      return false
    }
    
    // At least one item must have qty > 0
    if (!receivedQtys.value.some(qty => qty > 0)) {
      toast.error('At least one item must have a quantity greater than zero')
      return false
    }
    
    // If variance exists, must be acknowledged
    if (hasVariance.value && !varianceAcknowledged.value) {
      toast.error('Please acknowledge the quantity variances before confirming')
      return false
    }
  }
  
  return true
}

// Save GRN
async function saveGrn(status: GRNStatus) {
  if (!purchaseOrder.value || !currentUser.value) return
  
  if (!validateForm(status)) return
  
  saving.value = true
  
  try {
    // Build GRN line items (ensure all received quantities are defined)
    const grnItems: GRNLineItem[] = purchaseOrder.value.items.map((poItem, index) => {
      const qtyReceived = receivedQtys.value[index] ?? poItem.qty
      return {
        lineItemId: poItem.id,
        sku: poItem.sku || null,
        description: poItem.description,
        uom: poItem.uom,
        inventoryItemId: poItem.inventoryItemId || null,
        inventoryItemStatus: poItem.inventoryItemStatus || 'EXISTING',
        qtyOrdered: poItem.qty,
        qtyReceived: qtyReceived,
        qtyVariance: qtyReceived - poItem.qty,
        unitCostPrice: poItem.unitCostPrice,
        notes: itemNotes.value[index] || ''
      }
    })
    
    // Calculate if there's any variance
    const hasVarianceCalc = grnItems.some(item => item.qtyVariance !== 0)
    
    // Save GRN
    const grnId = await procurementStore.addGrn({
      poId: purchaseOrder.value.id,
      poNumber: purchaseOrder.value.poNumber,
      prId: purchaseOrder.value.prId,
      prNumber: purchaseOrder.value.prNumber,
      supplierId: purchaseOrder.value.supplierId,
      supplierName: purchaseOrder.value.supplierName,
      department: purchaseOrder.value.department,
      procurementType: purchaseOrder.value.procurementType,
      jobCardId: purchaseOrder.value.jobCardId,
      items: grnItems,
      status,
      hasVariance: hasVarianceCalc,
      disputeReason: status === 'DISPUTED' ? disputeReason.value : null,
      receivedBy: currentUser.value.uid,
      receivedAt: status === 'CONFIRMED' ? serverTimestamp() : null,
      createdBy: currentUser.value.uid
    })
    
    // Update PO status if confirmed
    if (status === 'CONFIRMED') {
      const allFulfilled = grnItems.every(
        item => item.qtyReceived >= item.qtyOrdered
      )
      await procurementStore.updatePurchaseOrder(purchaseOrder.value.id, {
        status: allFulfilled ? 'COMPLETE' : 'PARTIALLY_FULFILLED'
      })
      toast.success('Goods received and confirmed', {
        description: 'Inventory will be updated shortly.'
      })
    } else if (status === 'DRAFT') {
      toast.success('GRN saved as draft')
    } else if (status === 'DISPUTED') {
      toast.warning('GRN marked as disputed')
    }
    
    router.push(`/procurement/grns/${grnId}`)
  } catch (error) {
    console.error('Error saving GRN:', error)
    toast.error('Failed to save GRN')
  } finally {
    saving.value = false
  }
}

// Navigate back
function navigateBack() {
  router.back()
}
</script>

<template>
  <div v-if="loading" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else-if="purchaseOrder" class="space-y-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="navigateBack">
          <ArrowLeft class="size-4" />
        </Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Goods Receipt Note</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            Receive Goods
          </h2>
          <p class="text-muted-foreground">
            GRN for {{ purchaseOrder.poNumber }} — {{ purchaseOrder.supplierName }}
          </p>
        </div>
      </div>
    </div>

    <!-- Main Form -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column - Form (2/3) -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Section 1: Receipt Info -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Calendar class="size-5" />
              Receipt Information
            </CardTitle>
            <CardDescription>Enter details about the goods received</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label for="receivedAt">Date Received <span class="text-destructive">*</span></Label>
              <Input
                id="receivedAt"
                v-model="receivedAt"
                type="date"
                required
              />
            </div>
            
            <div class="space-y-2">
              <Label for="notes">General Notes</Label>
              <Textarea
                id="notes"
                v-model="notes"
                placeholder="Condition of goods, delivery notes, packaging details..."
                rows="3"
              />
            </div>
          </CardContent>
        </Card>

        <!-- Section 2: Line Items Table -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Package class="size-5" />
              Line Items
            </CardTitle>
            <CardDescription>Enter received quantities for each item</CardDescription>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, index) in purchaseOrder.items" :key="index">
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
                    {{ item.qty }}
                  </TableCell>
                  <TableCell>
                    <Input
                      v-model.number="receivedQtys[index]"
                      type="number"
                      :min="0"
                      class="w-24 mx-auto text-center"
                      :class="receivedQtys[index] !== item.qty ? 'border-amber-500 bg-amber-50' : ''"
                    />
                  </TableCell>
                  <TableCell class="text-center font-mono font-bold" :class="getVarianceClass(calculateVariance(getSafeReceivedQty(index), item.qty))">
                    {{ getVarianceText(calculateVariance(getSafeReceivedQty(index), item.qty)) }}
                  </TableCell>
                  <TableCell>
                    <Badge :variant="getItemStatusBadge(item.inventoryItemStatus || 'EXISTING').variant">
                      {{ getItemStatusBadge(item.inventoryItemStatus || 'EXISTING').label }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      v-model="itemNotes[index]"
                      placeholder="Item notes..."
                      class="w-full"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!-- Variance Summary -->
            <div v-if="hasVariance" class="mt-6">
              <Alert variant="destructive">
                <TriangleAlert class="size-4" />
                <AlertDescription>
                  <p class="font-bold mb-1">Quantity variances detected</p>
                  <p class="text-sm">
                    Some quantities differ from the PO. You can still confirm — variances will be recorded.
                    Or mark as Disputed to flag for resolution.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Column - Actions & Summary (1/3) -->
      <div class="space-y-6">
        <!-- Actions Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <CheckCircle class="size-5" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Variance Acknowledgement -->
            <div v-if="hasVariance" class="space-y-3">
              <Alert variant="destructive">
                <AlertCircle class="size-4" />
                <AlertDescription class="text-sm">
                  <p class="font-bold mb-1">Variances require acknowledgement</p>
                  <p>Please confirm the quantities are correct.</p>
                </AlertDescription>
              </Alert>
              
              <div class="flex items-start gap-2">
                <Checkbox
                  id="varianceAck"
                  v-model:checked="varianceAcknowledged"
                />
                <Label for="varianceAck" class="text-sm font-normal leading-snug">
                  I confirm the quantities above are correct, including any variances from the PO
                </Label>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="space-y-3">
              <Button
                variant="outline"
                class="w-full"
                :disabled="saving"
                @click="saveGrn('DRAFT')"
              >
                <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
                Save as Draft
              </Button>
              
              <Button
                variant="default"
                class="w-full"
                :disabled="saving || (hasVariance && !varianceAcknowledged)"
                @click="saveGrn('CONFIRMED')"
              >
                <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
                <CheckCircle v-else class="size-4 mr-2" />
                Confirm Receipt
              </Button>
              
              <Button
                v-if="hasVariance"
                variant="destructive"
                class="w-full"
                :disabled="saving"
                @click="showDisputeDialog = true"
              >
                <AlertCircle class="size-4 mr-2" />
                Mark as Disputed
              </Button>
            </div>

            <!-- PO Info -->
            <div class="pt-4 border-t space-y-3">
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Purchase Order</p>
                <p class="font-bold font-mono">{{ purchaseOrder.poNumber }}</p>
              </div>
              
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Supplier</p>
                <p class="font-bold">{{ purchaseOrder.supplierName }}</p>
              </div>
              
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Department</p>
                <p class="font-bold">{{ purchaseOrder.department }}</p>
              </div>
              
              <div v-if="purchaseOrder.jobCardTitle" class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Job Card</p>
                <p class="font-bold">{{ purchaseOrder.jobCardTitle }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Status Timeline -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Clock class="size-5" />
              PO Status
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <FileText class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Created</p>
                <p class="font-medium">{{ formatDate(purchaseOrder.createdAt) }}</p>
              </div>
            </div>
            
            <div class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <Truck class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Status</p>
                <Badge :variant="purchaseOrder.status === 'SENT' ? 'default' : 'default'">
                  {{ purchaseOrder.status }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Dispute Dialog (simplified inline version) -->
    <div v-if="showDisputeDialog" class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <AlertCircle class="size-5" />
            Mark as Disputed
          </CardTitle>
          <CardDescription>Provide a reason for the dispute</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <Label for="disputeReason">Dispute Reason <span class="text-destructive">*</span></Label>
            <Textarea
              id="disputeReason"
              v-model="disputeReason"
              placeholder="Explain the reason for disputing this GRN..."
              rows="4"
              required
            />
            <p class="text-xs text-muted-foreground">Minimum 10 characters required</p>
          </div>
        </CardContent>
        <CardContent class="flex justify-end gap-2 pt-0">
          <Button variant="outline" @click="showDisputeDialog = false">
            Cancel
          </Button>
          <Button
            variant="destructive"
            :disabled="disputeReason.length < 10 || saving"
            @click="saveGrn('DISPUTED')"
          >
            <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
            Mark as Disputed
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>