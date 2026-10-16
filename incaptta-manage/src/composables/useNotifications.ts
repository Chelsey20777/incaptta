import { ref } from 'vue'

export interface AppNotification {
  id: string
  title: string
  body: string
  type: 'approval' | 'info' | 'success'
  createdAt: number
}

// ── Singleton state shared across the whole app ─────────────────────
const permission = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'default'
)
const toasts = ref<AppNotification[]>([])

// ── Web Audio chime (no audio file needed) ──────────────────────────
function playSound() {
  try {
    const ctx = new AudioContext()

    const schedule = (freq: number, startAt: number, duration: number, volume = 0.25) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startAt)
      gain.gain.setValueAtTime(volume, startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)
      osc.start(startAt)
      osc.stop(startAt + duration)
    }

    // Two-note upward chime: E5 → G#5
    const t = ctx.currentTime
    schedule(659.25, t,        0.22)   // E5
    schedule(830.61, t + 0.15, 0.35)   // G#5

    // Auto-close context after done
    setTimeout(() => ctx.close(), 800)
  } catch {
    // AudioContext blocked (e.g. no user gesture yet) — silent fail
  }
}

// ── In-app toast queue ───────────────────────────────────────────────
function pushToast(notification: Omit<AppNotification, 'id' | 'createdAt'>) {
  const id = crypto.randomUUID()
  toasts.value.push({ ...notification, id, createdAt: Date.now() })
  // Auto-remove after 7 s
  setTimeout(() => {
    toasts.value = toasts.value.filter(n => n.id !== id)
  }, 7000)
}

function dismissToast(id: string) {
  toasts.value = toasts.value.filter(n => n.id !== id)
}

// ── System (OS-level) notification ──────────────────────────────────
function showSystemNotification(title: string, body: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'incaptta-approval',   // collapse duplicates
    })
    n.onclick = () => { window.focus(); n.close() }
  } catch {
    // Firefox private mode blocks Notification constructor — silent fail
  }
}

// ── Main entry point ─────────────────────────────────────────────────
async function requestPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') {
    permission.value = 'granted'
    return true
  }
  if (Notification.permission === 'denied') {
    permission.value = 'denied'
    return false
  }
  const result = await Notification.requestPermission()
  permission.value = result
  return result === 'granted'
}

/**
 * Fire a notification: plays sound + shows in-app toast + system notification.
 * Call this whenever a new approval item arrives.
 */
function notify(
  title: string,
  body: string,
  type: AppNotification['type'] = 'approval'
) {
  playSound()
  pushToast({ title, body, type })
  showSystemNotification(title, body)
}

export function useNotifications() {
  return {
    permission,
    toasts,
    requestPermission,
    playSound,
    notify,
    dismissToast,
  }
}
