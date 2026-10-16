<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  modelValue: Record<string, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [val: Record<string, string>]
}>()

function update(key: string, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <Card
    class="bg-orange-50/30 dark:bg-orange-900/10 border-orange-200/60 dark:border-orange-700/30 shadow-md overflow-hidden">
    <CardHeader class="bg-orange-50/50 border-b border-orange-200/40 py-5">
      <CardTitle class="text-xl font-bold text-orange-600 dark:text-orange-400">
        AGF Structure Specifications
      </CardTitle>
      <CardDescription class="text-foreground/60">
        Agristructures &amp; Fabrications — technical details printed on the construction quote PDF.
      </CardDescription>
    </CardHeader>
    <CardContent class="p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

        <!-- Cover Sub-title -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Cover Sub-title</Label>
          <Input
            placeholder="e.g. Steel Fabrication Only"
            :model-value="modelValue.coverSubtitle || ''"
            @update:model-value="v => update('coverSubtitle', v as string)" />
        </div>

        <!-- Bird Capacity -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Bird Capacity</Label>
          <Input
            placeholder="e.g. 8,000 – 12,000"
            :model-value="modelValue.birdCapacity || ''"
            @update:model-value="v => update('birdCapacity', v as string)" />
        </div>

        <!-- Truss Construction -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Truss Construction</Label>
          <Input
            placeholder="e.g. 80CM Apex"
            :model-value="modelValue.trussConstruction || ''"
            @update:model-value="v => update('trussConstruction', v as string)" />
        </div>

        <!-- Truss Type -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Truss Type</Label>
          <Input
            placeholder="e.g. H.T Angle Iron"
            :model-value="modelValue.trussType || ''"
            @update:model-value="v => update('trussType', v as string)" />
        </div>

        <!-- Bay Spacing -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Bay Spacing</Label>
          <Input
            placeholder="e.g. 3M centres"
            :model-value="modelValue.baySpacing || ''"
            @update:model-value="v => update('baySpacing', v as string)" />
        </div>

        <!-- Purlin Type -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Purlin Type</Label>
          <Input
            placeholder="e.g. 40x40x3mm angle iron"
            :model-value="modelValue.purlinType || ''"
            @update:model-value="v => update('purlinType', v as string)" />
        </div>

        <!-- Sheeting & Flashing -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Sheeting &amp; Flashing</Label>
          <Input
            placeholder="e.g. IBR 0.47mm Zinc"
            :model-value="modelValue.sheetingAndFlashing || ''"
            @update:model-value="v => update('sheetingAndFlashing', v as string)" />
        </div>

        <!-- Sheeting Colour -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Sheeting Colour</Label>
          <Input
            placeholder="e.g. Charcoal / Grey"
            :model-value="modelValue.sheetingColour || ''"
            @update:model-value="v => update('sheetingColour', v as string)" />
        </div>

        <!-- Side Cladding -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Side Cladding</Label>
          <Input
            placeholder="e.g. IBR sheeting 900mm"
            :model-value="modelValue.sideCladding || ''"
            @update:model-value="v => update('sideCladding', v as string)" />
        </div>

        <!-- End Cladding -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">End Cladding</Label>
          <Input
            placeholder="e.g. IBR sheeting full height"
            :model-value="modelValue.endCladding || ''"
            @update:model-value="v => update('endCladding', v as string)" />
        </div>

        <!-- Doors -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Doors</Label>
          <Input
            placeholder="e.g. 2x sliding access doors"
            :model-value="modelValue.doors || ''"
            @update:model-value="v => update('doors', v as string)" />
        </div>

        <!-- Gutters -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Gutters</Label>
          <Input
            placeholder="e.g. 200mm box gutters both sides"
            :model-value="modelValue.gutters || ''"
            @update:model-value="v => update('gutters', v as string)" />
        </div>

        <!-- Fabrication Lead Time -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Fabrication Lead Time</Label>
          <Input
            placeholder="e.g. 4 – 6 weeks from deposit"
            :model-value="modelValue.fabricationLeadTime || ''"
            @update:model-value="v => update('fabricationLeadTime', v as string)" />
        </div>

        <!-- Installation Period -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Installation Period</Label>
          <Input
            placeholder="e.g. 2 – 3 weeks on site"
            :model-value="modelValue.installationPeriod || ''"
            @update:model-value="v => update('installationPeriod', v as string)" />
        </div>

        <!-- Total Project Duration -->
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Total Project Duration</Label>
          <Input
            placeholder="e.g. 6 – 9 weeks"
            :model-value="modelValue.totalProjectDuration || ''"
            @update:model-value="v => update('totalProjectDuration', v as string)" />
        </div>

        <!-- Insulation Notes (full width) -->
        <div class="md:col-span-2 lg:col-span-3 space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Insulation Notes</Label>
          <Textarea
            placeholder="Optional insulation specifications or notes..."
            rows="2"
            :model-value="modelValue.insulationNotes || ''"
            @update:model-value="v => update('insulationNotes', v as string)" />
        </div>

        <!-- Ventilation Notes (full width) -->
        <div class="md:col-span-2 lg:col-span-3 space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-orange-600">Ventilation Notes</Label>
          <Textarea
            placeholder="Optional ventilation specifications or notes..."
            rows="2"
            :model-value="modelValue.ventilationNotes || ''"
            @update:model-value="v => update('ventilationNotes', v as string)" />
        </div>

      </div>
    </CardContent>
  </Card>
</template>
