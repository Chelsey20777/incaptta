<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { ShoppingCart, Loader2 } from 'lucide-vue-next'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useSession } from '@/composables/useSession'
import { useProcurementStore } from '../store/procurementStore'
import { storeToRefs } from 'pinia'
import StockBadge from './StockBadge.vue'
import type { Supplier } from '../types'


interface ItemProp {
  inventoryItemId: string | null
  sku: string | null
  description: string
  uom: string
  qty: number
  unitCostPrice: number
  freightDuty: number
  markupPercent: number
}

const props = defineProps<{
  open: boolean
  jobCardId: string
  jobCardTitle: string
  jobCardDepartment: string
  item: ItemProp
  onHand: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'raised': [prId: string, prNumber: string]
}>()

const { user, hasAnyRole } = useSession()
const procurementStore = useProcurementStore()
const { suppliers } = storeToRefs(procurementStore)

const activeSuppliers = computed(() => suppliers.value.filter((s: Supplier) => s.status === 'ACTIVE'))

const qtyToOrder = ref(Math.max(0, props.item.qty - props.onHand))
const userEditedQty = ref(false)

watch(() => props.onHand, (newOnHand) => {
  if (!userEditedQty.value) {
    qtyToOrder.value = Math.max(0, props.item.qty - newOnHand)
  }
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    qtyToOrder.value = Math.max(0, props.item.qty - props.onHand)
    userEditedQty.value = false
    selectedSupplierId.value = ''
    selectedSupplierName.value = ''
    notes.value = ''
    if (suppliers.value.length === 0) {
      procurementStore.fetchSuppliers()
    }
  }
})

const selectedSupplierId = ref('')
const selectedSupplierName = ref('')
const notes = ref('')
const isSubmitting = ref(false)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onSupplierChange(supplierId: any) {
  const id = String(supplierId ?? '')
  selectedSupplierId.value = id
  const supplier = suppliers.value.find((s: Supplier) => s.id === id)
  selectedSupplierName.value = supplier?.name ?? ''
}

async function handleSubmit() {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER'])) {
    toast.error('Insufficient permissions')
    return
  }
  if (qtyToOrder.value < 1) {
    toast.error('Quantity to order must be at least 1')
    return
  }

  isSubmitting.value = true
  try {
    const unitTotal = (props.item.unitCostPrice + props.item.freightDuty) * qtyToOrder.value
    const sellingPrice = unitTotal * (1 + props.item.markupPercent / 100)

    const prId = await procurementStore.addRequisition({
      title: `${props.item.description} — ${props.jobCardTitle}`,
      description: `Auto-raised from job card: ${props.jobCardTitle}`,
      procurementType: 'PROJECT_MATERIAL',
      department: props.jobCardDepartment,
      jobCardId: props.jobCardId,
      jobCardTitle: props.jobCardTitle,
      supplierId: selectedSupplierId.value || null,
      supplierName: selectedSupplierName.value || null,
      items: [{
        id: crypto.randomUUID(),
        description: props.item.description,
        uom: props.item.uom,
        qty: qtyToOrder.value,
        unitCostPrice: props.item.unitCostPrice,
        freightDuty: props.item.freightDuty,
        totalCost: unitTotal,
        markupPercent: props.item.markupPercent,
        sellingPrice,
        marginAmount: sellingPrice - unitTotal,
        inventoryItemId: props.item.inventoryItemId,
        sku: props.item.sku,
        isAdHoc: false,
        inventoryItemStatus: 'EXISTING',
        newItemData: null,
        notes: notes.value
      }],
      totalEstimatedCost: unitTotal,
      status: 'DRAFT',
      rejectionReason: null,
      requestedBy: user.value?.uid ?? '',
      requestedByName: user.value?.displayName ?? '',
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      linkedPoId: null
    })

    const newPr = procurementStore.requisitions.find(r => r.id === prId)
    const prNumber = newPr?.prNumber ?? prId

    emit('raised', prId, prNumber)
    emit('update:open', false)

    toast.success('Requisition raised', {
      description: `${prNumber} created for ${props.item.description}`
    })
  } catch (e) {
    console.error('Raise PR error:', e)
    toast.error('Failed to raise requisition')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-full sm:max-w-md flex flex-col overflow-y-auto">
      <SheetHeader class="mb-4">
        <SheetTitle class="flex items-center gap-2">
          <ShoppingCart :size="18" />
          Raise Purchase Requisition
        </SheetTitle>
        <SheetDescription>
          Creating PR for <strong>{{ item.description }}</strong> on job {{ jobCardTitle }}
        </SheetDescription>
      </SheetHeader>

      <!-- Read-only context card -->
      <div class="bg-muted/50 p-3 rounded-md mb-4 space-y-2 text-sm">
        <div class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Job Card</span>
          <span class="font-medium text-right truncate">{{ jobCardTitle }}</span>
        </div>
        <div class="flex justify-between items-start gap-2">
          <span class="text-muted-foreground shrink-0">Item</span>
          <div class="flex items-center gap-1.5 justify-end flex-wrap">
            <span class="font-medium text-right">{{ item.description }}</span>
            <span v-if="item.sku"
              class="text-[10px] bg-muted border rounded px-1 py-0.5 font-mono">{{ item.sku }}</span>
          </div>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-muted-foreground">Currently in stock</span>
          <StockBadge :on-hand="onHand" :qty-needed="item.qty" />
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">Qty needed on job</span>
          <span class="font-medium">{{ item.qty }} {{ item.uom }}</span>
        </div>
      </div>

      <!-- Editable fields -->
      <div class="space-y-4 flex-1">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Quantity to Order *</label>
          <Input
            type="number"
            min="1"
            :value="qtyToOrder"
            @input="(e: Event) => { qtyToOrder = Number((e.target as HTMLInputElement).value); userEditedQty = true }"
          />
          <p class="text-xs text-muted-foreground">
            Stock needed: {{ item.qty }}, Available: {{ onHand }}
          </p>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium">Preferred Supplier</label>
          <Select :model-value="selectedSupplierId" @update:model-value="onSupplierChange">
            <SelectTrigger>
              <SelectValue placeholder="Select supplier (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="s in activeSuppliers" :key="s.id" :value="s.id">
                {{ s.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium">Notes</label>
          <Textarea
            v-model="notes"
            :rows="3"
            placeholder="Urgency, specifications, delivery requirements..."
          />
        </div>
      </div>

      <SheetFooter class="mt-6 flex gap-2 pt-4 border-t">
        <Button variant="outline" :disabled="isSubmitting" @click="emit('update:open', false)" class="flex-1">
          Cancel
        </Button>
        <Button :disabled="isSubmitting || qtyToOrder < 1" @click="handleSubmit" class="flex-1">
          <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
          {{ isSubmitting ? 'Submitting…' : 'Submit Requisition' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
