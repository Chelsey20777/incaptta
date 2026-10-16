<script setup lang="ts">
import { useSession } from '@/composables/useSession'
import { useAdminStore } from '@/stores/adminStore'
import { useApprovalMonitor } from '@/composables/useApprovalMonitor'
import { watch, onMounted, onUnmounted } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import NotificationToast from '@/components/NotificationToast.vue'
import ReloadPrompt from '@/components/ReloadPrompt.vue'
import { Toaster } from 'vue-sonner'

const { loading, user } = useSession()
const adminStore = useAdminStore()
const { start: startMonitor, stop: stopMonitor } = useApprovalMonitor()

// Start monitor only once the user is confirmed authenticated with claims
watch(user, (authedUser) => {
  if (authedUser) {
    startMonitor(authedUser)
  } else {
    stopMonitor()
  }
}, { immediate: true })

// ── Force Refresh Listener ──────────────────────────────────────────
// Prevent infinite reload loops by tracking the timestamp in localStorage
watch(() => adminStore.appSettings?.forceRefreshTimestamp, (ts) => {
  if (!ts) return
  
  // Normalize Firestore timestamp/ISO string to a number
  const serverTime = ts?.toMillis?.() || new Date(ts).getTime()
  if (!serverTime || isNaN(serverTime)) return

  const lastRefreshed = Number(localStorage.getItem('incaptta_last_force_refresh') || 0)
  
  if (serverTime > lastRefreshed) {
    console.log('[System] New force refresh detected. Reloading...')
    localStorage.setItem('incaptta_last_force_refresh', serverTime.toString())
    window.location.reload()
  }
})


// ── PWA Background Update Checker ─────────────────────────────────────
let updateInterval: any = null
const checkUpdates = async () => {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      console.log('[System] Manual background update check initiated...')
      registration.update()
    }
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    checkUpdates()
  }
}

onMounted(() => {
  adminStore.fetchSettings()

  // Check for updates every hour
  updateInterval = setInterval(checkUpdates, 60 * 60 * 1000)
  // Check for updates when user returns to tab
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (updateInterval) clearInterval(updateInterval)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div v-if="loading" class="h-screen w-full flex items-center justify-center bg-background">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else class="min-h-screen w-full bg-background flex flex-col">
    <router-view />
    <NotificationToast />
    <ReloadPrompt />
    <Toaster position="top-center" richColors />
  </div>
</template>

<style>
/* Global styles for Manager Portal */
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--foreground);
  background-color: var(--background);
}
</style>
