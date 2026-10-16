<script setup lang="ts">
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { Button } from '@/components/ui/button'
import { RefreshCcw, X, Info, Loader2 } from 'lucide-vue-next'

const {
  offlineReady,
  needRefresh,
  updateServiceWorker,
} = useRegisterSW()

const isRefreshing = ref(false)

const handleRefresh = async () => {
  isRefreshing.value = true
  // The true argument tells the plugin to reload the page after update
  await updateServiceWorker(true)
}

const close = () => {
  offlineReady.value = false
  needRefresh.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-500 ease-out"
    enter-from-class="translate-y-full opacity-0 scale-95"
    enter-to-class="translate-y-0 opacity-100 scale-100"
    leave-active-class="transition-all duration-400 ease-in"
    leave-from-class="translate-y-0 opacity-100 scale-100"
    leave-to-class="translate-y-full opacity-0 scale-90"
  >
    <div
      v-if="offlineReady || needRefresh"
      class="fixed bottom-20 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-[380px]"
    >
      <div class="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/90 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <!-- Progress bar style accent -->
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/50 to-primary animate-pulse" />
        
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RefreshCcw v-if="needRefresh" class="size-5 animate-spin-slow" />
            <Info v-else class="size-5" />
          </div>
          
          <div class="flex-1 space-y-1 pr-6">
            <p class="text-sm font-bold text-foreground">
              {{ needRefresh ? 'New version available!' : 'App ready to work offline' }}
            </p>
            <p class="text-xs text-muted-foreground leading-snug">
              {{ needRefresh 
                ? 'A critical update has been deployed. Refresh now to experience the latest features and fixes.' 
                : 'The app has been cached for offline use. You can continue working without an internet connection.' 
              }}
            </p>
            
            <div class="mt-4 flex gap-2">
              <Button 
                v-if="needRefresh"
                size="sm" 
                class="h-8 bg-primary hover:bg-primary/90 text-white font-bold text-[11px] px-4 rounded-lg shadow-lg shadow-primary/20"
                :disabled="isRefreshing"
                @click="handleRefresh"
              >
                <Loader2 v-if="isRefreshing" class="mr-2 size-3 animate-spin" />
                {{ isRefreshing ? 'Refreshing...' : 'Refresh Now' }}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                class="h-8 border-border/50 hover:bg-muted font-bold text-[11px] px-4 rounded-lg"
                @click="close"
              >
                {{ needRefresh ? 'Later' : 'Dismiss' }}
              </Button>
            </div>
          </div>

          <button 
            class="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            @click="close"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
.animate-spin-slow {
  animation: spin-slow 8s linear infinite;
}
</style>
