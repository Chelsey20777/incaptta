<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted, nextTick, onMounted } from 'vue'
import { useInventorySearch, type InventorySearchResult } from '@/composables/useInventorySearch'
import StockBadge from './StockBadge.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, X, Plus, Clipboard } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: InventorySearchResult | null
  jobCardQtyNeeded?: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: InventorySearchResult | null]
  'itemNotFound': [searchQuery: string, inventoryItemStatus: 'NEW_PENDING' | 'ADHOC']
}>()

// Local state
const searchQuery = ref('')
const showDropdown = ref(false)
const focusedIndex = ref(-1)
const dropdownRef = ref<HTMLDivElement>()
const inputRef = ref<HTMLInputElement>()
const inputWrapperRef = ref<HTMLElement | null>(null)
const dropdownPosition = reactive({ top: 0, left: 0, width: 320 })

// Use the inventory search composable
const { results, isSearching, noResults } = useInventorySearch(searchQuery, {
  activeOnly: true,
  includePendingGrn: false,
  limit: 10
})

// Filtered results for display
const displayResults = computed(() => results.value)

// Watch for clicks outside to close dropdown
function handleClickOutside(event: MouseEvent) {
  const dr = dropdownRef.value
  const ir = inputRef.value
  if (
    dr instanceof HTMLElement && !dr.contains(event.target as Node) &&
    ir instanceof HTMLElement && !ir.contains(event.target as Node)
  ) {
    showDropdown.value = false
    focusedIndex.value = -1
  }
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!showDropdown.value || displayResults.value.length === 0) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % displayResults.value.length
      break
    case 'ArrowUp':
      event.preventDefault()
      focusedIndex.value = focusedIndex.value <= 0 
        ? displayResults.value.length - 1 
        : focusedIndex.value - 1
      break
    case 'Enter':
      event.preventDefault()
      if (focusedIndex.value >= 0 && focusedIndex.value < displayResults.value.length) {
        const item = displayResults.value[focusedIndex.value]
        if (item) {
          handleSelect(item)
        }
      }
      break
    case 'Escape':
      event.preventDefault()
      showDropdown.value = false
      focusedIndex.value = -1
      break
    case 'Tab':
      showDropdown.value = false
      focusedIndex.value = -1
      break
  }
}

// Handle item selection
function handleSelect(item: InventorySearchResult) {
  emit('update:modelValue', item)
  searchQuery.value = ''
  showDropdown.value = false
  focusedIndex.value = -1
}

// Handle clearing selection
function handleClear() {
  emit('update:modelValue', null)
  searchQuery.value = ''
  showDropdown.value = false
  focusedIndex.value = -1
  nextTick(() => inputRef.value?.focus())
}

// Handle item not found options
function handleRegisterNewItem() {
  const query = searchQuery.value.trim()
  if (query.length >= 2) {
    emit('itemNotFound', query, 'NEW_PENDING')
    searchQuery.value = ''
    showDropdown.value = false
    focusedIndex.value = -1
  }
}

function handleAddOneOffExpense() {
  const query = searchQuery.value.trim()
  if (query.length >= 2) {
    emit('itemNotFound', query, 'ADHOC')
    searchQuery.value = ''
    showDropdown.value = false
    focusedIndex.value = -1
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

// Update dropdown position
function updateDropdownPosition() {
  nextTick(() => {
    const el = inputWrapperRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    dropdownPosition.top = rect.bottom + 4
    dropdownPosition.left = rect.left
    dropdownPosition.width = Math.max(rect.width, 320)
  })
}

// Watch search query to show/hide dropdown
watch(searchQuery, (newQuery) => {
  if (newQuery.trim().length >= 2) {
    showDropdown.value = true
  } else {
    showDropdown.value = false
    focusedIndex.value = -1
  }
})

// Watch modelValue to update search query when cleared externally
watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    searchQuery.value = ''
  }
})

// Watch showDropdown to update position when it should show
watch(showDropdown, (val) => {
  if (val) {
    nextTick(updateDropdownPosition)
  }
})

// Set up click outside listener
const setupClickListener = () => {
  document.addEventListener('click', handleClickOutside)
}

