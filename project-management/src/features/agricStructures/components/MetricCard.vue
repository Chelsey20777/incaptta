<script setup lang="ts">
defineProps<{
  label: string
  value: string
  sub?: string
  highlight?: boolean
}>()
</script>

<template>
  <div
    class="rounded-xl p-3.5 border"
    :class="highlight
      ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50'
      : 'bg-muted/50 border-border'"
  >
    <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{{ label }}</div>
    <div
      class="text-xl font-semibold"
      :class="highlight ? 'text-orange-600' : 'text-foreground'"
    >{{ value }}</div>
    <div v-if="sub" class="text-[11px] text-muted-foreground mt-0.5">{{ sub }}</div>
  </div>
</template>
