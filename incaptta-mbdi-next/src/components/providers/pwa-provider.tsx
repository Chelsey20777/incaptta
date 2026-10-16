'use client'

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

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

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (standalone) {
      setIsInstalled(true)
    }

    setBannerDismissed(localStorage.getItem('mbdi_pwa_banner_dismissed') === 'true')

    if ('serviceWorker' in navigator) {
      // Prefer dedicated PWA worker. Unregister broken chat-era messaging SW if it owns the page.
      navigator.serviceWorker
        .getRegistrations()
        .then(async (regs) => {
          for (const reg of regs) {
            const script = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || ''
            if (script.includes('firebase-messaging-sw.js')) {
              try {
                await reg.unregister()
                console.log('[PWA] Unregistered legacy firebase-messaging-sw.js')
              } catch {
                /* ignore */
              }
            }
          }
          return navigator.serviceWorker.register('/sw.js', { scope: '/' })
        })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope)
        })
        .catch((err) => {
          console.error('[PWA] Service Worker registration failed:', err)
        })
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      setIsInstallable(true)
      setTimeout(() => setShowBanner(true), 1500)
    }

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
    await deferredPrompt.prompt()
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
    localStorage.setItem('mbdi_pwa_banner_dismissed', 'true')
  }

  const shouldShowBanner = showBanner && isInstallable && !isInstalled && !bannerDismissed

  return (
    <PWAContext.Provider value={{ isInstallable, isInstalled, install }}>
      {children}

      {shouldShowBanner && (
        <div
          className="fixed bottom-4 left-1/2 z-[9999] flex w-[min(100%-2rem,360px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <img
            src="/icons/icon-192.png"
            alt="MBDI"
            className="h-10 w-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-white">Install MBDI</p>
            <p className="mt-0.5 text-xs leading-tight text-slate-400">
              Install on this device for quick access
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              onClick={install}
              className="h-8 rounded-xl px-3 text-xs font-semibold text-white"
              style={{ backgroundColor: '#ea580c' }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Install
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={dismissBanner}
              className="h-8 w-8 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PWAContext.Provider>
  )
}