// Add resize and scroll listeners
onMounted(() => {
  window.addEventListener('resize', updateDropdownPosition)
  window.addEventListener('scroll', updateDropdownPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('resize', updateDropdownPosition)
  window.removeEventListener('scroll', updateDropdownPosition, true)
})

// Initialize click listener on mount
nextTick(setupClickListener)
</script>

<template>
  <div class="relative" ref="dropdownRef">
    <!-- Selected State (when modelValue is not null) -->
    <div v-if="modelValue" class="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/10">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <div class="truncate">
            <span class="font-medium">{{ modelValue.name }}</span>
            <span class="ml-2 font-mono text-xs text-muted-foreground">{{ modelValue.sku }}</span>
          </div>
        </div>
        <div class="text-xs text-muted-foreground mt-1 flex items-center gap-3">
          <span>{{ modelValue.categoryName || 'No category' }}</span>
          <span>•</span>
          <span>{{ modelValue.uom }}</span>
          <span>•</span>
          <span>{{ modelValue.location || 'No location' }}</span>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-6 w-6"
        @click="handleClear"
        :disabled="disabled"
      >
        <X class="h-3 w-3" />
      </Button>
    </div>

    <!-- Search Input (when no selection or during search) -->
    <div v-else class="relative">
      <div ref="inputWrapperRef" class="relative">
        <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref="inputRef"
          v-model="searchQuery"
          placeholder="Search inventory by name or SKU..."
          class="pl-9"
          :disabled="disabled"
          @keydown="handleKeydown"
          @focus="searchQuery.length >= 2 && (showDropdown = true)"
        />
      </div>

      <!-- Dropdown (Teleported to body) -->
      <Teleport to="body">
        <div
          v-if="showDropdown && searchQuery.length >= 2"
          :style="{
            position: 'fixed',
            top: dropdownPosition.top + 'px',
            left: dropdownPosition.left + 'px',
            width: dropdownPosition.width + 'px',
            zIndex: '9999'
          }"
          class="rounded-md border border-border bg-popover shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          <!-- Loading State -->
          <div v-if="isSearching" class="p-4 text-center text-sm text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin inline-block mr-2" />
            Searching inventory...
          </div>

          <!-- No Results (with special options) -->
          <div v-else-if="noResults && searchQuery.length >= 2" class="p-0">
            <div class="p-3 border-b bg-muted/10">
              <div class="text-sm text-muted-foreground mb-2">
                No items found for "{{ searchQuery }}"
              </div>
            </div>
            
            <div class="divide-y">
              <!-- Option A: Register as new inventory item -->
              <button
                type="button"
                class="w-full text-left p-3 hover:bg-accent flex items-center gap-3"
                @click="handleRegisterNewItem"
                :class="{ 'bg-accent': focusedIndex === 0 }"
                @mouseenter="focusedIndex = 0"
              >
                <div class="flex items-center gap-3">
                  <Plus class="h-4 w-4 text-primary" />
                  <div class="text-left">
                    <div class="font-medium whitespace-nowrap">Register '{{ searchQuery }}' as new inventory item</div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      Will require GRN (Goods Received Note) on delivery
                    </div>
                  </div>
                </div>
              </button>
              
              <!-- Option B: Add as one-off expense -->
              <button
                type="button"
                class="w-full text-left p-3 hover:bg-accent flex items-center gap-3"
                @click="handleAddOneOffExpense"
                :class="{ 'bg-accent': focusedIndex === 1 }"
                @mouseenter="focusedIndex = 1"
              >
                <div class="flex items-center gap-3">
                  <Clipboard class="h-4 w-4 text-primary" />
                  <div class="text-left">
                    <div class="font-medium whitespace-nowrap">Add '{{ searchQuery }}' as one-off expense</div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      Direct expense without inventory tracking
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Search Results -->
          <div v-else-if="displayResults.length > 0" class="divide-y">
            <button
              v-for="(item, index) in displayResults"
              :key="item.id"
              type="button"
              class="w-full text-left p-3 hover:bg-accent"
              :class="{ 'bg-accent': focusedIndex === index }"
              @click="handleSelect(item)"
              @mouseenter="focusedIndex = index"
            >
              <!-- Line 1: Name + SKU -->
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium truncate">{{ item.name }}</span>
                    <span class="font-mono text-xs text-muted-foreground shrink-0">{{ item.sku }}</span>
                  </div>
                </div>
              </div>
              
              <!-- Line 2: Category | UOM | Location -->
              <div class="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span>{{ item.categoryName || 'No category' }}</span>
                <span>•</span>
                <span>{{ item.uom }}</span>
                <span>•</span>
                <span>{{ item.location || 'No location' }}</span>
              </div>
              
              <!-- Line 3: StockBadge + Cost -->
              <div class="flex items-center justify-between mt-2">
                <StockBadge :on-hand="item.onHand" :qty-needed="jobCardQtyNeeded" />
                <span class="text-xs text-muted-foreground">
                  Cost: {{ formatCurrency(item.purchasePrice) }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar for dropdown */
:deep(.overflow-y-auto) {
  scrollbar-width: thin;
  scrollbar-color: #888 transparent;
}

:deep(.overflow-y-auto::-webkit-scrollbar) {
  width: 6px;
}

:deep(.overflow-y-auto::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.overflow-y-auto::-webkit-scrollbar-thumb) {
  background-color: #888;
  border-radius: 3px;
}
</style>