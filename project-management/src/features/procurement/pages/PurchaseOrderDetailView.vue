<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { generatePurchaseOrderPdf } from '../utils/generatePOPdf'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Calendar,
  Truck,
  DollarSign,
  Package,
  User,
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle,
  Eye,
  Printer
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { toast } from 'vue-sonner'
import type { PurchaseOrder, POStatus } from '../types/procurement'
import type { ProcurementType, ProcurementLineItem } from '../types'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const jobCardsStore = useJobCardsStore()
const adminStore = useAdminStore()
const { user: currentUser, hasAnyRole } = useSession()

const purchaseOrderId = route.params.id as string
const loading = ref(true)
const purchaseOrder = ref<PurchaseOrder | null>(null)
const isUpdating = ref(false)
const isPrinting = ref(false)

// Fetch purchase order on mount
onMounted(async () => {
  const docRef = doc(db, 'procurementPurchaseOrders', purchaseOrderId)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    toast.error('Purchase Order not found')
    router.push('/procurement/purchase-orders')
    return
  }

  purchaseOrder.value = {
    id: docSnap.id,
    ...docSnap.data()
  } as PurchaseOrder
  loading.value = false

  // Write linkedPoId to job card item — run once only (using jobCardLinkedPoWritten flag)
  const po = purchaseOrder.value
  if (po.jobCardId && po.prId && po.id && !po.jobCardLinkedPoWritten) {
    try {
      const { doc: firestoreDoc, getDoc: firestoreGetDoc } = await import('firebase/firestore')
      const prSnap = await firestoreGetDoc(firestoreDoc(db, 'procurementRequisitions', po.prId))
      if (prSnap.exists()) {
        const prData = prSnap.data()
        // Find the item that has this PR linked
        // Use the first item's inventoryItemId as anchor
        // OR search by linkedPrId in job card items
        const firstItem = prData.items?.[0]
        
        if (firstItem?.inventoryItemId) {
          await jobCardsStore.updateJobCardItemPrLink(
            po.jobCardId,
            firstItem.inventoryItemId,
            po.prId,
            po.prNumber,
            po.id  // poId
          )

          // Mark as written on PO to prevent re-runs
          const { updateDoc } = await import('firebase/firestore')
          await updateDoc(
            firestoreDoc(db, 'procurementPurchaseOrders', po.id),
            { jobCardLinkedPoWritten: true }
          )
        }
      }
    } catch (e) {
      // Non-critical — log but don't surface to user
      console.error('Failed to write linkedPoId:', e)
    }
  }

  // Backfill linkedPoId on the job card item if not already set (legacy fallback)
  if (po.jobCardId && po.prId && po.id) {
    try {
      const { doc: firestoreDoc, getDoc: firestoreGetDoc } = await import('firebase/firestore')
      const prSnap = await firestoreGetDoc(firestoreDoc(db, 'procurementRequisitions', po.prId))
      if (prSnap.exists()) {
        const prData = prSnap.data()
        const firstItem = prData.items?.[0]
        // Only backfill if the item doesn't already have linkedPoId set
        const jobCardSnap = await firestoreGetDoc(firestoreDoc(db, 'jobCards', po.jobCardId))
        if (jobCardSnap.exists()) {
          const jcData = jobCardSnap.data()
          const allItems: any[] = []
          for (const section of (jcData.requisitionSections ?? [])) {
            allItems.push(...(section.items ?? []))
          }
          for (const item of (jcData.requisitionItems ?? [])) {
            if (!allItems.find((i: any) => i.id === item.id)) allItems.push(item)
          }
          const linkedItem = allItems.find((i: any) => i.linkedPrId === po.prId)
          if (linkedItem && !linkedItem.linkedPoId) {
            await jobCardsStore.updateJobCardItemPrLink(
              po.jobCardId,
              linkedItem.id,
              po.prId,
              po.prNumber,
              po.id
            )
          }
        }
      }
    } catch {
      // Backfill is best-effort — don't block the page on failure
    }
  }
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

// Get procurement type badge variant
function getProcurementTypeVariant(type: ProcurementType) {
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
function getProcurementTypeLabel(type: ProcurementType) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'Project Material'
    case 'INVENTORY': return 'Inventory'
    case 'CAPEX': return 'CAPEX'
    case 'SERVICE': return 'Service'
    case 'ADHOC': return 'Ad-hoc'
    default: return type
  }
}

// Get payment terms badge variant
function getPaymentTermsVariant(terms: string) {
  switch (terms) {
    case 'COD': return 'secondary'
    case 'NET30': return 'default'
    case 'NET60': return 'default'
    case 'NET90': return 'default'
    default: return 'outline'
  }
}

