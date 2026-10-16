import React from 'react'
import { BRAND_CONFIG } from '@/config/branding'

export function BrandLogo() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground font-black text-xs">
      {BRAND_CONFIG.logoText}
    </div>
  )
}
