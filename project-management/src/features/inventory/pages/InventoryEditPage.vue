<script setup lang="ts">
import { ref, onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../store/inventoryStore'
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
import { Switch } from '@/components/ui/switch'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { ChevronLeft, Loader2, Save, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
// No longer need const { toast } = useToast()

const itemId = route.params.id as string
const submitting = ref(false)

const form = reactive({
  sku: '',
  name: '',
  uom: '',
  reorderLevel: 0,
  location: '',
  notes: '',
  isActive: true
})

const uomOptions = ['PCS', 'UNIT', 'SET', 'KG', 'METER', 'LITER', 'BOX', 'PACK']

onMounted(async () => {
  await inventoryStore.fetchItem(itemId)
  if (inventoryStore.selectedItem) {
    const item = inventoryStore.selectedItem
    form.sku = item.sku
    form.name = item.name
    form.uom = item.uom
    form.reorderLevel = item.reorderLevel || 0
    form.location = item.location || ''
    form.notes = item.notes || ''
    form.isActive = item.isActive
  }
})

const handleSubmit = async () => {
  if (!form.sku || !form.name) return
  
  submitting.value = true
  try {
    await inventoryStore.updateItem(itemId, {
      ...form,
      reorderLevel: Number(form.reorderLevel)
    })
    toast.success('Updated', {
      description: 'Inventory item details updated.'
    })
    router.push(`/inventory/${itemId}`)
  } catch (err: any) {
    toast.error('Error', {
      description: err.message || 'Failed to update item.'
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
        <h2 class="text-3xl font-bold tracking-tight">Edit Item</h2>
        <p class="text-muted-foreground">Update metadata for {{ form.sku }}</p>
      </div>
    </div>

    <div v-if="inventoryStore.loading && !form.sku" class="flex flex-col items-center justify-center h-64">
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <p class="mt-2 text-muted-foreground">Loading item...</p>
    </div>

    <form v-else @submit.prevent="handleSubmit">
      <div class="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Catalog Configuration</CardTitle>
            <CardDescription>Update the primary identifiers and settings.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="sku">SKU (Read Only)</Label>
                <Input id="sku" v-model="form.sku" readonly class="bg-muted" />
              </div>
              <div class="space-y-2">
                <Label for="uom">Unit of Measure</Label>
                <Select v-model="form.uom">
                  <SelectTrigger>
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in uomOptions" :key="opt" :value="opt">
                      {{ opt }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="space-y-2">
              <Label for="name">Item Name</Label>
              <Input id="name" v-model="form.name" required />
            </div>
            <div class="space-y-2">
              <Label for="notes">Description / Notes</Label>
              <Textarea id="notes" v-model="form.notes" rows="3" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Management</CardTitle>
            <CardDescription>Adjust thresholds and availability.</CardDescription>
          </CardHeader>
          <CardContent class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="reorderLevel">Reorder Level</Label>
              <Input id="reorderLevel" type="number" v-model="form.reorderLevel" min="0" />
            </div>
            <div class="space-y-2">
              <Label for="location">Current Location</Label>
              <Input id="location" v-model="form.location" />
            </div>
          </CardContent>
          <div class="border-t px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Switch id="isActive" v-model:checked="form.isActive" />
              <Label for="isActive">Item is Active</Label>
            </div>
          </div>
        </Card>

        <div class="flex justify-between items-center">
           <p class="text-xs text-muted-foreground">* Changes will be logged with your timestamp.</p>
           <div class="flex gap-2">
            <Button type="button" variant="outline" @click="router.push(`/inventory/${itemId}`)">Cancel</Button>
            <Button type="submit" :disabled="submitting">
              <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
              <Save class="mr-2 h-4 w-4" />
              Save Changes
            </Button>
           </div>
        </div>
      </div>
    </form>
  </div>
</template>
