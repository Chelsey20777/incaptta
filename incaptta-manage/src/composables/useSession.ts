import { ref, computed } from 'vue'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged, type User, getIdTokenResult } from 'firebase/auth'
import { type UserRole } from '@/constants/roles'

// Global shared state
export const user = ref<User | null>(null)
export const claims = ref<Record<string, any>>({})
export const loading = ref(true)

// Initialize listener once
onAuthStateChanged(auth, async (firebaseUser) => {
    user.value = firebaseUser
    if (firebaseUser) {
        try {
            // Get token result (cached if possible)
            let tokenResult = await getIdTokenResult(firebaseUser)
            claims.value = tokenResult.claims

            // If roles or isActive is missing, force a refresh once
            if (!claims.value.roles || claims.value.isActive === undefined) {
                console.log('[Session] Claims incomplete, forcing refresh...')
                tokenResult = await getIdTokenResult(firebaseUser, true)
                claims.value = tokenResult.claims
            }

            console.log('[Session] Initialized with claims:', {
                roles: claims.value.roles,
                isActive: claims.value.isActive
            })
        } catch (error) {
            console.error('[Session] Error getting token result:', error)
            claims.value = {}
        }
    } else {
        claims.value = {}
    }
    loading.value = false
})

export function useSession() {
    const roles = computed(() => {
        const r = claims.value.roles
        if (Array.isArray(r)) return r as UserRole[]
        if (typeof r === 'string') return [r] as UserRole[]
        return []
    })

    const isActive = computed(() => claims.value.isActive !== false)
    const isAuthenticated = computed(() => !!user.value)

    const isManagerOrAdmin = computed(() => {
        const r = roles.value
        return r.includes('MANAGER') || r.includes('ADMIN') || r.includes('SUPER_ADMIN')
    })

    const isSuperAdmin = computed(() => roles.value.includes('SUPER_ADMIN' as UserRole))

    function hasRole(role: UserRole) {
        if (isSuperAdmin.value) return true
        return roles.value.includes(role)
    }

    function hasAnyRole(roleList: UserRole[]) {
        if (isSuperAdmin.value) return true
        if (!roleList || roleList.length === 0) return true
        return roleList.some(role => roles.value.includes(role))
    }

    const refreshSession = async () => {
        if (!auth.currentUser) return
        loading.value = true
        try {
            const tokenResult = await getIdTokenResult(auth.currentUser, true)
            claims.value = tokenResult.claims
        } catch (error) {
            console.error('[Session] Failed to refresh token:', error)
        } finally {
            loading.value = false
        }
    }

    return {
        user,
        roles,
        claims,
        loading,
        isActive,
        isAuthenticated,
        isSuperAdmin,
        isManagerOrAdmin,
        hasRole,
        hasAnyRole,
        refreshSession
    }
}
