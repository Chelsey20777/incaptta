<script setup lang="ts">
defineProps<{
  label: string
  value: string
  sub?: string
  highlight?: boolean
}>()
</script>

<template>
  <div :class="['metric-card', { 'metric-card--highlight': highlight }]">
    <div class="metric-card__label">{{ label }}</div>
    <div class="metric-card__value">{{ value }}</div>
    <div v-if="sub" class="metric-card__sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.metric-card {
  background: var(--color-background-secondary, #f9fafb);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--color-border, #f3f4f6);
}

.metric-card--highlight {
  background: #fff5f0;
  border-color: rgba(204, 85, 0, 0.2);
}

.metric-card__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 6px;
}

.metric-card__value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary, #111);
}

.metric-card--highlight .metric-card__value {
  color: #CC5500;
}

.metric-card__sub {
  font-size: 11px;
  color: var(--color-text-secondary, #9ca3af);
  margin-top: 3px;
}
</style>
