'use client'

import { create } from 'zustand'

interface UIState {
  /** 'expanded' = pinned open; 'collapsed' = auto-hide icon rail */
  sidebarMode: 'expanded' | 'collapsed'
  isCollapsed: boolean
  /** Transient hover preview; not persisted */
  isSidebarHovered: boolean
  compactMode: boolean
  toggleSidebar: () => void
  setSidebarHovered: (hovered: boolean) => void
  toggleCompactMode: () => void
  initializeSidebar: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarMode: 'collapsed',
  isCollapsed: true,
  isSidebarHovered: false,
  compactMode: false,
  toggleSidebar: () => {
    const newMode = get().sidebarMode === 'expanded' ? 'collapsed' : 'expanded'
    localStorage.setItem('sidebarMode', newMode)
    set({
      sidebarMode: newMode,
      isCollapsed: newMode === 'collapsed',
      isSidebarHovered: false,
    })
  },
  setSidebarHovered: (hovered) => {
    // Only track hover while in auto (collapsed) mode
    if (!get().isCollapsed) {
      if (get().isSidebarHovered) set({ isSidebarHovered: false })
      return
    }
    set({ isSidebarHovered: hovered })
  },
  toggleCompactMode: () => {
    const nextMode = !get().compactMode
    localStorage.setItem('compactMode', String(nextMode))
    set({ compactMode: nextMode })
    if (typeof document !== 'undefined') {
      if (nextMode) {
        document.documentElement.classList.add('compact-mode', 'compact')
      } else {
        document.documentElement.classList.remove('compact-mode', 'compact')
      }
    }
  },
  initializeSidebar: () => {
    if (typeof window !== 'undefined') {
      const stored = (localStorage.getItem('sidebarMode') as 'expanded' | 'collapsed' | null) || 'collapsed'
      const storedCompact = localStorage.getItem('compactMode') === 'true'
      set({
        sidebarMode: stored,
        isCollapsed: stored === 'collapsed',
        isSidebarHovered: false,
        compactMode: storedCompact,
      })
      if (typeof document !== 'undefined') {
        if (storedCompact) {
          document.documentElement.classList.add('compact-mode', 'compact')
        } else {
          document.documentElement.classList.remove('compact-mode', 'compact')
        }
      }
    }
  },
}))
