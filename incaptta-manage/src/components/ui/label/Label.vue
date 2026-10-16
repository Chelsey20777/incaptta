<script setup lang="ts">
import { Label } from "radix-vue"
import type { LabelProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<LabelProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <Label
    data-slot="label"
    v-bind="props"
    :class="
      cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
