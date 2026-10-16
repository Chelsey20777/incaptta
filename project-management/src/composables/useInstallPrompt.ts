import { ref, onMounted, onUnmounted } from 'vue'

const DISMISSED_KEY = 'pwa-install-dismissed'

// Shared state so all consumers see the same prompt
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstallable = ref(false)
const isInstalled = ref(false)

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const isDismissed = ref(localStorage.getItem(DISMISSED_KEY) === '1')

  function handleBeforeInstallPrompt(e: Event) {
    e.preventDefault()
    deferredPrompt.value = e as BeforeInstallPromptEvent
    isInstallable.value = true
  }

  function handleAppInstalled() {
    isInstalled.value = true
    isInstallable.value = false
    deferredPrompt.value = null
  }

  async function promptInstall() {
    if (!deferredPrompt.value) return
    await deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    if (outcome === 'accepted') {
      isInstalled.value = true
      isInstallable.value = false
    }
    deferredPrompt.value = null
  }

  function dismiss() {
    isDismissed.value = true
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled.value = true
    }
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  })

  return { isInstallable, isInstalled, isDismissed, promptInstall, dismiss }
}
