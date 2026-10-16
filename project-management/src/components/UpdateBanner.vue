<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { RefreshCw, X } from 'lucide-vue-next'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  // Re-check for updates every 60 seconds while the app is open
  onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 1000)
    }
  }
})

function applyUpdate() {
  updateServiceWorker(true)
}

function dismiss() {
  needRefresh.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-500 ease-out"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition-all duration-300 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div
      v-if="needRefresh"
      class="fixed bottom-0 left-0 right-0 z-[300] px-4 pb-4 pointer-events-none"
    >
      <div class="pointer-events-auto mx-auto max-w-md rounded-2xl border border-sky-500/30 bg-slate-900/95 backdrop-blur-md shadow-2xl shadow-black/40 overflow-hidden">
        <!-- Accent bar -->
        <div class="h-0.5 w-full bg-gradient-to-r from-sky-500 via-blue-400 to-sky-500" />

        <div class="flex items-center gap-4 px-4 py-3">
          <!-- Icon -->
          <div class="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/20">
            <RefreshCw class="h-5 w-5 text-sky-400" />
          </div>

          <!-- Text -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white leading-tight">Update Available</p>
            <p class="text-xs text-slate-400 leading-tight mt-0.5">A new version of IncapttaPro is ready</p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              @click="applyUpdate"
              class="flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 active:bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <RefreshCw class="h-3.5 w-3.5" />
              Update
            </button>
            <button
              @click="dismiss"
              class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
