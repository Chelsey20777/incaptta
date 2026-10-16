'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { DEFAULT_ROLE_PERMISSIONS, ModuleKey, PermissionsConfig } from '@/constants/modules'

interface PermissionsState {
  config: PermissionsConfig | null
  loading: boolean
  load: () => Promise<void>
  saveRolePermissions: (role: string, modules: Record<ModuleKey, boolean>) => Promise<void>
  roleCanAccess: (role: string, moduleKey: string) => boolean
  getEffectivePermissions: (role: string) => Record<ModuleKey, boolean>
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  config: null,
  loading: true,
  load: async () => {
    try {
      const snap = await getDoc(doc(db, 'rolePermissions', 'config'))
      if (snap.exists()) {
        set({ config: snap.data() as PermissionsConfig })
      } else {
        set({ config: { ...DEFAULT_ROLE_PERMISSIONS } })
      }
    } catch (err) {
      console.error('[PermissionsStore] Failed to load role permissions:', err)
      set({ config: { ...DEFAULT_ROLE_PERMISSIONS } })
    } finally {
      set({ loading: false })
    }
  },
  saveRolePermissions: async (role, modules) => {
    try {
      await setDoc(
        doc(db, 'rolePermissions', 'config'),
        { [role]: modules, updatedAt: serverTimestamp() },
        { merge: true }
      )
      const currentConfig = get().config || { ...DEFAULT_ROLE_PERMISSIONS }
      set({ config: { ...currentConfig, [role]: { ...modules } } })
    } catch (err) {
      console.error('[PermissionsStore] Failed to save permissions:', err)
      throw err
    }
  },
  roleCanAccess: (role, moduleKey) => {
    const source = get().config ?? DEFAULT_ROLE_PERMISSIONS
    return source[role]?.[moduleKey as ModuleKey] === true
  },
  getEffectivePermissions: (role) => {
    const source = get().config ?? DEFAULT_ROLE_PERMISSIONS
    return source[role] ?? ({} as Record<ModuleKey, boolean>)
  }
}))
