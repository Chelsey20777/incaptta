<script setup lang="ts">
import type { CalculatorConfig, FowlrunCalculation } from '../../../types/fowlrun.types'

defineProps<{
  calculation: FowlrunCalculation
  config: CalculatorConfig
}>()
</script>

<template>
  <div class="cost-summary">
    <div class="summary-title">Cost Summary</div>
    <div class="summary-rows">
      <div class="summary-row">
        <span>Materials subtotal</span>
        <span>${{ calculation.materialsTotal.toFixed(2) }}</span>
      </div>
      <div v-if="config.includeLabour" class="summary-row">
        <span>Labour</span>
        <span>${{ calculation.labourTotal.toFixed(2) }}</span>
      </div>
      <div v-if="config.includeTransport" class="summary-row">
        <span>Transport</span>
        <span>${{ calculation.transportTotal.toFixed(2) }}</span>
      </div>
      <div class="summary-row summary-row--total">
        <span>Grand Total</span>
        <span>${{ calculation.grandTotal.toFixed(2) }}</span>
      </div>
      <div class="summary-row summary-row--muted">
        <span>Cost per bird ({{ calculation.birdCapacityMin.toLocaleString() }} birds)</span>
        <span>${{ (calculation.grandTotal / calculation.birdCapacityMin).toFixed(2) }}/bird</span>
      </div>
      <div class="summary-row summary-row--muted">
        <span>Cost per m²</span>
        <span>${{ (calculation.grandTotal / calculation.area).toFixed(2) }}/m²</span>
      </div>
    </div>
    <div class="summary-note">
      ⚠ Bricks priced at ${{ config.brickUnitCost.toFixed(2) }}/unit · Steel structure quote separate · Transport surcharge applies outside 60km of Harare
    </div>
  </div>
</template>

<style scoped>
.cost-summary {
  background: var(--color-background-secondary, #f9fafb);
  border-radius: 10px;
  padding: 1.25rem;
  border: 1px solid var(--color-border, #e5e7eb);
  margin-top: 1rem;
}

.summary-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 10px;
}

.summary-rows { display: flex; flex-direction: column; gap: 6px; }

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-primary, #374151);
  padding: 4px 0;
  border-bottom: 1px dashed var(--color-border, #e5e7eb);
}

.summary-row--total {
  font-weight: 700;
  font-size: 15px;
  color: #CC5500;
  border-bottom: none;
  border-top: 2px solid var(--color-border, #e5e7eb);
  padding-top: 8px;
  margin-top: 4px;
}

.summary-row--muted {
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  border-bottom: none;
}

.summary-note {
  margin-top: 12px;
  font-size: 11px;
  color: var(--color-text-secondary, #9ca3af);
  line-height: 1.5;
  padding: 8px 10px;
  background: #fff5f0;
  border-radius: 6px;
  border-left: 3px solid #CC5500;
}
</style>
