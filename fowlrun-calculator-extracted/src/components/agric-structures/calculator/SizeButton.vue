<script setup lang="ts">
import type { StructureSize } from '../../../types/fowlrun.types'

defineProps<{ size: StructureSize; active: boolean }>()
const emit = defineEmits<{ select: [size: StructureSize] }>()
</script>

<template>
  <button
    :class="['size-btn', { 'size-btn--active': active }]"
    @click="emit('select', size)"
  >
    {{ size.label }}
  </button>
</template>

<style scoped>
.size-btn {
  padding: 7px 12px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  background: var(--color-background, #fff);
  color: var(--color-text-primary, #374151);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.size-btn:hover {
  border-color: #CC5500;
  color: #CC5500;
}

.size-btn--active {
  background: #CC5500;
  border-color: #CC5500;
  color: #fff;
}
</style>
