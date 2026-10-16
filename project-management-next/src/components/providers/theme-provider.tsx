'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeProviderState>({
  theme: 'system',
  setTheme: () => null,
})

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'incaptta-theme',
  forcedTheme,
}: {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  /** When set (e.g. staging SaaS trial), lock theme and ignore localStorage. */
  forcedTheme?: Theme
}) {
  const [theme, setTheme] = useState<Theme>(forcedTheme || defaultTheme)

  useEffect(() => {
    if (forcedTheme) {
      setTheme(forcedTheme)
      return
    }
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored) setTheme(stored)
  }, [storageKey, forcedTheme])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    const applied = forcedTheme || theme
    if (applied === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(applied)
    }
  }, [theme, forcedTheme])

  const value = {
    theme: forcedTheme || theme,
    setTheme: (newTheme: Theme) => {
      if (forcedTheme) return
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
  }

  return (
    <ThemeContext value={value}>
      {children}
    </ThemeContext>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
