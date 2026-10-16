import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { DEFAULT_ROLE_PERMISSIONS, type ModuleKey } from '@/constants/modules'

const COLLECTION = 'rolePermissions'
const DOC_ID = 'config'

export type PermissionsConfig = Record<string, Record<ModuleKey, boolean>>

export const usePermissionsStore = defineStore('permissions', () => {
    // null = not loaded yet, undefined = loaded but no custom config in Firestore (use defaults)
    const config = ref<PermissionsConfig | null>(null)
    const loading = ref(true)

    async function load() {
        try {
            const snap = await getDoc(doc(db, COLLECTION, DOC_ID))
            if (snap.exists()) {
                config.value = snap.data() as PermissionsConfig
            } else {
                // No custom config — signal to router to use defaults
                config.value = { ...DEFAULT_ROLE_PERMISSIONS }
            }
        } catch (err) {
            console.error('[PermissionsStore] Failed to load role permissions:', err)
            // Fall back to defaults on error so the app remains usable
            config.value = { ...DEFAULT_ROLE_PERMISSIONS }
        } finally {
            loading.value = false
        }
    }

    /**
     * Save the full permissions for one role to Firestore.
     * Merges into the existing config document so other roles are unaffected.
     */
    async function saveRolePermissions(role: string, modules: Record<ModuleKey, boolean>) {
        try {
            await setDoc(
                doc(db, COLLECTION, DOC_ID),
                { [role]: modules, updatedAt: serverTimestamp() },
                { merge: true }
            )
            // Update local cache
            if (!config.value) config.value = { ...DEFAULT_ROLE_PERMISSIONS }
            config.value[role] = { ...modules }
            toast.success(`Permissions saved for ${role}`)
        } catch (err: any) {
            console.error('[PermissionsStore] Failed to save permissions:', err)
            toast.error('Failed to save permissions', { description: err.message })
            throw err
        }
    }

    /**
     * Returns true if the given role is allowed to access the given module.
     * Uses loaded Firestore config; falls back to DEFAULT_ROLE_PERMISSIONS.
     */
    function roleCanAccess(role: string, moduleKey: string): boolean {
        const source = config.value ?? DEFAULT_ROLE_PERMISSIONS
        return source[role]?.[moduleKey as ModuleKey] === true
    }

    /**
     * Returns the effective permissions for a role (config or defaults).
     */
    function getEffectivePermissions(role: string): Record<ModuleKey, boolean> {
        const source = config.value ?? DEFAULT_ROLE_PERMISSIONS
        return source[role] ?? ({} as Record<ModuleKey, boolean>)
    }

    return {
        config,
        loading,
        load,
        saveRolePermissions,
        roleCanAccess,
        getEffectivePermissions,
    }
})
