<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-md overflow-y-auto">

      <SheetHeader class="mb-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Link2 class="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <SheetTitle class="text-base font-medium">Map Inventory Item</SheetTitle>
            <SheetDescription class="text-xs text-muted-foreground mt-0.5">
              Link "{{ item?.itemName || item?.description || 'item' }}" to an inventory record
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <!-- Search -->
      <div class="relative mb-4">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          v-model="searchQuery"
          placeholder="Search by name or SKU..."
          class="pl-9"
        />
      </div>

      <!-- Results -->
      <div class="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        <div v-if="isLoading" class="flex items-center justify-center py-10">
          <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
        <div
          v-else-if="filteredItems.length === 0"
          class="text-center py-10 text-sm text-muted-foreground italic"
        >
          No inventory items found
        </div>
        <button
          v-for="invItem in filteredItems"
          :key="invItem.id"
          type="button"
          class="w-full text-left rounded-lg border px-3 py-2.5 transition-colors"
          :class="selectedItem?.id === invItem.id
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
            : 'border-border hover:border-orange-300 hover:bg-muted/40'"
          @click="selectedItem = invItem"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ invItem.name }}</p>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                ${{ invItem.sellingPrice.toFixed(2) }} · {{ invItem.uom }}
                <span v-if="invItem.sku" class="opacity-60"> · {{ invItem.sku }}</span>
              </p>
            </div>
            <Badge
              variant="outline"
              class="text-[10px] font-bold flex-shrink-0"
              :class="invItem.onHand === 0
                ? 'bg-red-100 text-red-700 border-red-200'
                : invItem.onHand < (item?.qty ?? 1)
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-green-100 text-green-700 border-green-200'"
            >
              {{ invItem.onHand }} {{ invItem.uom }}
            </Badge>
          </div>
        </button>
      </div>

      <!-- Selected Preview -->
      <div
        v-if="selectedItem"
        class="mt-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 text-xs space-y-1"
      >
        <p class="font-semibold text-orange-800">Selected: {{ selectedItem.name }}</p>
        <div class="flex gap-4 text-orange-700">
          <span>IRD: ${{ selectedItem.sellingPrice.toFixed(2) }}</span>
          <span>Cost: ${{ selectedItem.totalCost.toFixed(2) }}</span>
          <span>On-hand: {{ selectedItem.onHand }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-4 pt-4 border-t border-border">
        <Button
          type="button"
          variant="outline"
          class="flex-1"
          :disabled="isSaving"
          @click="emit('update:open', false)"
        >
          Cancel
        </Button>
        <Button
          type="button"
          class="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
          :disabled="!selectedItem || isSaving"
          @click="handleConfirm"
        >
          <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
          <Link2 v-else class="w-4 h-4 mr-2" />
          {{ isSaving ? 'Saving...' : 'Confirm Mapping' }}
        </Button>
      </div>

    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Link2, Search } from 'lucide-vue-next'

export interface MappedInventoryData {
  inventoryItemId: string
  itemName: string
  irdSellingPrice: number
  costSnapshot: number
  twidMarkupPercent: number
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  stockAtSnapshot: number
}

const props = defineProps<{
  open: boolean
  item: any | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'mapped': [data: MappedInventoryData]
}>()

const searchQuery = ref('')
const allItems = ref<any[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const selectedItem = ref<any>(null)

watch(() => props.open, async (val) => {
  if (!val) {
    selectedItem.value = null
    searchQuery.value = ''
    return
  }
  await loadInventory()
})

async function loadInventory() {
  isLoading.value = true
  try {
    allItems.value = await inventoryApi.listInventory({ isActive: true })
  } catch (err) {
    console.error('[MapInventoryItemPanel] Failed to load inventory:', err)
  } finally {
    isLoading.value = false
  }
}

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const base = q
    ? allItems.value.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q))
      )
    : allItems.value
  return base.slice(0, 60)
})

function computeStockStatus(onHand: number, qtyNeeded: number): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (onHand === 0) return 'OUT_OF_STOCK'
  if (onHand < qtyNeeded) return 'LOW_STOCK'
  return 'IN_STOCK'
}

function handleConfirm() {
  if (!selectedItem.value) return
  isSaving.value = true
  const inv = selectedItem.value
  const qtyNeeded = props.item?.qty ?? 1
  emit('mapped', {
    inventoryItemId: inv.id,
    itemName: inv.name,
    irdSellingPrice: inv.sellingPrice,
    costSnapshot: inv.totalCost,
    twidMarkupPercent: inv.markupPercent,
    stockStatus: computeStockStatus(inv.onHand, qtyNeeded),
    stockAtSnapshot: inv.onHand,
  })
  emit('update:open', false)
  isSaving.value = false
}
</script>
