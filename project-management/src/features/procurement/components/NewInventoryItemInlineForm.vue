<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { PackagePlus } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, ErrorMessage } from 'vee-validate'
import type { NewItemData } from '../types'
import { db } from '@/lib/firebase'

const props = defineProps<{
  modelValue: NewItemData
  lineIndex: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: NewItemData]
}>()

interface CategoryOption {
  id: string
  name: string
}

const categories = ref<CategoryOption[]>([])
const loadingCategories = ref(true)
const uomOptions = ['PCS', 'KG', 'METER', 'LITER', 'BOX', 'PACK', 'SET', 'UNIT']

onMounted(async () => {
  const { collection, getDocs } = await import('firebase/firestore')
  try {
    const snap = await getDocs(collection(db, 'inventoryCategories'))
    categories.value = snap.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name as string
      // Using .name field as specified, common alternatives: categoryName, label, title
    }))
  } catch (e) {
    console.error('Failed to load categories:', e)
  } finally {
    loadingCategories.value = false
  }
})

function updateField(field: keyof NewItemData, value: string | number) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value
  })
}

const totalCostPreview = computed(() => {
  const cost = props.modelValue.purchasePrice || 0
  const freight = props.modelValue.freightDuty || 0
  return cost + freight
})

const sellingPricePreview = computed(() => {
  const markup = props.modelValue.markupPercent || 0
  return totalCostPreview.value * (1 + markup / 100)
})
</script>

