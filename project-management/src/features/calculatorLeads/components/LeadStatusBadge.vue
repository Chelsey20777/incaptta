<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { LeadStatus } from '../types/lead.types'
import { LEAD_STATUS_CONFIG } from '../types/lead.types'

const props = defineProps<{
  status: LeadStatus
}>()

const config = computed(() => LEAD_STATUS_CONFIG[props.status])
</script>

<template>
  <Badge
    class="font-semibold text-[10px] px-2 py-0.5 border-none capitalize"
    :style="{
      backgroundColor: config.bgColor,
      color: config.color
    }"
  >
    {{ config.label }}
  </Badge>
</template>
