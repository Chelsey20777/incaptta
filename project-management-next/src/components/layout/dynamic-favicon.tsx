'use client'

import { useEffect } from 'react'
import { useAdminStore } from '@/stores/admin-store'
import { BRAND_CONFIG } from '@/config/branding'

export function DynamicFavicon() {
  const { appSettings } = useAdminStore()
  
  // Choose favicon source:
  // 1. Database-uploaded base64 Data URL (instant preview)
  // 2. Database-uploaded URL (logo image)
  // 3. Environment variable fallback (NEXT_PUBLIC_FAVICON_URL)
  // 4. Fallback local /icon.png
  const faviconUrl = appSettings?.faviconDataUrl || appSettings?.faviconUrl || appSettings?.logoDataUrl || appSettings?.logoUrl || BRAND_CONFIG.defaultFavicon || '/icon.png'

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Find all existing shortcut icon or standard icon link tags
    const links: HTMLLinkElement[] = Array.from(document.querySelectorAll("link[rel*='icon']"))
    
    if (links.length > 0) {
      // Update all existing link tags to point to the new icon URL
      links.forEach((link) => {
        link.href = faviconUrl
      })
    } else {
      // If no link tag exists, create a new one and append to head
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = faviconUrl
      document.getElementsByTagName('head')[0].appendChild(link)
    }
  }, [faviconUrl])

  return null
}
