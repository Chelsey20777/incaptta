<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useSession } from '@/composables/useSession'
import type { ProcurementType, PRStatus, ProcurementLineItem, InventoryItemStatus, NewItemData, Supplier } from '../types'
import type { InventorySearchResult } from '@/composables/useInventorySearch'
import { db } from '@/lib/firebase'
import InventoryItemPicker from '../components/InventoryItemPicker.vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertCircle, ArrowLeft, Plus, Loader2, Trash2, Info } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const router = useRouter()
const procurementStore = useProcurementStore()
const jobCardsStore = useJobCardsStore()
const { user: sessionUser } = useSession()
const isSubmitting = ref(false)

// Job Card state
const jobCards = ref<{id: string, label: string}[]>([])
const selectedJobCardId = ref<string>('')
const selectedJobCardTitle = ref<string | null>(null)
const loadingJobCards = ref(false)

// Form state
const requisitionForm = reactive({
  title: '',
  description: '',
  procurementType: 'PROJECT_MATERIAL' as ProcurementType,
  department: 'AGF',
  supplierId: null as string | null,
  notes: '',
})

// Extended line item type with new item data for NEW_PENDING
interface ExtendedProcurementLineItem extends Partial<ProcurementLineItem> {
  id: string
  inventoryItemStatus: InventoryItemStatus
  isAdHoc: boolean
  newItemData?: NewItemData | null
}

// Line items state
const lineItems = ref<ExtendedProcurementLineItem[]>([
  {
    id: crypto.randomUUID(),
    description: '',
    uom: 'PCS',
    qty: 1,
    unitCostPrice: 0,
    freightDuty: 0,
    totalCost: 0,
    markupPercent: 0,
    sellingPrice: 0,
    marginAmount: 0,
    inventoryItemId: null,
    sku: null,
    isAdHoc: false,
    inventoryItemStatus: 'EXISTING' as InventoryItemStatus,
    notes: '',
    newItemData: null,
  }
])

// UOM options
const uomOptions = ['PCS', 'KG', 'METER', 'LITER', 'BOX', 'PACK', 'SET', 'UNIT']

// Department options
const departmentOptions = ['AGF', 'SALES', 'TECHNICAL', 'ADMIN', 'OTHER']

// Procurement type options with labels
const procurementTypeOptions: { value: ProcurementType, label: string }[] = [
  { value: 'PROJECT_MATERIAL', label: 'Project Material' },
  { value: 'INVENTORY', label: 'Stock Replenishment' },
  { value: 'CAPEX', label: 'Machinery / Asset' },
  { value: 'SERVICE', label: 'Service / Subcontractor' },
  { value: 'ADHOC', label: 'Ad-hoc / One-off' },
]

// Filtered suppliers (ACTIVE only)
const activeSuppliers = computed(() => {
  return procurementStore.suppliers.filter((supplier: Supplier) => supplier.status === 'ACTIVE')
})

// Fetch suppliers on mount
onMounted(() => {
  procurementStore.fetchSuppliers()
})

// Watch line items to recalculate computed fields
watch(lineItems, (items) => {
  items.forEach((item, index) => {
    const unitCost = Number(item.unitCostPrice || 0)
    const freight = Number(item.freightDuty || 0)
    const qty = Number(item.qty || 0)
    const markup = Number(item.markupPercent || 0)
    
    // Calculate total cost
    const totalCost = (unitCost + freight) * qty
    item.totalCost = totalCost
    
    // Calculate selling price
    const sellingPrice = totalCost * (1 + markup / 100)
    item.sellingPrice = sellingPrice
    
    // Calculate margin amount
    item.marginAmount = sellingPrice - totalCost
  })
}, { deep: true })

// Watch procurement type to fetch job cards when type is PROJECT_MATERIAL
watch(
  () => requisitionForm.procurementType,
  (type) => {
    if (type === 'PROJECT_MATERIAL') {
      fetchJobCards()
    } else {
      // Clear job card selection when type changes away from PROJECT_MATERIAL
      selectedJobCardId.value = ''
      selectedJobCardTitle.value = null
    }
  },
  { immediate: true }
)

// Watch selected job card to update title
watch(selectedJobCardId, (val) => {
  const jc = jobCards.value.find(j => j.id === val)
  selectedJobCardTitle.value = jc?.label ?? null
})

