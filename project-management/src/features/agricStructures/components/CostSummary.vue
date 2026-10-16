<script setup lang="ts">
import type { CalculatorConfig, FowlrunCalculation } from '../types/fowlrun.types'

defineProps<{
  calculation: FowlrunCalculation
  config: CalculatorConfig
}>()
</script>

<template>
  <div class="bg-muted/50 border border-border rounded-xl p-5 mt-4">
    <div class="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Cost Summary</div>

    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between text-sm text-foreground py-1 border-b border-dashed border-border">
        <span>Materials subtotal</span>
        <span>${{ calculation.materialsTotal.toFixed(2) }}</span>
      </div>
      <div v-if="config.includeLabour" class="flex justify-between text-sm text-foreground py-1 border-b border-dashed border-border">
        <span>Labour</span>
        <span>${{ calculation.labourTotal.toFixed(2) }}</span>
      </div>
      <div v-if="config.includeTransport" class="flex justify-between text-sm text-foreground py-1 border-b border-dashed border-border">
        <span>Transport</span>
        <span>${{ calculation.transportTotal.toFixed(2) }}</span>
      </div>
      <div class="flex justify-between py-2 mt-1 border-t-2 border-border font-bold text-base" style="color:#CC5500">
        <span>Grand Total</span>
        <span>${{ calculation.grandTotal.toFixed(2) }}</span>
      </div>
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>Cost per bird ({{ calculation.birdCapacityMin.toLocaleString() }} birds)</span>
        <span>${{ (calculation.grandTotal / calculation.birdCapacityMin).toFixed(2) }}/bird</span>
      </div>
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>Cost per m²</span>
        <span>${{ (calculation.grandTotal / calculation.area).toFixed(2) }}/m²</span>
      </div>
    </div>

    <div class="mt-4 text-[11px] text-muted-foreground leading-relaxed px-3 py-2 rounded-lg border-l-4 bg-orange-50 dark:bg-orange-950/20" style="border-left-color:#CC5500">
      ⚠ Bricks priced at ${{ config.brickUnitCost.toFixed(2) }}/unit · Steel structure quote separate · Transport surcharge applies outside 60km of Harare
    </div>
  </div>
</template>
