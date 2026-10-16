'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'

interface AppSettings {
  logoUrl?: string
  logoDataUrl?: string
  sealUrl?: string
  sealDataUrl?: string
  managerSignatureUrl?: string
  managerSignatureDataUrl?: string
  sealUrl2?: string
  sealUrl2DataUrl?: string
  uiColors?: Record<string, string>
  [key: string]: unknown
}

interface AdminState {
  appSettings: AppSettings
  loading: boolean
  error: string | null
  fetchSettings: (uid: string) => () => void
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>
}

export const useAdminStore = create<AdminState>((set) => ({
  appSettings: { logoUrl: '' },
  loading: false,
  error: null,
  fetchSettings: (uid) => {
    if (!uid) return () => {}
    return onSnapshot(doc(db, 'appSettings', 'general'), 
      (snap) => {
        if (snap.exists()) {
          set({ appSettings: { id: snap.id, ...snap.data() } })
        }
      },
      (err) => {
        console.error('[AdminStore] Fetch Settings failed:', err)
        set({ error: err.message })
      }
    )
  },
  saveSettings: async (settings) => {
    set({ loading: true })
    try {
      await setDoc(doc(db, 'appSettings', 'general'), {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true })
    } catch (err: any) {
      console.error('[AdminStore] Save Settings failed:', err)
      set({ error: err.message })
      throw err
    } finally {
      set({ loading: false })
    }
  }
}))
