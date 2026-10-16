<script setup lang="ts">
import type { StructureSize } from '../types/fowlrun.types'

defineProps<{ size: StructureSize; active: boolean }>()
const emit = defineEmits<{ select: [size: StructureSize] }>()
</script>

<template>
  <button
    class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all whitespace-nowrap"
    :class="active
      ? 'text-white border-transparent'
      : 'bg-background text-foreground border-border hover:border-orange-500 hover:text-orange-600'"
    :style="active ? 'background:#CC5500; border-color:#CC5500' : ''"
    @click="emit('select', size)"
  >
    {{ size.label }}
  </button>
</template>
