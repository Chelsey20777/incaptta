'use client'

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Context ──────────────────────────────────────────────────────────────────
interface PWAContextValue {
  isInstallable: boolean
  isInstalled: boolean
  install: () => Promise<void>
}

const PWAContext = createContext<PWAContextValue>({
  isInstallable: false,
  isInstalled: false,
  install: async () => {},
})

export const usePWA = () => useContext(PWAContext)

// ── Provider ──────────────────────────────────────────────────────────────────
export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Check if user previously dismissed the banner
    setBannerDismissed(localStorage.getItem('pwa_banner_dismissed') === 'true')

    // Register the service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope)
        })
        .catch((err) => {
          console.error('[PWA] Service Worker registration failed:', err)
        })
    }

    // Capture the native install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
      // Show the banner after a short delay so the app feels settled
      setTimeout(() => setShowBanner(true), 3000)
    }

    // Detect when the app is installed from outside
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setShowBanner(false)
      setDeferredPrompt(null)
      console.log('[PWA] App installed successfully')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setIsInstallable(false)
    }
    setDeferredPrompt(null)
    setShowBanner(false)
  }

  const dismissBanner = () => {
    setShowBanner(false)
    setBannerDismissed(true)
    localStorage.setItem('pwa_banner_dismissed', 'true')
  }

  const shouldShowBanner = showBanner && isInstallable && !isInstalled && !bannerDismissed

  return (
    <PWAContext value={{ isInstallable, isInstalled, install }}>
      {children}

      {/* ── PWA Install Banner ───────────────────────────────────────────── */}
      {shouldShowBanner && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            minWidth: '280px',
            maxWidth: '360px',
          }}
        >
          <img
            src="/icons/icon-192-maskable.png"
            alt="App Icon"
            className="h-10 w-10 rounded-xl flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Install Chat App</p>
            <p className="text-xs text-slate-400 leading-tight mt-0.5">
              Add to your home screen for quick access
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              onClick={install}
              className="h-8 px-3 text-xs font-semibold rounded-xl text-slate-950"
              style={{ backgroundColor: '#74b419' }}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Install
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={dismissBanner}
              className="h-8 w-8 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PWAContext>
  )
}
