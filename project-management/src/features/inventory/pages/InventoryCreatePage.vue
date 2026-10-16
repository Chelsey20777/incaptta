<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useInventoryStore } from '../store/inventoryStore'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
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
import { ChevronLeft, Loader2, Save } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const router = useRouter()
const inventoryStore = useInventoryStore()
// No longer need const { toast } = useToast()

const form = reactive({
  sku: '',
  name: '',
  uom: 'PCS',
  onHand: 0,
  purchasePrice: 0,
  reorderLevel: 0,
  location: '',
  notes: '',
  isActive: true,
  categoryId: ''
})

const submitting = ref(false)

const uomOptions = ['PCS', 'UNIT', 'SET', 'KG', 'METER', 'LITER', 'BOX', 'PACK']

const handleSubmit = async () => {
  if (!form.sku || !form.name) return

  submitting.value = true
  try {
    await inventoryStore.createItem({
      ...form,
      purchasePrice: Number(form.purchasePrice),
      onHand: Number(form.onHand),
      reorderLevel: Number(form.reorderLevel),
      freightDuty: 0,
      totalCost: Number(form.purchasePrice),
      markupPercent: 0,
      sellingPrice: Number(form.purchasePrice)
    })
    toast.success('Success', {
      description: 'Inventory item created successfully.'
    })
    router.push('/inventory')
  } catch (err: any) {
    toast.error('Error', {
      description: err.message || 'Failed to create inventory item.'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.push('/inventory')">
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Add New Item</h2>
        <p class="text-muted-foreground">Define a new SKU in the product catalog.</p>
      </div>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Primary details for inventory identification.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="sku">SKU / Item Code</Label>
                <Input id="sku" v-model="form.sku" placeholder="e.g. ELEC-001" required />
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
              <Input id="name" v-model="form.name" placeholder="Friendly name for the item" required />
            </div>
            <div class="space-y-2">
              <Label for="notes">Description / Notes</Label>
              <Textarea id="notes" v-model="form.notes" placeholder="Additional details..." rows="3" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory & Stock</CardTitle>
            <CardDescription>Set initial quantities and alerting thresholds.</CardDescription>
          </CardHeader>
          <CardContent class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="onHand">Initial Stock On Hand</Label>
              <Input id="onHand" type="number" v-model="form.onHand" min="0" step="1" />
            </div>
            <div class="space-y-2">
              <Label for="purchasePrice">Purchase Price ($)</Label>
              <Input id="purchasePrice" type="number" v-model="form.purchasePrice" min="0" step="0.01" />
            </div>
            <div class="space-y-2">
              <Label for="reorderLevel">Reorder Level (Alert)</Label>
              <Input id="reorderLevel" type="number" v-model="form.reorderLevel" min="0" />
            </div>
            <div class="space-y-2">
              <Label for="location">Storage Location</Label>
              <Input id="location" v-model="form.location" placeholder="e.g. Warehouse A, Shelf 4" />
            </div>
          </CardContent>
          <CardFooter class="border-t px-6 py-4">
            <div class="flex items-center gap-2">
              <Switch id="isActive" v-model:checked="form.isActive" />
              <Label for="isActive">Item is Active</Label>
            </div>
          </CardFooter>
        </Card>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="router.push('/inventory')">Cancel</Button>
          <Button type="submit" :disabled="submitting">
            <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
            <Save class="mr-2 h-4 w-4" />
            Create Item
          </Button>
        </div>
      </div>
    </form>
  </div>
</template>
