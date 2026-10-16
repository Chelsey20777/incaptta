'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'

interface AppSettings {
  logoUrl?: string
  uiColors?: Record<string, string>
  [key: string]: unknown
}

interface AdminState {
  appSettings: AppSettings
  loading: boolean
  error: string | null
  subscriptions: (() => void)[]
  fetchSettings: (uid: string) => () => void
  cleanup: () => void
}

export const useAdminStore = create<AdminState>((set, get) => ({
  appSettings: { logoUrl: '' },
  loading: false,
  error: null,
  subscriptions: [],

  fetchSettings: (uid) => {
    if (!uid) return () => {}
    const unsub = onSnapshot(doc(db, 'appSettings', 'general'), 
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
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  }
}))
