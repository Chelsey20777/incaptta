<script setup lang="ts">
import { Bell, X, CheckCircle2, Info } from 'lucide-vue-next'
import { useNotifications } from '@/composables/useNotifications'

const { toasts, dismissToast } = useNotifications()

const icons = {
  approval: Bell,
  success:  CheckCircle2,
  info:     Info,
}

const colours = {
  approval: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  success:  'border-green-500/30 bg-green-500/10 text-green-400',
  info:     'border-sky-500/30 bg-sky-500/10 text-sky-400',
}
</script>

<template>
  <!-- Stack of toasts — newest at bottom -->
  <div class="fixed top-4 left-0 right-0 z-[500] flex flex-col gap-2 px-3 pointer-events-none">
    <TransitionGroup
      enter-active-class="transition-all duration-400 ease-out"
      enter-from-class="-translate-y-4 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-90"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl shadow-black/30 overflow-hidden"
      >
        <!-- Coloured accent bar -->
        <div
          class="h-0.5 w-full"
          :class="{
            'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500': toast.type === 'approval',
            'bg-gradient-to-r from-green-500 to-emerald-400':              toast.type === 'success',
            'bg-gradient-to-r from-sky-500 to-blue-400':                   toast.type === 'info',
          }"
        />

        <div class="flex items-start gap-3 px-4 py-3">
          <!-- Icon bubble -->
          <div class="flex-shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border"
            :class="colours[toast.type]">
            <component :is="icons[toast.type]" class="size-4" />
          </div>

          <!-- Text -->
          <div class="flex-1 min-w-0 pt-0.5">
            <p class="text-sm font-bold text-foreground leading-tight">{{ toast.title }}</p>
            <p class="text-xs text-muted-foreground leading-snug mt-0.5">{{ toast.body }}</p>
          </div>

          <!-- Dismiss -->
          <button
            @click="dismissToast(toast.id)"
            class="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
