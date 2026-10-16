<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../store/inventoryStore'
import { inventoryApi } from '../api/inventoryApi'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  ChevronLeft,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Info
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
// No longer need const { toast } = useToast()

const itemId = route.params.id as string
const submitting = ref(false)

const form = reactive({
  type: 'ADD' as 'ADD' | 'REMOVE' | 'SET',
  qty: 1,
  reason: '',
  reference: '',
  unitCost: 0
})

onMounted(async () => {
  await inventoryStore.fetchItem(itemId)
  if (inventoryStore.selectedItem) {
    form.unitCost = inventoryStore.selectedItem.purchasePrice || 0
  }
})

const item = computed(() => inventoryStore.selectedItem)

const projectedStock = computed(() => {
  if (!item.value) return 0
  if (form.type === 'ADD') return item.value.onHand + Number(form.qty)
  if (form.type === 'REMOVE') return item.value.onHand - Number(form.qty)
  return Number(form.qty)
})

const handleSubmit = async () => {
  if (!form.qty || !form.reason) return

  submitting.value = true
  try {
    // We'll call the API directly if the store method is problematic or update store
    await inventoryStore.updateItem(itemId, {
      onHand: projectedStock.value
    })

    // Log movement manually via API for audit
    await inventoryApi.adjustStock(itemId, {
      type: form.type,
      qty: Number(form.qty),
      reason: form.reason,
      reference: form.reference,
      unitCost: Number(form.unitCost)
    })

    toast.success('Stock Adjusted', {
      description: `Successfully ${form.type.toLowerCase()}ed ${form.qty} units.`
    })
    router.push(`/inventory/${itemId}`)
  } catch (err: any) {
    toast.error('Adjustment Failed', {
      description: err.message || 'Check permissions and current stock levels.'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.push(`/inventory/${itemId}`)">
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Stock Adjustment</h2>
        <p class="text-muted-foreground">Log manual inflow or outflow for {{ item?.sku }}</p>
      </div>
    </div>

    <div v-if="!item && inventoryStore.loading" class="flex justify-center p-12">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
    </div>

    <div v-else-if="item" class="grid gap-6 md:grid-cols-3">
      <div class="md:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Adjustment Details</CardTitle>
            <CardDescription>Specify the quantity and reason for this change.</CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="handleSubmit" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="type">Adjustment Type</Label>
                  <Select v-model="form.type">
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADD">Add to Stock (+)</SelectItem>
                      <SelectItem value="REMOVE">Remove from Stock (-)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="qty">Quantity ({{ item.uom }})</Label>
                  <Input id="qty" type="number" v-model="form.qty" min="1" required />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="unitCost">Unit Cost (Optional)</Label>
                  <Input id="unitCost" type="number" v-model="form.unitCost" min="0" step="0.01" />
                </div>
                <div class="space-y-2">
                  <Label for="reference">Reference / PO #</Label>
                  <Input id="reference" v-model="form.reference" placeholder="e.g. PO-2024-001" />
                </div>
              </div>

              <div class="space-y-2">
                <Label for="reason">Reason for Adjustment</Label>
                <Textarea id="reason" v-model="form.reason"
                  placeholder="e.g. Damaged during handling, Initial stock take, Supplier delivery..." rows="3"
                  required />
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" @click="router.push(`/inventory/${itemId}`)">Cancel</Button>
                <Button type="submit" :disabled="submitting || (form.type === 'REMOVE' && form.qty > item.onHand)">
                  <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
                  <ArrowUpRight v-if="form.type === 'ADD'" class="mr-2 h-4 w-4" />
                  <ArrowDownRight v-else class="mr-2 h-4 w-4" />
                  Post Adjustment
                </Button>
              </div>
              <p v-if="form.type === 'REMOVE' && form.qty > item.onHand" class="text-xs text-destructive text-right">
                Insufficient stock on hand for this removal.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle class="text-sm font-medium">Stock Preview</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex justify-between items-center text-sm">
              <span class="text-muted-foreground">Current Stock:</span>
              <span class="font-bold">{{ item.onHand }}</span>
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-muted-foreground">Adjustment:</span>
              <span :class="form.type === 'ADD' ? 'text-green-600' : 'text-destructive'">
                {{ form.type === 'ADD' ? '+' : '-' }}{{ form.qty }}
              </span>
            </div>
            <div class="border-t pt-2 flex justify-between items-center font-bold">
              <span>Projection:</span>
              <span :class="{ 'text-destructive': projectedStock <= (item.reorderLevel || 0) }">
                {{ projectedStock }} {{ item.uom }}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-sm font-medium flex items-center gap-2">
              <Info class="h-4 w-4" /> Audit Info
            </CardTitle>
          </CardHeader>
          <CardContent class="text-xs text-muted-foreground space-y-2">
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="text-[10px]">ADJUST</Badge>
              <span>Posted as manual audit.</span>
            </div>
            <p>This action will create an immutable entry in the Stock Ledger.</p>
            <p>Your User ID will be recorded as the poster.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
