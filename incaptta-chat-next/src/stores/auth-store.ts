'use client'

import { create } from 'zustand'
import { User } from 'firebase/auth'
import { UserRole } from '@/constants/roles'

interface AuthClaims {
  roles?: string | string[]
  isActive?: boolean
  company?: string
  [key: string]: unknown
}

interface AuthState {
  user: User | null
  claims: AuthClaims
  loading: boolean
  setUser: (user: User | null) => void
  setClaims: (claims: AuthClaims) => void
  setLoading: (loading: boolean) => void
  reset: () => void
  
  // Computed helpers/actions
  getRoles: () => UserRole[]
  isActiveUser: () => boolean
  isAuthenticated: () => boolean
  isSuperAdmin: () => boolean
  hasRole: (role: UserRole) => boolean
  hasAnyRole: (roleList: UserRole[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  claims: {},
  loading: true,
  setUser: (user) => set({ user }),
  setClaims: (claims) => set({ claims }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ user: null, claims: {}, loading: false }),
  
  getRoles: () => {
    const r = get().claims.roles
    if (Array.isArray(r)) return r as UserRole[]
    if (typeof r === 'string') return [r] as UserRole[]
    return []
  },
  isActiveUser: () => get().claims.isActive === true,
  isAuthenticated: () => !!get().user,
  isSuperAdmin: () => get().getRoles().includes('SUPER_ADMIN'),
  hasRole: (role) => {
    if (get().isSuperAdmin()) return true
    return get().getRoles().includes(role)
  },
  hasAnyRole: (roleList) => {
    if (get().isSuperAdmin()) return true
    if (!roleList || roleList.length === 0) return true
    return roleList.some(role => get().getRoles().includes(role))
  }
}))