// Handle item selection from InventoryItemPicker
function handleItemSelected(item: InventorySearchResult, index: number) {
  const lineItem = lineItems.value[index]
  if (!lineItem) return
  
  // Auto-fill fields from selected inventory item
  lineItem.description = item.name
  lineItem.sku = item.sku
  lineItem.uom = item.uom
  lineItem.unitCostPrice = item.purchasePrice
  lineItem.freightDuty = item.freightDuty
  lineItem.markupPercent = item.markupPercent
  lineItem.inventoryItemId = item.id
  lineItem.inventoryItemStatus = 'EXISTING'
  lineItem.isAdHoc = false
  
  // Clear new item data if it exists
  delete lineItem.newItemData
}

// Handle item not found from InventoryItemPicker
function handleItemNotFound(searchQuery: string, inventoryItemStatus: 'NEW_PENDING' | 'ADHOC', index: number) {
  const lineItem = lineItems.value[index]
  if (!lineItem) return
  
  if (inventoryItemStatus === 'ADHOC') {
    // ADHOC one-off expense
    lineItem.description = searchQuery
    lineItem.inventoryItemStatus = 'ADHOC'
    lineItem.isAdHoc = true
    lineItem.sku = null
    lineItem.inventoryItemId = null
    lineItem.uom = 'PCS' // Default UOM for adhoc
    lineItem.unitCostPrice = 0
    lineItem.freightDuty = 0
    lineItem.markupPercent = 0
    
    // Clear new item data if it exists
    lineItem.newItemData = null
  } else if (inventoryItemStatus === 'NEW_PENDING') {
    // NEW_PENDING - will create inventory on GRN
    lineItem.inventoryItemStatus = 'NEW_PENDING'
    lineItem.isAdHoc = false
    lineItem.sku = null
    lineItem.inventoryItemId = null
    
    // Set up new item data
    lineItem.newItemData = {
      name: searchQuery,
      sku: '',
      uom: 'PCS',
      categoryId: '',
      categoryName: '',
      purchasePrice: 0,
      freightDuty: 0,
      markupPercent: 0,
      reorderLevel: 0,
      location: ''
    }
    
    // Auto-fill description from search query
    lineItem.description = searchQuery
    lineItem.uom = 'PCS'
    lineItem.unitCostPrice = 0
    lineItem.freightDuty = 0
    lineItem.markupPercent = 0
  }
}

// Handle picker cleared
function handlePickerCleared(index: number) {
  const lineItem = lineItems.value[index]
  if (!lineItem) return
  
  // Reset all auto-filled fields
  lineItem.description = ''
  lineItem.sku = null
  lineItem.uom = 'PCS'
  lineItem.unitCostPrice = 0
  lineItem.freightDuty = 0
  lineItem.markupPercent = 0
  lineItem.inventoryItemId = null
  lineItem.inventoryItemStatus = 'EXISTING'
  lineItem.isAdHoc = false
  
  // Clear new item data
  lineItem.newItemData = null
}

// Fetch job cards
async function fetchJobCards() {
  if (jobCards.value.length > 0) return // already loaded
  loadingJobCards.value = true
  try {
    const { collection, getDocs, query, orderBy, limit } =
      await import('firebase/firestore')
    const snap = await getDocs(
      query(
        collection(db, 'jobCards'),
        orderBy('createdAt', 'desc'),
        limit(100)
      )
    )
    jobCards.value = snap.docs
      .filter(d => !['COMPLETED', 'CANCELLED'].includes(d.data().status))
      .slice(0, 50)
      .map(d => ({
        id: d.id,
        label: `${d.data().generalInfo?.jobNumber ?? d.id} — ${d.data().generalInfo?.recipientName ?? d.data().generalInfo?.jobTitle ?? 'Untitled'}`
      }))
  } catch (error) {
    console.error('Error fetching job cards:', error)
    toast.error('Failed to load job cards')
  } finally {
    loadingJobCards.value = false
  }
}

// Sync selectedJobCardTitle when selectedJobCardId changes
watch(selectedJobCardId, (id) => {
  const match = jobCards.value.find(jc => jc.id === id)
  selectedJobCardTitle.value = match?.label ?? null
})

// Add new line item
function addLineItem() {
  lineItems.value.push({
    id: crypto.randomUUID(),
    description: '',
    uom: 'PCS',
    qty: 1,
    unitCostPrice: 0,
    freightDuty: 0,
    totalCost: 0,
    markupPercent: 0,
    sellingPrice: 0,
    marginAmount: 0,
    inventoryItemId: null,
    sku: null,
    isAdHoc: false,
    inventoryItemStatus: 'EXISTING' as InventoryItemStatus,
    notes: '',
    newItemData: null,
  })
}

