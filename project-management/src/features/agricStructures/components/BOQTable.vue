<script setup lang="ts">
import type { BOQLineItem } from '../types/fowlrun.types'

defineProps<{ items: BOQLineItem[] }>()

const categoryLabel: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  transport: 'Transport',
}

const tagClass: Record<string, string> = {
  material: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  labour:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  transport:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-border bg-muted/50">
          <th class="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Unit</th>
          <th class="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Qty</th>
          <th class="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
          <th class="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Type</th>
          <th class="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">U.Price</th>
          <th class="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, i) in items"
          :key="i"
          class="border-b border-border last:border-0"
          :class="i % 2 === 1 ? 'bg-muted/30' : ''"
        >
          <td class="px-3 py-2.5 font-mono text-xs text-foreground">{{ item.unit }}</td>
          <td class="px-3 py-2.5 font-mono text-xs text-right text-foreground">{{ item.qty.toLocaleString() }}</td>
          <td class="px-3 py-2.5 text-foreground">{{ item.description }}</td>
          <td class="px-3 py-2.5">
            <span :class="['inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider', tagClass[item.category]]">
              {{ categoryLabel[item.category] }}
            </span>
          </td>
          <td class="px-3 py-2.5 font-mono text-xs text-right text-foreground">${{ item.unitPrice.toFixed(2) }}</td>
          <td class="px-3 py-2.5 font-mono text-xs text-right font-semibold text-foreground">${{ item.total.toFixed(2) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-border bg-muted/50">
          <td colspan="5" class="px-3 py-2.5 text-sm text-muted-foreground font-semibold">Grand Total</td>
          <td class="px-3 py-2.5 font-mono text-sm font-bold text-right" style="color:#CC5500">
            ${{ items.reduce((s, i) => s + i.total, 0).toFixed(2) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
