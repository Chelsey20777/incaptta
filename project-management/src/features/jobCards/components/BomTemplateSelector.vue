<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Loader2, Zap, AlertTriangle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBomTemplateStore } from '@/features/admin/store/bomTemplateStore'
import { matchInventoryItem, normaliseSizeString } from '../composables/useBomTemplate'
import type { UnmatchedBomItem, BomRequisitionSection } from '../composables/useBomTemplate'
import { STRUCTURE_SIZES } from '../data/bomTemplates'

const props = defineProps<{
  structureSize: string
  inventoryItems: any[]
  jobCategories: any[]
}>()

const emit = defineEmits<{
  apply: [payload: { sections: BomRequisitionSection[], mode: 'replace' | 'append' }]
  unmatched: [items: UnmatchedBomItem[]]
}>()

const bomStore = useBomTemplateStore()
onMounted(() => bomStore.listen())
onUnmounted(() => bomStore.cleanup())

const selectedTemplateId = ref('')
const selectedJobCategoryId = ref('')
const applyMode = ref<'replace' | 'append'>('replace')
const isApplying = ref(false)

const selectedTemplate = computed(() => bomStore.templates.find(t => t.id === selectedTemplateId.value) ?? null)
const selectedCategoryDescription = ref('')
const referenceSize = ref('')

const isCustomSize = computed(() => {
    if (!props.structureSize) return false
    const norm = normaliseSizeString(props.structureSize)
    return !(STRUCTURE_SIZES as readonly string[]).includes(norm)
})

watch(selectedTemplateId, (newId) => {
  const t = bomStore.templates.find(x => x.id === newId)
  if (t) {
    selectedJobCategoryId.value = t.jobCategoryId || ''
    selectedCategoryDescription.value = t.categoryDescription || ''
  }
})

const sizeIsEmpty = computed(() => !props.structureSize || props.structureSize.trim() === '')
const canApply = computed(() =>
  selectedTemplateId.value !== '' &&
  !sizeIsEmpty.value &&
  (!isCustomSize.value || referenceSize.value !== '') &&
  props.inventoryItems.length > 0
)

async function handleApply() {
  if (!canApply.value || !selectedTemplate.value) return
  isApplying.value = true
  try {
    const sizeToUse = isCustomSize.value ? referenceSize.value : normaliseSizeString(props.structureSize)
    const validSizes = STRUCTURE_SIZES as readonly string[]
    
    if (!validSizes.includes(sizeToUse)) {
      toast.error('Invalid Selection', {
        description: `Please select a valid reference size for your custom dimensions.`
      })
      return
    }

    const normalisedSize = sizeToUse

    const items: any[] = []
    const unmatchedItems: UnmatchedBomItem[] = []
    let matchedCount = 0

    for (const row of selectedTemplate.value.rows) {
      const qty = row.quantities[normalisedSize] ?? 0
      if (qty === 0) continue

      const match = matchInventoryItem(row.name, props.inventoryItems)
      if (match) {
        matchedCount++
        items.push({
          id: crypto.randomUUID(),
          inventoryItemId: match.id,
          itemName: match.name,
          description: match.description || '',
          qtyRequired: qty,
          irdSellingPrice: match.sellingPrice || 0,
          markupPercent: 0,
        })
      } else {
        unmatchedItems.push({ templateName: row.name, qty })
        items.push({
          id: crypto.randomUUID(),
          inventoryItemId: '',
          itemName: row.name,
          description: '',
          qtyRequired: qty,
          irdSellingPrice: 0,
          markupPercent: 0,
        })
      }
    }

    const sections: BomRequisitionSection[] = [{
      id: crypto.randomUUID(),
      jobCategoryId: selectedJobCategoryId.value,
      description: selectedCategoryDescription.value || `${selectedTemplate.value.name} — ${normalisedSize}`,
      items,
    }]

    emit('apply', { sections, mode: applyMode.value })
    emit('unmatched', unmatchedItems)

    const label = unmatchedItems.length === 0
      ? `All ${items.length} items matched`
      : `${matchedCount} of ${items.length} items matched`
    toast.success('Template Applied', { description: label })
  } catch (err: any) {
    toast.error('Template Error', { description: err.message || 'Could not apply template.' })
  } finally {
    isApplying.value = false
  }
}
</script>

