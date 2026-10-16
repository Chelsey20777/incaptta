'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore'
import { poultryApi } from '@/features/poultry/api/poultryApi'
import type {
  PoultryFlock,
  PoultryInventoryItem,
  PoultryDailyLog,
  PoultrySale,
} from '@/features/poultry/types'

// Re-export types for convenience
export type { PoultryFlock, PoultryInventoryItem, PoultryDailyLog, PoultrySale }

interface PoultryState {
  flocks: PoultryFlock[]
  inventory: PoultryInventoryItem[]
  currentLogs: PoultryDailyLog[]
  currentSales: PoultrySale[]
  isLoading: boolean
  error: string | null
  activeFlocks: () => PoultryFlock[]
  closedFlocks: () => PoultryFlock[]
  fetchFlocks: () => void
  fetchInventory: () => Promise<void>
  fetchFlockDetails: (flockId: string) => Promise<void>
  cleanupListeners: () => void
}

let flocksUnsub: Unsubscribe | null = null

export const usePoultryStore = create<PoultryState>((set, get) => ({
  flocks: [],
  inventory: [],
  currentLogs: [],
  currentSales: [],
  isLoading: false,
  error: null,

  activeFlocks: () =>
    get().flocks.filter(f => f.status === 'ACTIVE' || f.status === 'ON_MARKET'),

  closedFlocks: () =>
    get().flocks.filter(f => f.status === 'CLOSED'),

  cleanupListeners: () => {
    if (flocksUnsub) {
      flocksUnsub()
      flocksUnsub = null
    }
  },

  fetchFlocks: () => {
    if (flocksUnsub) {
      flocksUnsub()
      flocksUnsub = null
    }
    set({ isLoading: true })
    const q = query(
      collection(db, 'poultryFlocks'),
      orderBy('createdAt', 'desc'),
    )
    flocksUnsub = onSnapshot(
      q,
      (snapshot) => {
        set({
          flocks: snapshot.docs.map(
            doc => ({ id: doc.id, ...doc.data() } as PoultryFlock),
          ),
          isLoading: false,
        })
      },
      (err) => {
        console.error('Error fetching flocks:', err)
        set({ isLoading: false, error: err.message })
      },
    )
  },

  fetchInventory: async () => {
    set({ isLoading: true })
    try {
      const items = await poultryApi.getInventory()
      set({ inventory: items })
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchFlockDetails: async (flockId: string) => {
    set({ isLoading: true })
    try {
      const [logs, sales] = await Promise.all([
        poultryApi.getLogsByFlock(flockId),
        poultryApi.getSalesByFlock(flockId),
      ])
      set({ currentLogs: logs, currentSales: sales })
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ isLoading: false })
    }
  },
}))
