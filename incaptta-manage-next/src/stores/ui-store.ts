'use client'

import { create } from 'zustand'

interface UIState {
  sidebarMode: 'expanded' | 'collapsed'
  isCollapsed: boolean
  toggleSidebar: () => void
  initializeSidebar: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarMode: 'expanded',
  isCollapsed: false,
  toggleSidebar: () => {
    const newMode = get().sidebarMode === 'expanded' ? 'collapsed' : 'expanded'
    localStorage.setItem('sidebarMode', newMode)
    set({ sidebarMode: newMode, isCollapsed: newMode === 'collapsed' })
  },
  initializeSidebar: () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebarMode') as 'expanded' | 'collapsed' || 'expanded'
      set({ sidebarMode: stored, isCollapsed: stored === 'collapsed' })
    }
  }
}))