// Remove line item
function removeLineItem(index: number) {
  if (lineItems.value.length > 1) {
    lineItems.value.splice(index, 1)
  } else {
    // Reset the only item instead of removing
    lineItems.value[0] = {
      id: crypto.randomUUID(),
      description: '',
      uom: 'PCS',
      qty: 1,
      unitCostPrice: 0,
      freightDuty: 0,
      totalCost: 0,
      markupPercent: 0,
      sellingPrice: 0,
      marginAmount: 0,
      inventoryItemId: null,
      sku: null,
      isAdHoc: false,
      inventoryItemStatus: 'EXISTING' as InventoryItemStatus,
      notes: '',
      newItemData: null,
    }
  }
}

// Calculate total estimated cost
const totalEstimatedCost = computed(() => {
  return lineItems.value.reduce((sum, item) => sum + (item.totalCost || 0), 0)
})

// Get row border class based on inventory item status
function getRowBorderClass(item: ExtendedProcurementLineItem): string {
  switch (item.inventoryItemStatus) {
    case 'NEW_PENDING':
      return 'border-l-4 border-l-blue-500'
    case 'ADHOC':
      return 'border-l-4 border-l-amber-500'
    default:
      return ''
  }
}

// Get model value for InventoryItemPicker
function getPickerModelValue(item: ExtendedProcurementLineItem): InventorySearchResult | null {
  if (item.inventoryItemStatus === 'EXISTING' && item.inventoryItemId) {
    // Return a minimal InventorySearchResult for selected existing item
    return {
      id: item.inventoryItemId,
      sku: item.sku || '',
      name: item.description || '',
      uom: item.uom || 'PCS',
      categoryName: '',
      onHand: 0,
      purchasePrice: item.unitCostPrice || 0,
      freightDuty: item.freightDuty || 0,
      totalCost: item.totalCost || 0,
      markupPercent: item.markupPercent || 0,
      sellingPrice: item.sellingPrice || 0,
      status: 'ACTIVE',
      reorderLevel: 0,
      location: ''
    }
  }
  return null
}

// Form validation
function validateForm(): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!requisitionForm.title.trim()) {
    errors.push('Title is required')
  }
  
  if (!requisitionForm.procurementType) {
    errors.push('Procurement type is required')
  }
  
  if (!requisitionForm.department) {
    errors.push('Department is required')
  }
  
  // Validate line items
  lineItems.value.forEach((item, index) => {
    if (!item.description?.trim()) {
      errors.push(`Item ${index + 1}: Description is required`)
    }
    if (!item.uom) {
      errors.push(`Item ${index + 1}: Unit of measure is required`)
    }
    if (!item.qty || item.qty < 1) {
      errors.push(`Item ${index + 1}: Quantity must be at least 1`)
    }
    if (!item.unitCostPrice || item.unitCostPrice < 0) {
      errors.push(`Item ${index + 1}: Unit cost price must be 0 or greater`)
    }
    
    // Additional validation for NEW_PENDING items
    if (item.inventoryItemStatus === 'NEW_PENDING' && item.newItemData) {
      if (!item.newItemData.sku.trim()) {
        errors.push(`Item ${index + 1}: SKU is required for new inventory items`)
      }
      if (!item.newItemData.categoryId) {
        errors.push(`Item ${index + 1}: Category is required for new inventory items`)
      }
    }
  })
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Check SKU uniqueness for NEW_PENDING items
async function checkSkuUniqueness(): Promise<boolean> {
  const newPendingItems = lineItems.value.filter(
    item => item.inventoryItemStatus === 'NEW_PENDING'
      && item.newItemData?.sku
  )

  if (newPendingItems.length === 0) return true

  const { collection, query, where, getDocs } =
    await import('firebase/firestore')

  for (const item of newPendingItems) {
    const sku = item.newItemData!.sku.toUpperCase()

    const skuQuery = query(
      collection(db, 'inventoryItems'),
      where('sku', '==', sku)
    )

    const skuSnap = await getDocs(skuQuery)

    if (!skuSnap.empty) {
      toast.error(
        `SKU '${sku}' already exists in inventory.`,
        {
          description:
            'Use a different SKU or select the existing ' +
            'item from the inventory picker instead.'
        }
      )
      return false  // Block save immediately on first conflict
    }
  }

  return true  // All SKUs are unique
}

