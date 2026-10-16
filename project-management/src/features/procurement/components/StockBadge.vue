<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariants } from '@/components/ui/badge'

const props = defineProps<{
  onHand: number
  qtyNeeded?: number
}>()

// Determine badge variant and text based on props
const badgeConfig = computed(() => {
  const { onHand, qtyNeeded } = props
  
  if (qtyNeeded !== undefined) {
    // Comparison mode
    if (onHand === 0) {
      return {
        variant: 'destructive' as BadgeVariants['variant'],
        text: 'Out of Stock'
      }
    } else if (onHand < qtyNeeded) {
      return {
        variant: 'secondary' as BadgeVariants['variant'],
        text: `Only ${onHand} in stock`
      }
    } else {
      return {
        variant: 'default' as BadgeVariants['variant'],
        text: `${onHand} available`
      }
    }
  } else {
    // Simple mode
    if (onHand === 0) {
      return {
        variant: 'destructive' as BadgeVariants['variant'],
        text: 'Out of Stock'
      }
    } else if (onHand <= 10) {
      return {
        variant: 'secondary' as BadgeVariants['variant'],
        text: `${onHand} in stock`
      }
    } else {
      return {
        variant: 'default' as BadgeVariants['variant'],
        text: `${onHand} in stock`
      }
    }
  }
})
</script>

<template>
  <Badge :variant="badgeConfig.variant" class="font-medium">
    {{ badgeConfig.text }}
  </Badge>
</template>