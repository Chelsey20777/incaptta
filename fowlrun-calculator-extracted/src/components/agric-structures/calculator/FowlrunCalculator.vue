<script setup lang="ts">
import { useFowlrunCalculator } from '../../../composables/useFowlrunCalculator'
import { PRESET_SIZES } from '../../../types/fowlrun.types'
import SizeButton from './SizeButton.vue'
import MetricCard from './MetricCard.vue'
import BOQTable from './BOQTable.vue'
import CostSummary from './CostSummary.vue'

const {
  config,
  activeSize,
  customLength,
  customWidth,
  useCustom,
  calculation,
  selectSize,
  applyCustomSize,
} = useFowlrunCalculator()
</script>

<template>
  <div class="fowlrun-calculator">

    <!-- Header -->
    <div class="calc-header">
      <div class="calc-header__title">
        <h2>Fowlrun Material Calculator</h2>
        <p>Agric-Structures · Brickwork & Flooring BOQ</p>
      </div>
      <div class="calc-header__size-badge">
        {{ activeSize.label }}
      </div>
    </div>

    <!-- Size Selector -->
    <div class="section">
      <label class="section-label">Select Structure Size</label>
      <div class="size-grid">
        <SizeButton
          v-for="size in PRESET_SIZES"
          :key="size.label"
          :size="size"
          :active="!useCustom && activeSize.label === size.label"
          @select="selectSize"
        />
      </div>
    </div>

    <!-- Custom Size -->
    <div class="section custom-size-row">
      <label class="section-label">Custom Size</label>
      <div class="custom-inputs">
        <input
          v-model.number="customLength"
          type="number"
          placeholder="Length (m)"
          min="1"
          max="500"
          class="custom-input"
        />
        <span class="times">×</span>
        <input
          v-model.number="customWidth"
          type="number"
          placeholder="Width (m)"
          min="1"
          max="50"
          class="custom-input"
        />
        <button class="btn-calculate" @click="applyCustomSize">
          Calculate
        </button>
      </div>
    </div>

    <!-- Config Row -->
    <div class="section config-row">
      <div class="config-field">
        <label>Brick cost ($/unit)</label>
        <input v-model.number="config.brickUnitCost" type="number" step="0.01" min="0.01" class="config-input" />
      </div>
      <div class="config-field">
        <label>Cement ($/bag)</label>
        <input v-model.number="config.cementUnitCost" type="number" step="0.5" min="1" class="config-input" />
      </div>
      <div class="config-field toggle-field">
        <label>Include Labour</label>
        <input v-model="config.includeLabour" type="checkbox" class="toggle" />
      </div>
      <div class="config-field toggle-field">
        <label>Include Transport</label>
        <input v-model="config.includeTransport" type="checkbox" class="toggle" />
      </div>
    </div>

    <!-- Metrics -->
    <div class="metrics-grid">
      <MetricCard label="Floor Area"      :value="`${calculation.area.toLocaleString()}m²`"  sub="`${calculation.size.length}m × ${calculation.size.width}m`" />
      <MetricCard label="Bird Capacity"   :value="`${calculation.birdCapacityMin.toLocaleString()}–${calculation.birdCapacityMax.toLocaleString()}`" sub="broiler density" />
      <MetricCard label="Structural Bays" :value="calculation.bays.toString()" sub="@ 5m spacing" />
      <MetricCard label="Grand Total"     :value="`$${calculation.grandTotal.toFixed(2)}`" sub="current config" highlight />
    </div>

    <!-- BOQ Table -->
    <div class="section">
      <label class="section-label">Bill of Quantities</label>
      <BOQTable :items="calculation.items" />
    </div>

    <!-- Cost Summary -->
    <CostSummary :calculation="calculation" :config="config" />

  </div>
</template>

<style scoped>
.fowlrun-calculator {
  font-family: 'DM Sans', sans-serif;
  padding: 1.5rem;
  background: var(--color-background, #fff);
  border-radius: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  max-width: 960px;
}

.calc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.calc-header__title h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #111);
  margin: 0 0 4px;
}

.calc-header__title p {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  margin: 0;
}

.calc-header__size-badge {
  background: #CC5500;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
}

.section { margin-bottom: 1.25rem; }

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 8px;
}

.size-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-size-row .custom-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.custom-input, .config-input {
  width: 100px;
  padding: 7px 12px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  font-size: 13px;
  background: var(--color-background, #fff);
  color: var(--color-text-primary, #111);
  transition: border-color 0.15s;
}

.custom-input:focus, .config-input:focus {
  outline: none;
  border-color: #CC5500;
  box-shadow: 0 0 0 3px rgba(204, 85, 0, 0.1);
}

.times {
  font-size: 16px;
  color: var(--color-text-secondary, #9ca3af);
  font-weight: 500;
}

.btn-calculate {
  padding: 7px 18px;
  background: #CC5500;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-calculate:hover { background: #aa4400; }

.config-row {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-field label {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.toggle-field { justify-content: flex-end; }

.toggle {
  width: 36px;
  height: 20px;
  cursor: pointer;
  accent-color: #CC5500;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 1.5rem;
}

@media (max-width: 640px) {
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  .config-row { flex-direction: column; gap: 0.75rem; }
}
</style>