// Create inventoryItems docs for NEW_PENDING items
async function createPendingInventoryItems(): Promise<Record<number, string>> {
  // Returns a map of: line item index → new inventory doc id
  // Only processes NEW_PENDING items

  const newInventoryIds: Record<number, string> = {}

  const newPendingItems = lineItems.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      item.inventoryItemStatus === 'NEW_PENDING'
        && item.newItemData
    )

  if (newPendingItems.length === 0) return newInventoryIds

  const { collection, addDoc, serverTimestamp } =
    await import('firebase/firestore')

  for (const { item, index } of newPendingItems) {
    const d = item.newItemData!

    const totalCostPerUnit =
      (d.purchasePrice || 0) + (d.freightDuty || 0)

    const sellingPricePerUnit =
      totalCostPerUnit * (1 + (d.markupPercent || 0) / 100)

    const inventoryDocRef = await addDoc(
      collection(db, 'inventoryItems'),
      {
        name: d.name,
        sku: d.sku.toUpperCase(),
        description: '',
        notes: '',
        uom: d.uom,
        categoryId: d.categoryId,
        categoryName: d.categoryName,
        purchasePrice: d.purchasePrice,
        freightDuty: d.freightDuty,
        totalCost: totalCostPerUnit,
        markupPercent: d.markupPercent,
        sellingPrice: sellingPricePerUnit,
        reorderLevel: d.reorderLevel || 0,
        location: d.location || '',
        onHand: 0,
        status: 'PENDING_GRN',
        isActive: true,
        createdViaProcurement: true,
        originPrId: '',  // ← placeholder, updated after PR saved
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    )

    newInventoryIds[index] = inventoryDocRef.id

    // Write inventoryItemId and sku back to the line item
    // so they are included in the PR items array on save
    const lineItem = lineItems.value[index]
    if (lineItem) {
      lineItem.inventoryItemId = inventoryDocRef.id
      lineItem.sku = d.sku.toUpperCase()
    }
  }

  return newInventoryIds
}

// Update originPrId on newly created inventory items
async function updateOriginPrIds(
  prId: string,
  newInventoryIds: Record<number, string>
): Promise<void> {
  const inventoryDocIds = Object.values(newInventoryIds)
  if (inventoryDocIds.length === 0) return

  const { doc, updateDoc, serverTimestamp } =
    await import('firebase/firestore')

  for (const inventoryDocId of inventoryDocIds) {
    await updateDoc(
      doc(db, 'inventoryItems', inventoryDocId),
      {
        originPrId: prId,
        updatedAt: serverTimestamp()
      }
    )
  }
}

