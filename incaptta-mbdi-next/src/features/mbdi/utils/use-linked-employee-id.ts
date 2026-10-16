'use client'

import { useAuthStore } from '@/stores/auth-store'

/**
 * Linked HR employee id from users/{uid}.employeeId.
 * Prefer the live auth profile subscription when available.
 */
export function useMbdiLinkedEmployeeId(): string | null {
  const { user, profile, profileLoading } = useAuthStore()
  if (!user?.uid) return null
  if (profileLoading && profile === null) return null
  return profile?.employeeId ?? null
}
