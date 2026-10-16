<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"
import { badgeVariants, type BadgeVariants } from "."

const props = defineProps<{
  class?: HTMLAttributes["class"]
  variant?: BadgeVariants["variant"]
}>()
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </div>
</template>