// Save requisition
async function saveRequisition(status: PRStatus) {
  const validation = validateForm()
  if (!validation.isValid) {
    validation.errors.forEach(error => {
      toast.error('Validation Error', { description: error })
    })
    return
  }
  
  isSubmitting.value = true
  try {
    // Find selected supplier info
    const selectedSupplier = requisitionForm.supplierId 
      ? procurementStore.suppliers.find((s: Supplier) => s.id === requisitionForm.supplierId)
      : null
    
    // Prepare requisition data
    const requisitionData = {
      title: requisitionForm.title,
      description: requisitionForm.description,
      procurementType: requisitionForm.procurementType,
      department: requisitionForm.department,
      jobCardId: selectedJobCardId.value || null,
      jobCardTitle: selectedJobCardTitle.value || null,
      supplierId: requisitionForm.supplierId,
      supplierName: selectedSupplier?.name || null,
      items: lineItems.value.map(item => ({
        ...item,
        qty: Number(item.qty),
        unitCostPrice: Number(item.unitCostPrice),
        freightDuty: Number(item.freightDuty || 0),
        totalCost: Number(item.totalCost || 0),
        markupPercent: Number(item.markupPercent || 0),
        sellingPrice: Number(item.sellingPrice || 0),
        isAdHoc: item.isAdHoc || false,
        inventoryItemStatus: item.inventoryItemStatus || 'EXISTING',
        newItemData: item.newItemData || undefined,
      })) as ProcurementLineItem[],
      totalEstimatedCost: totalEstimatedCost.value,
      status,
      rejectionReason: null,
      requestedBy: sessionUser.value?.uid || '',
      requestedByName: sessionUser.value?.displayName || sessionUser.value?.email || '',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      linkedPoId: null,
      createdAt: null as any, // Will be set by store
      updatedAt: null as any, // Will be set by store
    }
    
    // Check SKU uniqueness for submitted requisitions with NEW_PENDING items
    if (status === 'SUBMITTED') {
      const skusAreUnique = await checkSkuUniqueness()
      if (!skusAreUnique) {
        isSubmitting.value = false
        return  // Block save
      }
    }
    
    // Step 1 — Create inventoryItems docs for NEW_PENDING
    // Run for both DRAFT and SUBMITTED saves
    // (user may save draft and come back — items should exist)
    // BUT: only create docs that don't already have an
    // inventoryItemId (avoid duplicating on re-save)
    const itemsNeedingInventory = lineItems.value.filter(
      item =>
        item.inventoryItemStatus === 'NEW_PENDING' &&
        item.newItemData &&
        !item.inventoryItemId  // ← skip if already created
    )

    let newInventoryIds: Record<number, string> = {}

    if (itemsNeedingInventory.length > 0) {
      newInventoryIds = await createPendingInventoryItems()
    }

    // Step 2 — Save the PR document
    // lineItems.value now has inventoryItemId populated for
    // any newly created inventory items
    const prId = await procurementStore.addRequisition({
      ...requisitionData,
      items: requisitionData.items.map(item => {
        // Strip newItemData from Firestore payload —
        // it's captured in inventoryItems, not needed on PR
        const { newItemData, ...itemWithoutNewData } = item
        return itemWithoutNewData
      })
    })

    // Step 3 — Update originPrId on new inventory docs
    // Only possible AFTER PR id is returned
    if (prId && Object.keys(newInventoryIds).length > 0) {
      await updateOriginPrIds(prId, newInventoryIds)
    }

    /*
    // DISABLED: PR-to-JobCard sync removed - users now add ad-hoc expenses directly in job cards
    // Step 4 — Sync items to linked Job Card (if applicable)
    if (prId && selectedJobCardId.value && lineItems.value.length > 0) {
      try {
        await jobCardsStore.syncProcurementRequisitionToJobCard(
          selectedJobCardId.value,
          prId,
          prId, // Use prId as prNumber (PR number is generated server-side)
          lineItems.value.map(item => ({
            description: item.description || '', // Ensure description is always a string
            qty: Number(item.qty),
            unitCostPrice: Number(item.unitCostPrice),
            sellingPrice: Number(item.sellingPrice || 0),
            inventoryItemId: item.inventoryItemId || undefined,
            sku: item.sku || undefined,
            isAdHoc: item.isAdHoc || false
          }))
        )
      } catch (syncError) {
        console.error('Failed to sync items to job card:', syncError)
        // Non-critical error - PR was created successfully
      }
    }
    */

    // Step 4 — Navigate away
    toast.success('Requisition Created', {
      description: `Purchase requisition saved as ${status.toLowerCase()}.`,
    })
    
    router.push('/procurement/requisitions')
  } catch (error: any) {
    console.error('Error creating requisition:', error)
    toast.error('Failed to Create Requisition', {
      description: error.message || 'Please try again.',
    })
  } finally {
    isSubmitting.value = false
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
</script>

<template>
  <div class="w-full px-6 space-y-8 pb-20">
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="router.back()">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div>
          <h2 class="text-3xl font-bold tracking-tight">New Purchase Requisition</h2>
          <p class="text-muted-foreground">
            Auto-generated PR number will be assigned on save
          </p>
        </div>
      </div>
    </div>

    <!-- Main layout: wide form left, sticky sidebar right -->
    <div class="flex flex-col lg:flex-row gap-6 items-start">
      
      <!-- LEFT: Form content — takes remaining space -->
      <div class="flex-1 min-w-0 space-y-6">
      <!-- Card 1: Requisition Details -->
      <Card>
          <CardHeader>
            <CardTitle>Requisition Details</CardTitle>
            <CardDescription>Basic information about this purchase request</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Title -->
            <div class="space-y-2">
              <Label for="title">Title *</Label>
              <Input
                id="title"
                v-model="requisitionForm.title"
                placeholder="e.g., Office Supplies for Q3"
                required
              />
            </div>

            <!-- Description -->
            <div class="space-y-2">
              <Label for="description">Description</Label>
              <Textarea
                id="description"
                v-model="requisitionForm.description"
                placeholder="Brief description of what needs to be purchased and why..."
                rows="3"
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Procurement Type -->
              <div class="space-y-2">
                <Label for="procurementType">Procurement Type *</Label>
                <Select v-model="requisitionForm.procurementType">
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="option in procurementTypeOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Department -->
              <div class="space-y-2">
                <Label for="department">Department *</Label>
                <Select v-model="requisitionForm.department">
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="dept in departmentOptions"
                      :key="dept"
                      :value="dept"
                    >
                      {{ dept }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Supplier -->
            <div class="space-y-2">
              <Label for="supplier">Supplier (Optional)</Label>
              <Select v-model="requisitionForm.supplierId">
                <SelectTrigger>
                  <SelectValue placeholder="Search supplier by name..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">
                    <span class="text-muted-foreground">No supplier selected</span>
                  </SelectItem>
                  <SelectItem
                    v-for="supplier in activeSuppliers"
                    :key="supplier.id"
                    :value="supplier.id"
                  >
                    <div class="flex items-center justify-between">
                      <span>{{ supplier.name }}</span>
                      <Badge variant="outline" class="ml-2 text-xs">
                        {{ supplier.paymentTerms }}
                      </Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Job Card (only for PROJECT_MATERIAL) -->
            <div v-if="requisitionForm.procurementType === 'PROJECT_MATERIAL'" class="space-y-1.5">
              <Label>
                Linked Job Card
                <span class="text-muted-foreground text-xs font-normal ml-1">(optional)</span>
              </Label>

              <Select
                :disabled="loadingJobCards"
                v-model="selectedJobCardId"
              >
                <SelectTrigger>
                  <SelectValue
                    :placeholder="loadingJobCards
                      ? 'Loading job cards...'
                      : 'Select job card (optional)'"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="jc in jobCards"
                    :key="jc.id"
                    :value="jc.id"
                  >
                    {{ jc.label }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <p class="text-xs text-muted-foreground">
                Link this requisition to a job card.
                Stock will be tracked against this job once goods are received.
              </p>
            </div>

            <!-- Notes -->
            <div class="space-y-2">
              <Label for="notes">Notes</Label>
              <Textarea
                id="notes"
                v-model="requisitionForm.notes"
                placeholder="Any additional notes or special instructions..."
                rows="2"
              />
            </div>
          </CardContent>
        </Card>

        <!-- Card 2: Line Items -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Items / Services</CardTitle>
              <CardDescription>List all items or services to be purchased</CardDescription>
            </div>
            <Button @click="addLineItem" size="sm">
              <Plus class="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent>
            <!-- Line Items Table -->
            <div class="w-full overflow-x-auto">
              <div class="min-w-[1200px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="min-w-[200px] flex-1">Description *</TableHead>
                      <TableHead class="min-w-[100px]">UOM *</TableHead>
                      <TableHead class="min-w-[80px] text-right">Qty *</TableHead>
                      <TableHead class="min-w-[110px] text-right">Unit Cost *</TableHead>
                      <TableHead class="min-w-[110px] text-right">Freight/Duty</TableHead>
                      <TableHead class="min-w-[110px] text-right">Total Cost</TableHead>
                      <TableHead class="min-w-[90px] text-right">Markup %</TableHead>
                      <TableHead class="min-w-[110px] text-right">Selling Price</TableHead>
                      <TableHead class="min-w-[48px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <template v-for="(item, index) in lineItems" :key="item.id">
                      <TableRow :class="getRowBorderClass(item)">
                        <!-- Description with InventoryItemPicker -->
                        <TableCell class="min-w-[200px] flex-1">
                          <div class="space-y-2">
                            <!-- ADHOC: editable description input -->
                            <template v-if="item.inventoryItemStatus === 'ADHOC'">
                              <Input
                                v-model="item.description"
                                placeholder="One-off expense description..."
                                :disabled="isSubmitting"
                              />
                            </template>
                            <!-- NEW_PENDING: read-only item name label -->
                            <template v-else-if="item.inventoryItemStatus === 'NEW_PENDING'">
                              <div class="px-2 py-1.5 rounded bg-muted/30 text-sm font-medium truncate">
                                {{ item.description }}
                              </div>
                            </template>
                            <!-- EXISTING: inventory picker -->
                            <template v-else>
                              <InventoryItemPicker
                                :model-value="getPickerModelValue(item)"
                                @update:model-value="(val) => val ? handleItemSelected(val, index) : handlePickerCleared(index)"
                                @item-not-found="(query, status) => handleItemNotFound(query, status, index)"
                                :disabled="isSubmitting"
                              />
                            </template>

                            <!-- Status Banners -->
                            <div v-if="item.inventoryItemStatus === 'ADHOC'" class="mt-2">
                              <Alert class="py-2 text-xs border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                                <AlertCircle class="h-3 w-3" />
                                <AlertDescription class="text-xs">
                                  ⚠ One-off expense — will not update inventory
                                </AlertDescription>
                              </Alert>
                            </div>
                            
                            <div v-if="item.inventoryItemStatus === 'NEW_PENDING'" class="mt-2">
                              <Alert class="py-2 text-xs border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
                                <Info class="h-3 w-3" />
                                <AlertDescription class="text-xs">
                                  ℹ New item — inventory record created on GRN confirmation
                                </AlertDescription>
                              </Alert>
                            </div>
                          </div>
                        </TableCell>
                        
                        <!-- UOM -->
                        <TableCell class="min-w-[100px]">
                          <Select v-model="item.uom" :disabled="isSubmitting || (item.inventoryItemStatus === 'EXISTING' && !!item.inventoryItemId)">
                            <SelectTrigger class="border-0 focus-visible:ring-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                v-for="uom in uomOptions"
                                :key="uom"
                                :value="uom"
                              >
                                {{ uom }}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        
                        <!-- Quantity -->
                        <TableCell class="min-w-[80px]">
                          <Input
                            v-model="item.qty"
                            type="number"
                            min="1"
                            step="1"
                            class="border-0 text-right focus-visible:ring-0"
                            :disabled="isSubmitting"
                            @change="item.qty = Math.max(1, Number(item.qty))"
                          />
                        </TableCell>
                        
                        <!-- Unit Cost Price -->
                        <TableCell class="min-w-[110px]">
                          <Input
                            v-model="item.unitCostPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            class="border-0 text-right focus-visible:ring-0"
                            :disabled="isSubmitting || (item.inventoryItemStatus === 'EXISTING' && !!item.inventoryItemId)"
                            @change="item.unitCostPrice = Math.max(0, Number(item.unitCostPrice))"
                          />
                        </TableCell>
                        
                        <!-- Freight/Duty -->
                        <TableCell class="min-w-[110px]">
                          <Input
                            v-model="item.freightDuty"
                            type="number"
                            min="0"
                            step="0.01"
                            class="border-0 text-right focus-visible:ring-0"
                            :disabled="isSubmitting"
                            @change="item.freightDuty = Math.max(0, Number(item.freightDuty))"
                          />
                        </TableCell>
                        
                        <!-- Total Cost (computed, read-only) -->
                        <TableCell class="min-w-[110px] text-right font-medium">
                          {{ formatCurrency(item.totalCost || 0) }}
                        </TableCell>
                        
                        <!-- Markup Percent -->
                        <TableCell class="min-w-[90px]">
                          <Input
                            v-model="item.markupPercent"
                            type="number"
                            min="0"
                            step="0.1"
                            class="border-0 text-right focus-visible:ring-0"
                            :disabled="isSubmitting"
                            @change="item.markupPercent = Math.max(0, Number(item.markupPercent))"
                          />
                        </TableCell>
                        
                        <!-- Selling Price (computed, read-only) -->
                        <TableCell class="min-w-[110px] text-right font-medium">
                          {{ formatCurrency(item.sellingPrice || 0) }}
                        </TableCell>
                        
                        <!-- Delete Action -->
                        <TableCell class="min-w-[48px] text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            @click="removeLineItem(index)"
                            :disabled="isSubmitting"
                          >
                            <Trash2 class="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      
                      <!-- New Item Fields for NEW_PENDING (full width row) -->
                      <TableRow v-if="item.inventoryItemStatus === 'NEW_PENDING' && item.newItemData">
                        <TableCell colspan="9" class="p-0 border-t-0">
                          <div class="mt-3 space-y-3 p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20 mx-2">
                            <div class="grid grid-cols-2 gap-4">
                              <!-- Name -->
                              <div class="space-y-1">
                                <Label class="text-xs">Item Name *</Label>
                                <Input
                                  v-model="item.newItemData.name"
                                  placeholder="Item name"
                                  class="h-8 text-sm"
                                  :disabled="isSubmitting"
                                />
                              </div>
                              
                              <!-- SKU -->
                              <div class="space-y-1">
                                <Label class="text-xs">SKU *</Label>
                                <Input
                                  v-model="item.newItemData.sku"
                                  placeholder="Unique SKU"
                                  class="h-8 text-sm"
                                  :disabled="isSubmitting"
                                />
                              </div>
                            </div>
                            
                            <div class="grid grid-cols-3 gap-4">
                              <!-- UOM -->
                              <div class="space-y-1">
                                <Label class="text-xs">UOM *</Label>
                                <Select v-model="item.newItemData.uom" :disabled="isSubmitting">
                                  <SelectTrigger class="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem
                                      v-for="uom in uomOptions"
                                      :key="uom"
                                      :value="uom"
                                    >
                                      {{ uom }}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <!-- Purchase Price -->
                              <div class="space-y-1">
                                <Label class="text-xs">Cost Price *</Label>
                                <Input
                                  v-model="item.newItemData.purchasePrice"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  class="h-8 text-sm"
                                  :disabled="isSubmitting"
                                  @change="item.unitCostPrice = item.newItemData!.purchasePrice"
                                />
                              </div>
                              
                              <!-- Markup Percent -->
                              <div class="space-y-1">
                                <Label class="text-xs">Markup % *</Label>
                                <Input
                                  v-model="item.newItemData.markupPercent"
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  class="h-8 text-sm"
                                  :disabled="isSubmitting"
                                  @change="item.markupPercent = item.newItemData!.markupPercent"
                                />
                              </div>
                            </div>
                            
                            <!-- Notes for new item -->
                            <div class="space-y-1">
                              <Label class="text-xs">Item Notes</Label>
                                <Input
                                  v-model="item.notes"
                                  placeholder="Additional notes for this new item"
                                  class="h-8 text-sm"
                                  :disabled="isSubmitting"
                                />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </template>
                  </TableBody>
                </Table>
              
              <!-- Table Footer with Total -->
              <CardFooter class="border-t bg-muted/10 px-6 py-4">
                <div class="flex items-center justify-between w-full">
                  <div class="text-sm text-muted-foreground">
                    {{ lineItems.length }} item{{ lineItems.length !== 1 ? 's' : '' }}
                  </div>
                  <div class="text-lg font-bold">
                    Total Estimated Cost: {{ formatCurrency(totalEstimatedCost) }}
                  </div>
                </div>
              </CardFooter>
            </div>
            </div>

            <p class="text-sm text-muted-foreground mt-4">
              * All computed fields (Total Cost, Selling Price) update automatically based on inputs.
            </p>
          </CardContent>
        </Card>

      </div>
      
      <!-- RIGHT: Sticky sidebar — fixed width -->
      <div class="w-full lg:w-72 shrink-0 lg:sticky lg:top-6 space-y-4">
        
        <!-- Quick Summary Card -->
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Type</span>
              <span class="font-medium">
                {{ (procurementTypeOptions as any[]).find(t => t.value === requisitionForm.procurementType)?.label || 'Not set' }}
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Department</span>
              <span class="font-medium">{{ requisitionForm.department || 'Not set' }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Supplier</span>
              <span class="font-medium truncate max-w-[150px]" :title="activeSuppliers.find((s: Supplier) => s.id === requisitionForm.supplierId)?.name">
                {{ requisitionForm.supplierId ? (activeSuppliers.find((s: Supplier) => s.id === requisitionForm.supplierId)?.name || 'Unknown') : 'None' }}
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Items</span>
              <span class="font-medium">{{ lineItems.length }}</span>
            </div>
            <div class="pt-3 border-t mt-3">
              <div class="flex justify-between text-base font-bold">
                <span>Total Cost</span>
                <span>{{ formatCurrency(totalEstimatedCost) }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Form Actions Card -->
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Save this purchase requisition</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <Button
              @click="saveRequisition('SUBMITTED')"
              class="w-full"
              :disabled="isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              Submit for Approval
            </Button>
            
            <Button
              @click="saveRequisition('DRAFT')"
              variant="outline"
              class="w-full"
              :disabled="isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              Save as Draft
            </Button>
            
            <Button
              @click="router.back()"
              variant="ghost"
              class="w-full"
              :disabled="isSubmitting"
            >
              Cancel
            </Button>
          </CardContent>
          <CardFooter class="text-xs text-muted-foreground border-t pt-4">
            <p>Submitted requisitions will go through approval workflow.</p>
          </CardFooter>
        </Card>
        
      </div>
    </div>
  </div>
</template>
