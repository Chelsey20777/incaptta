'use client'

import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { db } from '@/lib/firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Image as ImageIcon, Check, Monitor, Sparkles } from 'lucide-react'

export function BackgroundPicker() {
  const { user } = useAuthStore()
  const { appSettings } = useAdminStore()
  const [selectedUrl, setSelectedUrl] = useState<string>('')
  const [open, setOpen] = useState(false)

  const storageKey = `incaptta_bg_url_${user?.uid || 'global'}`

  // 1. Read initial value from localStorage or Firestore
  useEffect(() => {
    if (typeof window === 'undefined') return

    const localVal = localStorage.getItem(storageKey)
    if (localVal !== null) {
      setSelectedUrl(localVal)
    } else if (user?.uid) {
      // Try fetching from Firestore user preferences in background
      getDoc(doc(db, 'userPreferences', user.uid)).then(snap => {
        if (snap.exists() && snap.data().selectedBackgroundUrl !== undefined) {
          const bgUrl = snap.data().selectedBackgroundUrl
          setSelectedUrl(bgUrl)
          localStorage.setItem(storageKey, bgUrl)
          window.dispatchEvent(new Event('bg-changed'))
        }
      }).catch(() => {})
    }

    const handleBgChange = () => {
      const val = localStorage.getItem(storageKey)
      if (val !== null) setSelectedUrl(val)
    }

    window.addEventListener('bg-changed', handleBgChange)
    return () => window.removeEventListener('bg-changed', handleBgChange)
  }, [user?.uid, storageKey])

  // 2. Handle selection
  const handleSelect = async (url: string) => {
    setSelectedUrl(url)
    if (url === '') {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, url)
    }

    // Notify app-layout instantly
    window.dispatchEvent(new Event('bg-changed'))

    // Save to Firestore for cross-device sync
    if (user?.uid) {
      try {
        await setDoc(doc(db, 'userPreferences', user.uid), {
          selectedBackgroundUrl: url,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      } catch (e) {
        console.error('Failed to sync background preference to cloud:', e)
      }
    }
  }

  // Combine backgroundImages array and legacy backgroundImageUrl
  const images: { url: string; name: string }[] = []
  if (appSettings?.backgroundImages && Array.isArray(appSettings.backgroundImages)) {
    images.push(...appSettings.backgroundImages)
  }
  // If legacy backgroundImageUrl exists and isn't in backgroundImages, add it
  if (appSettings?.backgroundImageUrl && !images.some(i => i.url === appSettings.backgroundImageUrl)) {
    images.push({ url: appSettings.backgroundImageUrl, name: 'Default Background' })
  }

  const defaultAdminUrl = appSettings?.defaultBackgroundUrl || appSettings?.backgroundImageUrl || ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Choose Workspace Background"
            className="size-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg flex items-center justify-center transition-all"
          />
        }
      >
        <ImageIcon className="size-5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-3 shadow-xl border-border/80">
        <div className="space-y-1 mb-3">
          <h4 className="font-semibold text-sm leading-none flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            Workspace Wallpaper
          </h4>
          <p className="text-xs text-muted-foreground">
            Choose a background image for your personal workspace.
          </p>
        </div>

        <ScrollArea className="max-h-[300px] -mr-1 pr-1">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Admin Default / None Card */}
            <div
              onClick={() => handleSelect('')}
              className={`group relative h-20 rounded-md border cursor-pointer overflow-hidden transition-all flex flex-col items-center justify-center p-2 text-center select-none ${
                selectedUrl === '' 
                  ? 'ring-2 ring-primary border-primary bg-primary/10' 
                  : 'bg-muted/40 hover:bg-muted border-border/60 hover:border-border'
              }`}
            >
              {defaultAdminUrl ? (
                <>
                  <div className="absolute inset-0 opacity-40">
                    <img src={defaultAdminUrl} alt="Default" className="w-full h-full object-cover" />
                  </div>
                  <div className="relative z-10 font-medium text-xs text-foreground bg-background/80 px-2 py-1 rounded shadow-sm backdrop-blur-xs flex items-center gap-1">
                    <Monitor className="size-3 text-primary" />
                    Admin Default
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium text-xs text-foreground flex items-center gap-1.5">
                    <Monitor className="size-3.5 text-muted-foreground" />
                    No Background
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Solid dark theme</span>
                </>
              )}
              {selectedUrl === '' && (
                <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                  <Check className="size-3 stroke-[3]" />
                </div>
              )}
            </div>

            {/* Uploaded Images Grid */}
            {images.map((img, idx) => {
              const isSelected = selectedUrl === img.url
              return (
                <div
                  key={img.url || idx}
                  onClick={() => handleSelect(img.url)}
                  className={`group relative h-20 rounded-md border cursor-pointer overflow-hidden transition-all bg-black/40 select-none ${
                    isSelected 
                      ? 'ring-2 ring-primary border-primary shadow-md scale-[1.02]' 
                      : 'border-border/60 hover:border-foreground/50 hover:opacity-95 opacity-80'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Wallpaper'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <span className="text-[11px] font-medium text-white truncate w-full drop-shadow">
                      {img.name || `Background ${idx + 1}`}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {images.length === 0 && !defaultAdminUrl && (
          <div className="py-4 text-center border border-dashed rounded-md mt-2 bg-muted/20">
            <p className="text-xs text-muted-foreground">
              No backgrounds uploaded yet.<br />
              An admin can add wallpapers in Admin Settings.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
