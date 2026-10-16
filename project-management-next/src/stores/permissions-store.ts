'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  DEFAULT_ROLE_PERMISSIONS,
  ModuleKey,
  PermissionsConfig,
  resolveRoleModules,
  unionRoleModules,
} from '@/constants/modules'

interface PermissionsState {
  config: PermissionsConfig | null
  loading: boolean
  load: () => Promise<void>
  saveRolePermissions: (role: string, modules: Record<ModuleKey, boolean>) => Promise<void>
  roleCanAccess: (role: string, moduleKey: string) => boolean
  canAccessModule: (roles: string[], moduleKey: string) => boolean
  getEffectivePermissions: (roles: string[]) => Record<ModuleKey, boolean>
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  config: null,
  loading: true,
  load: async () => {
    try {
      const snap = await getDoc(doc(db, 'rolePermissions', 'config'))
      const raw = snap.exists()
        ? (snap.data() as PermissionsConfig)
        : { ...DEFAULT_ROLE_PERMISSIONS }
      set({ config: raw })
    } catch (err) {
      console.error('[PermissionsStore] Failed to load role permissions:', err)
      set({ config: { ...DEFAULT_ROLE_PERMISSIONS } })
    } finally {
      set({ loading: false })
    }
  },
  saveRolePermissions: async (role, modules) => {
    try {
      if (role === 'STOREKEEPER') {
        modules = resolveRoleModules(role, { [role]: modules })
      }
      // Persist a full module map so future reads never treat missing keys as deny.
      // MBDI employee access is per-user; matrix value is informational.
      const complete = { ...resolveRoleModules(role, { [role]: modules }) }
      await setDoc(
        doc(db, 'rolePermissions', 'config'),
        { [role]: complete, updatedAt: serverTimestamp() },
        { merge: true }
      )
      const currentConfig = get().config || { ...DEFAULT_ROLE_PERMISSIONS }
      set({ config: { ...currentConfig, [role]: complete } })
    } catch (err) {
      console.error('[PermissionsStore] Failed to save permissions:', err)
      throw err
    }
  },
  roleCanAccess: (role, moduleKey) => {
    return resolveRoleModules(role, get().config)[moduleKey as ModuleKey] === true
  },
  canAccessModule: (roles, moduleKey) => {
    // Additive: access if ANY assigned role grants the module.
    // For MBDI, prefer `canAccessMbdi` (approver bypass + per-user grant).
    return unionRoleModules(roles, get().config)[moduleKey as ModuleKey] === true
  },
  getEffectivePermissions: (roles) => {
    return unionRoleModules(roles, get().config)
  }
}))
