<script setup lang="ts">
import type { BOQLineItem } from '../../../types/fowlrun.types'

defineProps<{ items: BOQLineItem[] }>()

const categoryLabel: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  transport: 'Transport',
}

const categoryClass: Record<string, string> = {
  material: 'tag--material',
  labour: 'tag--labour',
  transport: 'tag--transport',
}
</script>

<template>
  <div class="boq-wrapper">
    <table class="boq-table">
      <thead>
        <tr>
          <th>Unit</th>
          <th class="right">Qty</th>
          <th>Description</th>
          <th>Type</th>
          <th class="right">U.Price</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, i) in items" :key="i" :class="{ 'row-alt': i % 2 === 1 }">
          <td class="mono">{{ item.unit }}</td>
          <td class="right mono">{{ item.qty.toLocaleString() }}</td>
          <td>{{ item.description }}</td>
          <td>
            <span :class="['tag', categoryClass[item.category]]">
              {{ categoryLabel[item.category] }}
            </span>
          </td>
          <td class="right mono">${{ item.unitPrice.toFixed(2) }}</td>
          <td class="right mono bold">${{ item.total.toFixed(2) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="foot-label">Grand Total</td>
          <td class="right mono orange bold">
            ${{ items.reduce((s, i) => s + i.total, 0).toFixed(2) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.boq-wrapper { overflow-x: auto; }

.boq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.boq-table th {
  padding: 9px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary, #6b7280);
  border-bottom: 2px solid var(--color-border, #e5e7eb);
  white-space: nowrap;
}

.boq-table td {
  padding: 9px 12px;
  color: var(--color-text-primary, #374151);
  border-bottom: 1px solid var(--color-border, #f3f4f6);
}

.row-alt td { background: var(--color-background-secondary, #fafafa); }

.boq-table tfoot td {
  padding: 10px 12px;
  background: var(--color-background-secondary, #f9fafb);
  border-top: 2px solid var(--color-border, #e5e7eb);
  font-weight: 600;
}

.foot-label { color: var(--color-text-secondary, #6b7280); font-size: 13px; }
.right { text-align: right; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.bold { font-weight: 600; }
.orange { color: #CC5500; }

.tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tag--material  { background: #E1F5EE; color: #0F6E56; }
.tag--labour    { background: #FAECE7; color: #993C1D; }
.tag--transport { background: #E6F1FB; color: #185FA5; }
</style>
