<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db } from '@/lib/firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useInventoryStore } from '@/stores/inventoryStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  Package, 
  Search, 
  Loader2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const router = useRouter()
const invStore = useInventoryStore()

const { items, loading, lowStockItems, totalValue } = storeToRefs(invStore)

const searchQuery = ref('')
const onlyLowStock = ref(false)

// Adjustment modal state
const showAdjustModal = ref(false)
const selectedItem = ref<any | null>(null)
const adjustQty = ref(0)
const isSubmitting = ref(false)

onMounted(() => {
  invStore.fetchItems()
})

const filteredItems = computed(() => {
  let list = [...items.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(item => 
      (item.name || item.itemName)?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.partNumber?.toLowerCase().includes(q)
    )
  }
  if (onlyLowStock.value) {
    list = list.filter(item => item.reorderLevel !== undefined && item.onHand <= item.reorderLevel)
  }
  return list
})

const fmt = (n: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

const openAdjust = (item: any) => {
  selectedItem.value = item
  adjustQty.value = item.onHand
  showAdjustModal.value = true
}

const saveAdjustment = async () => {
  if (!selectedItem.value) return
  if (adjustQty.value < 0) {
    toast.error('Stock quantity cannot be negative')
    return
  }

  isSubmitting.value = true
  try {
    const itemRef = doc(db, 'inventoryItems', selectedItem.value.id)
    await updateDoc(itemRef, {
      onHand: Number(adjustQty.value),
      updatedAt: serverTimestamp()
    })
    toast.success('Stock Level Updated')
    showAdjustModal.value = false
    await invStore.fetchItems() // Refresh
  } catch (err: any) {
    console.error(err)
    toast.error('Adjustment failed')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-black tracking-tight">Inventory</h1>
        <p class="text-xs text-muted-foreground">Warehouse & stock levels</p>
      </div>
      <Badge v-if="lowStockItems.length > 0" class="bg-red-500 text-white animate-pulse text-[10px] font-black h-5 px-2">
        {{ lowStockItems.length }} LOW STOCK
      </Badge>
    </header>

    <!-- Valuation Summary -->
    <section class="p-4 grid grid-cols-2 gap-3">
      <Card class="bg-card border shadow-sm">
        <CardContent class="p-4 space-y-1">
          <p class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Warehouse Value</p>
          <p class="text-xl font-black text-[#79c21b] truncate">{{ fmt(totalValue) }}</p>
        </CardContent>
      </Card>
      <Card 
        :class="['border shadow-sm cursor-pointer transition-colors', onlyLowStock ? 'bg-red-500/10 border-red-500/30' : 'bg-card']"
        @click="onlyLowStock = !onlyLowStock"
      >
        <CardContent class="p-4 space-y-1 relative">
          <p class="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1">
            Reorder Alerts 
            <span v-if="lowStockItems.length > 0" class="size-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
          </p>
          <p :class="['text-xl font-black flex items-baseline gap-1', lowStockItems.length > 0 ? 'text-red-500' : 'text-foreground']">
            {{ lowStockItems.length }}
            <span class="text-[10px] font-normal text-muted-foreground">items</span>
          </p>
        </CardContent>
      </Card>
    </section>

    <!-- Toolbar -->
    <section class="px-4 pb-2.5">
      <div class="relative">
        <Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input 
          v-model="searchQuery" 
          placeholder="Search warehouse inventory..." 
          class="pl-9 h-10 border bg-muted/20"
        />
      </div>
    </section>

    <!-- Inventory Listing -->
    <main class="p-4 flex-1 space-y-3">
      <div v-if="loading" class="flex flex-col items-center justify-center py-20">
        <Loader2 class="size-8 animate-spin text-primary" />
      </div>

      <div v-else-if="filteredItems.length === 0" class="text-center py-20 text-muted-foreground">
        <p class="text-sm">No items found in stock.</p>
      </div>

      <Card 
        v-for="item in filteredItems" 
        :key="item.id" 
        :class="['border shadow-sm transition-all', item.reorderLevel !== undefined && item.onHand <= item.reorderLevel ? 'border-red-500/20 bg-red-500/[0.02]' : '']"
      >
        <CardContent class="p-4 space-y-3">
          <div class="flex justify-between items-start">
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="font-black text-sm tracking-tight text-foreground truncate max-w-[170px]">{{ item.name || item.itemName || 'Unnamed Item' }}</h3>
                <Badge variant="secondary" class="text-[8px] h-3.5 px-1 uppercase border bg-muted text-muted-foreground">
                  {{ item.category || 'General' }}
                </Badge>
              </div>
              <p class="text-[10px] text-muted-foreground mt-0.5">Part ID: {{ item.partNumber || item.id.substring(0,6) }}</p>
            </div>
            
            <div class="text-right shrink-0">
              <span class="text-xs text-muted-foreground block">Selling Price</span>
              <span class="font-black text-sm text-[#79c21b]">{{ fmt(item.sellingPrice) }}</span>
            </div>
          </div>

          <div class="flex items-center justify-between border-t border-dashed pt-3">
            <div class="flex gap-4 text-[10px] text-muted-foreground">
              <div>
                <span>Stock on Hand:</span>
                <span :class="['font-black ml-1 text-sm', item.reorderLevel !== undefined && item.onHand <= item.reorderLevel ? 'text-red-500' : 'text-foreground']">
                  {{ item.onHand }}
                </span>
              </div>
              <div v-if="item.reorderLevel !== undefined">
                <span>Reorder Level:</span>
                <span class="font-bold text-foreground ml-1">{{ item.reorderLevel }}</span>
              </div>
            </div>

            <!-- Quick Adjust button for managers -->
            <Button size="sm" variant="outline" class="h-8 text-[10px] font-black" @click="openAdjust(item)">
              Adjust
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>

    <!-- Stock Adjust Modal -->
    <div v-if="showAdjustModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <CardHeader class="pb-4">
          <CardTitle class="text-lg font-black tracking-tight">Adjust Stock Level</CardTitle>
          <CardDescription class="text-xs">Direct manager inventory level correction.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="rounded-2xl bg-muted/30 p-3 flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg text-primary">
              <Package class="size-6" />
            </div>
            <div>
              <p class="font-bold text-sm text-foreground truncate max-w-[200px]">{{ selectedItem?.name || selectedItem?.itemName || 'Unnamed Item' }}</p>
              <p class="text-[10px] text-muted-foreground">Current Level: {{ selectedItem?.onHand }}</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs font-black uppercase text-muted-foreground">New On-Hand Stock Count</Label>
            <Input type="number" v-model.number="adjustQty" min="0" class="h-10 text-sm font-bold" />
          </div>

          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAdjustModal = false">Cancel</Button>
            <Button 
              class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
              :disabled="isSubmitting"
              @click="saveAdjustment"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              {{ isSubmitting ? 'Adjusting...' : 'Save Stock' }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