// Calculate line item totals
const lineItemTotals = computed(() => {
  if (!purchaseOrder.value) return { totalCost: 0 }
  return purchaseOrder.value.items.reduce(
    (acc, item) => ({
      totalCost: acc.totalCost + item.totalCost,
    }),
    { totalCost: 0 }
  )
})

// Role check for actions
const canManagePO = computed(() => 
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL'])
)

// Role check for GRN creation
const canCreateGRN = computed(() => 
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STOREKEEPER', 'TECHNICAL'])
)

// Handle Mark as Sent
async function handleMarkAsSent() {
  if (!purchaseOrder.value) return
  if (purchaseOrder.value.status !== 'DRAFT') return
  if (!canManagePO.value) {
    toast.error('Insufficient permissions')
    return
  }

  isUpdating.value = true
  try {
    await procurementStore.updatePurchaseOrder(purchaseOrder.value.id, {
      status: 'SENT',
      sentAt: serverTimestamp() as any
    })
    
    // Update local state
    purchaseOrder.value.status = 'SENT'
    
    toast.success('PO marked as sent')
  } catch (error) {
    console.error('Error marking PO as sent:', error)
    toast.error('Failed to update PO status')
  } finally {
    isUpdating.value = false
  }
}

// Navigate to Create GRN
function navigateToCreateGRN() {
  if (!purchaseOrder.value) return
  if (!canCreateGRN.value) {
    toast.error('Insufficient permissions')
    return
  }
  
  // Check if PO is in valid status for GRN creation
  if (purchaseOrder.value.status !== 'SENT' && purchaseOrder.value.status !== 'ACKNOWLEDGED') {
    toast.error('GRN can only be created for sent or acknowledged POs')
    return
  }
  
  router.push(`/procurement/grns/new?poId=${purchaseOrder.value.id}`)
}

// Handle Mark as Acknowledged
async function handleMarkAsAcknowledged() {
  if (!purchaseOrder.value) return
  if (purchaseOrder.value.status !== 'SENT') return
  if (!canManagePO.value) {
    toast.error('Insufficient permissions')
    return
  }

  isUpdating.value = true
  try {
    await procurementStore.updatePurchaseOrder(purchaseOrder.value.id, {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: serverTimestamp() as any
    })
    
    // Update local state
    purchaseOrder.value.status = 'ACKNOWLEDGED'
    
    toast.success('PO acknowledged by supplier')
  } catch (error) {
    console.error('Error marking PO as acknowledged:', error)
    toast.error('Failed to update PO status')
  } finally {
    isUpdating.value = false
  }
}


// Navigate back
function navigateBack() {
  router.push('/procurement/purchase-orders')
}

// Navigate to PR detail
function navigateToPR() {
  if (purchaseOrder.value?.prId) {
    router.push(`/procurement/requisitions/${purchaseOrder.value.prId}`)
  }
}

