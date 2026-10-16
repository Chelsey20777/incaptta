import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserRole } from '@/types'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged, signOut, getIdTokenResult, type User as FirebaseUser } from 'firebase/auth'

export const useAuthStore = defineStore('auth', () => {
  const firebaseUser = ref<FirebaseUser | null>(null)
  const claims = ref<Record<string, any>>({})
  const loading = ref(true)

  // Initialize Auth Listener
  onAuthStateChanged(auth, async (user) => {
    firebaseUser.value = user
    if (user) {
      try {
        const tokenResult = await getIdTokenResult(user)
        claims.value = tokenResult.claims
      } catch (error) {
        console.error('[AuthStore] Error getting claims:', error)
        claims.value = {}
      }
    } else {
      claims.value = {}
    }
    loading.value = false
  })

  const isAuthenticated = computed(() => !!firebaseUser.value)
  const userRoles = computed(() => {
    const r = claims.value.roles
    if (Array.isArray(r)) return r as UserRole[]
    if (typeof r === 'string') return [r] as UserRole[]
    return []
  })
  const userId = computed(() => firebaseUser.value?.uid || '')
  const userEmail = computed(() => firebaseUser.value?.email || '')
  const displayName = computed(() => firebaseUser.value?.displayName || '')
  const isActive = computed(() => claims.value.isActive !== false)

  const logout = async () => {
    loading.value = true
    try {
      await signOut(auth)
      firebaseUser.value = null
      claims.value = {}
    } catch (error) {
      console.error('[AuthStore] Logout error:', error)
    } finally {
      loading.value = false
    }
  }

  const hasRole = (role: UserRole): boolean => {
    if (userRoles.value.includes('SUPER_ADMIN' as UserRole)) return true
    return userRoles.value.includes(role)
  }

  const hasAnyRole = (roles: UserRole[]): boolean => {
    if (userRoles.value.includes('SUPER_ADMIN' as UserRole)) return true
    return roles.some(role => hasRole(role))
  }

  return {
    firebaseUser,
    claims,
    loading,
    isAuthenticated,
    userRoles,
    userId,
    userEmail,
    displayName,
    isActive,
    logout,
    hasRole,
    hasAnyRole
  }
})
