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

/** Firestore `users/{uid}` fields needed for module gates / ownership. */
export interface AuthUserProfile {
  modules?: {
    mbdi?: boolean
  }
  employeeId?: string | null
  email?: string
  name?: string
}

interface AuthState {
  user: User | null
  claims: AuthClaims
  profile: AuthUserProfile | null
  profileLoading: boolean
  loading: boolean
  setUser: (user: User | null) => void
  setClaims: (claims: AuthClaims) => void
  setProfile: (profile: AuthUserProfile | null) => void
  setProfileLoading: (loading: boolean) => void
  setLoading: (loading: boolean) => void
  reset: () => void

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
  profile: null,
  profileLoading: false,
  loading: true,
  setUser: (user) => set({ user }),
  setClaims: (claims) => set({ claims }),
  setProfile: (profile) => set({ profile }),
  setProfileLoading: (profileLoading) => set({ profileLoading }),
  setLoading: (loading) => set({ loading }),
  reset: () =>
    set({ user: null, claims: {}, profile: null, profileLoading: false, loading: false }),

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
    return roleList.some((role) => get().getRoles().includes(role))
  },
}))