<template>
  <div 
    class="rounded-lg border border-blue-200 bg-blue-50 p-4 mt-2"
    :class="{ 'opacity-50 pointer-events-none': disabled }"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 mb-4">
      <PackagePlus :size="16" class="text-blue-600 shrink-0" />
      <div class="flex flex-col">
        <p class="text-sm font-semibold text-blue-700">
          New Inventory Item Details
        </p>
        <p class="text-xs text-blue-500">
          This item will be registered in inventory when the GRN is confirmed.
        </p>
      </div>
    </div>

    <!-- Fields Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <!-- Field 1: name -->
      <div class="space-y-1">
        <Label>
          Item Name <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`name_${lineIndex}`"
          :rules="{ required: true }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Input
            type="text"
            v-bind="field"
            :value="modelValue.name"
            @input="updateField('name', ($event.target as HTMLInputElement).value)"
            :class="{ 'border-destructive': errorMessage }"
          />
        </Field>
        <ErrorMessage :name="`name_${lineIndex}`" class="text-xs text-red-500 mt-1" />
      </div>

      <!-- Field 2: sku -->
      <div class="space-y-1">
        <Label>
          SKU Code <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`sku_${lineIndex}`"
          :rules="{
            required: true, 
            min: 2, 
            max: 20, 
            regex: {
              value: /^[A-Z0-9-]+$/i,
              message: 'SKU must contain only letters, numbers, and hyphens — no spaces'
            }
          }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Input
            type="text"
            v-bind="field"
            :value="modelValue.sku"
            class="uppercase"
            @input="updateField('sku', ($event.target as HTMLInputElement).value.toUpperCase())"
            :class="{ 'border-destructive': errorMessage }"
          />
        </Field>
        <ErrorMessage :name="`sku_${lineIndex}`" class="text-xs text-red-500 mt-1" />
        <p class="text-xs text-muted-foreground mt-1">
          e.g. CMT-01 — unique, no spaces
        </p>
      </div>

      <!-- Field 3: uom -->
      <div class="space-y-1">
        <Label>
          Unit of Measure <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`uom_${lineIndex}`"
          :rules="{ required: true }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Select
            :model-value="field.value"
            @update:modelValue="(val) => {
              if (val != null) {
                field.onChange(val)
                updateField('uom', String(val))
              }
            }"
          >
            <SelectTrigger :class="{ 'border-destructive': errorMessage }">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="uom in uomOptions" :key="uom" :value="uom">
                {{ uom }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <ErrorMessage :name="`uom_${lineIndex}`" class="text-xs text-red-500 mt-1" />
      </div>

      <!-- Field 4: categoryId -->
      <div class="space-y-1">
        <Label>
          Category <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`categoryId_${lineIndex}`"
          :rules="{ required: true }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Select
            :model-value="field.value"
            @update:modelValue="(val) => {
              if (val != null) {
                field.onChange(val)
                const cat = categories.find(c => c.id === String(val))
                emit('update:modelValue', {
                  ...props.modelValue,
                  categoryId: String(val),
                  categoryName: cat?.name ?? ''
                })
              }
            }"
          >
            <SelectTrigger :class="{ 'border-destructive': errorMessage }">
              <SelectValue :placeholder="loadingCategories ? 'Loading...' : 'Select category'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="cat in categories"
                :key="cat.id"
                :value="cat.id"
              >
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <ErrorMessage :name="`categoryId_${lineIndex}`" class="text-xs text-red-500 mt-1" />
      </div>

      <!-- Field 5: purchasePrice -->
      <div class="space-y-1">
        <Label>
          Purchase Price (per unit) <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`purchasePrice_${lineIndex}`"
          :rules="{ required: true, min_value: 0.01 }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Input
            type="number"
            v-bind="field"
            min="0"
            step="0.01"
            :value="modelValue.purchasePrice"
            @input="updateField('purchasePrice', parseFloat(($event.target as HTMLInputElement).value) || 0)"
            :class="{ 'border-destructive': errorMessage }"
          />
        </Field>
        <ErrorMessage :name="`purchasePrice_${lineIndex}`" class="text-xs text-red-500 mt-1" />
      </div>

      <!-- Field 6: freightDuty -->
      <div class="space-y-1">
        <Label>Freight / Duty (per unit)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          :value="modelValue.freightDuty"
          @input="updateField('freightDuty', parseFloat(($event.target as HTMLInputElement).value) || 0)"
        />
      </div>

      <!-- Field 7: markupPercent -->
      <div class="space-y-1">
        <Label>
          Markup % <span class="text-red-500">*</span>
        </Label>
        <Field
          :name="`markupPercent_${lineIndex}`"
          :rules="{ required: true, min_value: 0 }"
          v-slot="{ field, errorMessage, meta }"
        >
          <Input
            type="number"
            v-bind="field"
            min="0"
            step="1"
            :value="modelValue.markupPercent"
            @input="updateField('markupPercent', parseFloat(($event.target as HTMLInputElement).value) || 0)"
            :class="{ 'border-destructive': errorMessage }"
          />
        </Field>
        <ErrorMessage :name="`markupPercent_${lineIndex}`" class="text-xs text-red-500 mt-1" />
        <p class="text-xs text-muted-foreground mt-1">
          e.g. 30 = 30% markup on total cost
        </p>
      </div>

      <!-- Field 8: reorderLevel -->
      <div class="space-y-1">
        <Label>Reorder Level</Label>
        <Input
          type="number"
          min="0"
          step="1"
          :value="modelValue.reorderLevel"
          @input="updateField('reorderLevel', parseInt(($event.target as HTMLInputElement).value) || 0)"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Low stock warning threshold
        </p>
      </div>

      <!-- Field 9: location -->
      <div class="space-y-1">
        <Label>Warehouse Location</Label>
        <Input
          type="text"
          :value="modelValue.location"
          @input="updateField('location', ($event.target as HTMLInputElement).value)"
        />
        <p class="text-xs text-muted-foreground mt-1">
          e.g. Shelf A3, Warehouse B
        </p>
      </div>
    </div>

    <!-- Price Preview (dynamic) -->
    <div class="mt-3 pt-3 border-t border-blue-200 text-xs text-muted-foreground">
      Total Cost: ${{ totalCostPreview.toFixed(2) }} → Selling Price (IRD): ${{ sellingPricePreview.toFixed(2) }}
    </div>
  </div>
</template>