// Download PO as PDF
async function handleDownloadPdf() {
  if (!purchaseOrder.value) return
  isPrinting.value = true
  try {
    // Ensure company settings are loaded
    if (!adminStore.appSettings) {
      await adminStore.fetchSettings()
    }
    await generatePurchaseOrderPdf(
      purchaseOrder.value,
      adminStore.appSettings ?? undefined,
      adminStore.appSettings ?? undefined,
      currentUser.value?.displayName ?? currentUser.value?.email ?? undefined
    )
  } catch (err) {
    console.error('PDF generation failed:', err)
    toast.error('Failed to generate PDF', { description: 'Please try again.' })
  } finally {
    isPrinting.value = false
  }
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
        <Button variant="outline" size="icon" @click="navigateBack"><ArrowLeft class="size-4" /></Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Purchase Order</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            <span class="font-mono">{{ purchaseOrder.poNumber }}</span>
            <Badge :variant="getStatusVariant(purchaseOrder.status)" :class="getStatusClass(purchaseOrder.status)" class="uppercase text-xs tracking-wider font-bold">
              {{ getStatusLabel(purchaseOrder.status) }}
            </Badge>
            <Badge :class="`badge-${getProcurementTypeVariant(purchaseOrder.procurementType)}`" class="uppercase text-xs tracking-wider font-bold">
              {{ getProcurementTypeLabel(purchaseOrder.procurementType) }}
            </Badge>
          </h2>
          <p class="text-muted-foreground">From PR: 
            <Button variant="link" class="p-0 h-auto" @click="navigateToPR">
              {{ purchaseOrder.prNumber }}
            </Button>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Actions based on status and role -->
        <template v-if="purchaseOrder.status === 'DRAFT' && canManagePO">
          <Button @click="handleMarkAsSent" :disabled="isUpdating">
            <Loader2 v-if="isUpdating" class="size-4 mr-2 animate-spin" />
            <Send v-else class="size-4 mr-2" />
            Mark as Sent
          </Button>
        </template>

        <template v-if="purchaseOrder.status === 'SENT' && canManagePO">
          <Button variant="outline" @click="handleMarkAsAcknowledged" :disabled="isUpdating">
            <Loader2 v-if="isUpdating" class="size-4 mr-2 animate-spin" />
            <CheckCircle v-else class="size-4 mr-2" />
            Mark as Acknowledged
          </Button>
        </template>

        <!-- Receive Goods Button (for SENT or ACKNOWLEDGED POs) -->
        <template v-if="(purchaseOrder.status === 'SENT' || purchaseOrder.status === 'ACKNOWLEDGED') && canCreateGRN">
          <Button variant="default" @click="navigateToCreateGRN">
            <Package class="mr-2 size-4" />
            Receive Goods
          </Button>
        </template>

        <!-- Download PDF -->
        <Button variant="outline" @click="handleDownloadPdf" :disabled="isPrinting">
          <Loader2 v-if="isPrinting" class="mr-2 size-4 animate-spin" />
          <Printer v-else class="mr-2 size-4" />
          {{ isPrinting ? 'Generating...' : 'Download PDF' }}
        </Button>

        <!-- Back to List -->
        <Button variant="outline" @click="navigateBack">
          <ArrowLeft class="mr-2 size-4" />
          Back to List
        </Button>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column - Main Info (2/3 on desktop) -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Main Information Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <FileText class="size-5" />
              Purchase Order Details
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-6">
            <!-- Basic Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Department</p>
                <p class="font-bold text-lg">{{ purchaseOrder.department }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Job Card</p>
                <p v-if="purchaseOrder.jobCardTitle" class="font-bold">{{ purchaseOrder.jobCardTitle }}</p>
                <p v-else class="text-muted-foreground italic">Not linked</p>
              </div>
            </div>

            <Separator />

            <!-- Supplier Information -->
            <div>
              <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                <Truck class="size-5" />
                Supplier Information
              </h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-3">
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Supplier Name</p>
                    <p class="text-xl font-bold">{{ purchaseOrder.supplierName }}</p>
                  </div>
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <Mail class="size-4 text-muted-foreground" />
                      <span class="font-medium">{{ purchaseOrder.supplierEmail }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <Phone class="size-4 text-muted-foreground" />
                      <span class="font-medium">{{ purchaseOrder.supplierPhone }}</span>
                    </div>
                  </div>
                </div>
                <div class="space-y-3">
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Payment Terms</p>
                    <Badge :variant="getPaymentTermsVariant(purchaseOrder.paymentTerms)">
                      {{ purchaseOrder.paymentTerms }}
                    </Badge>
                  </div>
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Delivery Address</p>
                    <div class="flex items-start gap-2">
                      <MapPin class="size-4 text-muted-foreground mt-0.5" />
                      <span class="font-medium">{{ purchaseOrder.deliveryAddress }}</span>
                    </div>
                  </div>
                  <div class="space-y-1" v-if="purchaseOrder.expectedDeliveryDate">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Expected Delivery</p>
                    <div class="flex items-center gap-2">
                      <Calendar class="size-4 text-muted-foreground" />
                      <span class="font-medium">{{ formatShortDate(purchaseOrder.expectedDeliveryDate) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <!-- Notes -->
            <div v-if="purchaseOrder.notes">
              <h3 class="font-bold text-lg mb-2">Notes</h3>
              <p class="text-foreground whitespace-pre-line">{{ purchaseOrder.notes }}</p>
            </div>
          </CardContent>
        </Card>

        <!-- Line Items Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Package class="size-5" />
              Line Items ({{ purchaseOrder.items.length }})
            </CardTitle>
            <CardDescription>Items copied from approved purchase requisition</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead class="text-center">UOM</TableHead>
                  <TableHead class="text-center">Qty</TableHead>
                  <TableHead class="text-right">Unit Cost</TableHead>
                  <TableHead class="text-right">Freight/Duty</TableHead>
                  <TableHead class="text-right">Total Cost</TableHead>
                  <TableHead class="text-right">Markup</TableHead>
                  <TableHead class="text-right">Selling Price</TableHead>
                  <TableHead class="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, index) in purchaseOrder.items" :key="index">
                  <TableCell class="font-medium">
                    <div>
                      <p>{{ item.description }}</p>
                      <p v-if="item.sku" class="text-xs text-muted-foreground mt-1">SKU: {{ item.sku }}</p>
                    </div>
                  </TableCell>
                  <TableCell class="text-center font-mono">{{ item.uom }}</TableCell>
                  <TableCell class="text-center font-mono">{{ item.qty }}</TableCell>
                  <TableCell class="text-right font-mono">{{ formatCurrency(item.unitCostPrice) }}</TableCell>
                  <TableCell class="text-right font-mono">{{ formatCurrency(item.freightDuty) }}</TableCell>
                  <TableCell class="text-right font-bold">{{ formatCurrency(item.totalCost) }}</TableCell>
                  <TableCell class="text-right font-mono">{{ item.markupPercent }}%</TableCell>
                  <TableCell class="text-right font-bold text-green-600">{{ formatCurrency(item.sellingPrice) }}</TableCell>
                  <TableCell class="text-right font-bold text-blue-600">{{ formatCurrency(item.marginAmount) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!-- Totals Footer -->
            <div class="mt-6 border-t pt-4">
              <div class="flex justify-end">
                <div class="w-64 space-y-2">
                  <div class="flex justify-between">
                    <span class="font-medium">Total Order Value:</span>
                    <span class="font-bold text-2xl">{{ formatCurrency(lineItemTotals.totalCost) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Column - Summary (1/3 on desktop) -->
      <div class="space-y-6">
        <!-- Summary Card -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <DollarSign class="size-5" />
              Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Order Value</p>
              <p class="text-3xl font-bold text-brand-secondary">{{ formatCurrency(purchaseOrder.totalOrderValue) }}</p>
            </div>

            <Separator />

            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <Calendar class="size-4 text-muted-foreground" />
                <div class="flex-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Created</p>
                  <p class="font-medium">{{ formatDate(purchaseOrder.createdAt) }}</p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <User class="size-4 text-muted-foreground" />
                <div class="flex-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Created By</p>
                  <p class="font-medium">{{ purchaseOrder.createdBy }}</p>
                </div>
              </div>

              <div v-if="purchaseOrder.sentAt" class="flex items-center gap-2">
                <Send class="size-4 text-blue-500" />
                <div class="flex-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Sent At</p>
                  <p class="font-medium text-blue-600">{{ formatDate(purchaseOrder.sentAt) }}</p>
                </div>
              </div>

              <div v-if="purchaseOrder.acknowledgedAt" class="flex items-center gap-2">
                <CheckCircle class="size-4 text-purple-500" />
                <div class="flex-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Acknowledged At</p>
                  <p class="font-medium text-purple-600">{{ formatDate(purchaseOrder.acknowledgedAt) }}</p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Clock class="size-4 text-muted-foreground" />
                <div class="flex-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Last Updated</p>
                  <p class="font-medium">{{ formatDate(purchaseOrder.updatedAt) }}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Status Timeline -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Clock class="size-5" />
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <FileText class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Created</p>
                <p class="font-medium">{{ formatShortDate(purchaseOrder.createdAt) }}</p>
              </div>
            </div>

            <div v-if="purchaseOrder.status === 'SENT' || purchaseOrder.status === 'ACKNOWLEDGED' || purchaseOrder.status === 'PARTIALLY_FULFILLED' || purchaseOrder.status === 'COMPLETE'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                <Send class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-blue-600">Sent to Supplier</p>
                <p v-if="purchaseOrder.sentAt" class="font-medium">{{ formatShortDate(purchaseOrder.sentAt) }}</p>
                <p v-else class="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>

            <div v-if="purchaseOrder.status === 'ACKNOWLEDGED' || purchaseOrder.status === 'PARTIALLY_FULFILLED' || purchaseOrder.status === 'COMPLETE'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                <CheckCircle class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-purple-600">Acknowledged</p>
                <p v-if="purchaseOrder.acknowledgedAt" class="font-medium">{{ formatShortDate(purchaseOrder.acknowledgedAt) }}</p>
                <p v-else class="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>

            <div v-if="purchaseOrder.status === 'PARTIALLY_FULFILLED'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                <Package class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-amber-600">Partially Fulfilled</p>
                <p class="text-xs text-muted-foreground">Some items received</p>
              </div>
            </div>

            <div v-if="purchaseOrder.status === 'COMPLETE'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600">
                <CheckCircle class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-green-600">Complete</p>
                <p class="text-xs text-muted-foreground">All items received</p>
              </div>
            </div>

            <div v-if="purchaseOrder.status === 'CANCELLED'" class="flex items-start gap-3">
              <div class="mt-0.5 p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
                <FileText class="size-3" />
              </div>
              <div>
                <p class="font-bold text-xs uppercase text-red-600">Cancelled</p>
                <p class="text-xs text-muted-foreground">Order cancelled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
