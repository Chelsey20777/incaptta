'use client'

import { BRAND_CONFIG } from '@/config/branding'
import { useAdminStore } from '@/stores/admin-store'
import { IncapttaLoaderMark } from '@/components/layout/incaptta-loader-mark'

/**
 * Full-screen branded boot screen shown while auth (and shell) resolve.
 * Uses an opaque solid so the app chrome/wallpaper never flash underneath.
 */
export function AppBootLoader() {
  const { appSettings } = useAdminStore()
  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'
  const brandSecondary = appSettings?.uiColors?.brandSecondaryColor || '#ff8903'

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-[var(--bg-solid)]"
      role="status"
      aria-live="polite"
      aria-label="Loading application"
    >
      <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex size-20 items-center justify-center overflow-visible">
          <IncapttaLoaderMark className="size-20" />
        </div>

        <div className="text-center select-none">
          <p className="text-xl font-bold tracking-tight uppercase">
            <span style={{ color: brandColor }}>{BRAND_CONFIG.name}</span>
            {BRAND_CONFIG.tagline ? (
              <span style={{ color: brandSecondary }}> {BRAND_CONFIG.tagline}</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    </div>
  )
}
