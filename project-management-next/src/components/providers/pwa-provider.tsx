'use client'

import { useCallback, useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BRAND_CONFIG } from '@/config/branding'

const INCAPTTA_CACHE_PREFIX = 'incaptta-pro-'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PWAContextValue {
  isInstallable: boolean
  isInstalled: boolean
  isUpdateAvailable: boolean
  isRefreshing: boolean
  install: () => Promise<void>
  checkForUpdate: () => Promise<void>
  refreshApp: () => Promise<void>
}

const PWAContext = createContext<PWAContextValue>({
  isInstallable: false,
  isInstalled: false,
  isUpdateAvailable: false,
  isRefreshing: false,
  install: async () => {},
  checkForUpdate: async () => {},
  refreshApp: async () => {},
})

export const usePWA = () => useContext(PWAContext)

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshStartedRef = useRef(false)

  const checkForUpdate = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const response = await fetch(`/app-version?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!response.ok) return

      const payload = (await response.json()) as { version?: string }
      const deployedVersion = String(payload.version || '').trim()
      const currentVersion = String(process.env.NEXT_PUBLIC_APP_BUILD_VERSION || 'development').trim()
      if (deployedVersion && deployedVersion !== currentVersion) {
        setIsUpdateAvailable(true)
      }
    } catch (error) {
      // Update checks are best-effort; offline users continue with the cached PWA.
      console.debug('[PWA] App version check skipped:', error)
    }
  }, [])

  const refreshApp = useCallback(async () => {
    if (typeof window === 'undefined' || refreshStartedRef.current) return
    refreshStartedRef.current = true
    setIsRefreshing(true)

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(INCAPTTA_CACHE_PREFIX))
            .map((cacheName) => caches.delete(cacheName))
        )
      }

      window.location.reload()
    } catch (error) {
      console.error('[PWA] App refresh failed:', error)
      refreshStartedRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initializeStateId = window.setTimeout(() => {
      setIsInstalled(window.matchMedia('(display-mode: standalone)').matches)
      setBannerDismissed(localStorage.getItem('pwa_banner_dismissed') === 'true')
    }, 0)

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsInstallable(true)
      setTimeout(() => setShowBanner(true), 3000)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setShowBanner(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.clearTimeout(initializeStateId)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initialCheckId = window.setTimeout(() => void checkForUpdate(), 0)
    const intervalId = window.setInterval(() => void checkForUpdate(), 5 * 60 * 1000)
    const handleOnline = () => void checkForUpdate()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(initialCheckId)
      window.clearInterval(intervalId)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkForUpdate])

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let installingWorker: ServiceWorker | null = null
    let cancelled = false
    const hadController = Boolean(navigator.serviceWorker.controller)

    const handleWorkerStateChange = () => {
      if (hadController && installingWorker?.state === 'installed') {
        setIsUpdateAvailable(true)
      }
    }
    const handleUpdateFound = () => {
      installingWorker?.removeEventListener('statechange', handleWorkerStateChange)
      installingWorker = registration?.installing || null
      installingWorker?.addEventListener('statechange', handleWorkerStateChange)
    }

    void navigator.serviceWorker.ready.then((readyRegistration) => {
      if (cancelled) return
      registration = readyRegistration
      registration.addEventListener('updatefound', handleUpdateFound)
      if (registration.waiting && hadController) setIsUpdateAvailable(true)
      void registration.update().catch((error) => {
        console.debug('[PWA] Service worker update check skipped:', error)
      })
    })

    return () => {
      cancelled = true
      installingWorker?.removeEventListener('statechange', handleWorkerStateChange)
      registration?.removeEventListener('updatefound', handleUpdateFound)
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
    localStorage.setItem('pwa_banner_dismissed', 'true')
  }

  const shouldShowBanner = showBanner && isInstallable && !isInstalled && !bannerDismissed

  return (
    <PWAContext value={{
      isInstallable,
      isInstalled,
      isUpdateAvailable,
      isRefreshing,
      install,
      checkForUpdate,
      refreshApp,
    }}>
      {children}

      {isUpdateAvailable && (
        <button
          type="button"
          onClick={refreshApp}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Updating application' : 'Update application to the latest version'}
          aria-live="polite"
          className="fixed right-3 z-[60] flex min-h-11 items-center gap-2 rounded-full border border-primary/30 bg-card/95 px-4 py-2 text-sm font-semibold text-foreground shadow-xl backdrop-blur-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75 md:hidden motion-reduce:transition-none"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
          />
          <span>{isRefreshing ? 'Updating…' : 'Update available'}</span>
        </button>
      )}

      {shouldShowBanner && (
        <div
          className="fixed bottom-4 left-1/2 z-[9999] flex min-w-[280px] max-w-[360px] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192-maskable.png"
            alt={`${BRAND_CONFIG.name} icon`}
            className="h-10 w-10 flex-shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-white">
              Install {BRAND_CONFIG.name}
            </p>
            <p className="mt-0.5 text-xs leading-tight text-slate-400">
              Add to your home screen for quick access
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              onClick={install}
              className="h-8 rounded-xl px-3 text-xs font-semibold text-slate-950"
              style={{ backgroundColor: '#84CC16' }}
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
    </PWAContext>
  )
}