<template>
  <Card class="border-primary/20 bg-primary/[0.02]">
    <CardHeader class="pb-3 border-b bg-primary/5">
      <div class="flex items-center gap-2">
        <Zap class="size-4 text-primary" />
        <CardTitle class="text-sm font-bold uppercase tracking-wider text-muted-foreground">BOM Template</CardTitle>
      </div>
      <CardDescription class="text-xs mt-1">
        Auto-populate the inventory requisition from a system template based on structure size.
      </CardDescription>
    </CardHeader>
    <CardContent class="pt-4">
      <div class="flex flex-wrap items-end gap-4">

        <!-- Template selector -->
        <div class="space-y-1.5 min-w-[200px]">
          <Label class="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Template</Label>
          <Select v-model="selectedTemplateId">
            <SelectTrigger class="h-9 text-sm">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="t in bomStore.templates" :key="t.id" :value="t.id">
                {{ t.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="bomStore.templates.length === 0" class="text-xs text-muted-foreground">
            No templates configured. Ask an admin to set up BOM templates in Settings.
          </p>
        </div>

        <!-- Job Category -->
        <div class="space-y-1.5 min-w-[180px]">
          <Label class="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Job Category</Label>
          <Select v-model="selectedJobCategoryId">
            <SelectTrigger class="h-9 text-sm">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="cat in jobCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Apply Mode -->
        <div class="space-y-1.5 min-w-[190px]">
          <Label class="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Apply Mode</Label>
          <Select v-model="applyMode">
            <SelectTrigger class="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="replace">Replace existing items</SelectItem>
              <SelectItem value="append">Append to existing items</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Apply Button -->
        <div class="space-y-1.5">
          <Label class="text-xs text-transparent select-none">Apply</Label>
          <Button
            type="button"
            size="sm"
            :disabled="!canApply || isApplying"
            @click="handleApply"
            class="shadow-sm"
          >
            <Loader2 v-if="isApplying" class="mr-2 size-4 animate-spin" />
            <Zap v-else class="mr-2 size-4" />
            Apply {{ isCustomSize ? 'as Draft' : 'Template' }}
          </Button>
        </div>

      </div>

      <!-- Custom Size Reference Picker -->
      <div v-if="isCustomSize" class="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-1">
        <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
           <AlertTriangle class="size-4 shrink-0" />
           <span class="text-xs font-bold uppercase tracking-tight">Custom Dimensions Detected:</span>
        </div>
        <div class="space-y-1.5 min-w-[240px]">
           <Label class="text-[10px] text-muted-foreground uppercase font-semibold">Which standard size should we use as a base?</Label>
           <Select v-model="referenceSize">
              <SelectTrigger class="h-8 text-[11px] bg-background">
                 <SelectValue placeholder="Select reference size..." />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem v-for="size in STRUCTURE_SIZES" :key="size" :value="size">
                    {{ size }} (Use these quantities)
                 </SelectItem>
              </SelectContent>
           </Select>
        </div>
        <p class="text-[10px] text-muted-foreground max-w-sm italic">
          Since "{{ structureSize }}" isn't in the template, we'll use the quantities from your chosen reference size as a starting point. You can then adjust them in the grid below.
        </p>
      </div>

      <!-- Description Preview/Edit -->
      <div v-if="selectedTemplateId" class="mt-4 space-y-2 max-w-2xl">
        <Label class="text-[10px] font-bold uppercase tracking-wider opacity-60">Section Description</Label>
        <Textarea 
          v-model="selectedCategoryDescription" 
          placeholder="Detailed description for this requisition section..." 
          class="min-h-[70px] text-xs bg-background border-primary/10"
        />
        <p class="text-[10px] text-muted-foreground italic">You can tweak this description before applying the template.</p>
      </div>

      <!-- Warning: no structure size entered -->
      <div v-if="sizeIsEmpty && selectedTemplateId" class="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle class="size-4 shrink-0" />
        <span>Select <strong>Dimensions of Structure</strong> in the job information form first.</span>
      </div>

      <div v-else-if="inventoryItems.length === 0" class="mt-3 text-xs text-muted-foreground">
        Loading inventory items...
      </div>
    </CardContent>
  </Card>
</template>
