import { MBDI_APPROVER_ROLES } from '@/features/mbdi/types'

export type MbdiAccessUser = {
  modules?: {
    mbdi?: boolean
  } | null
} | null | undefined

/** Approver roles always bypass the per-user MBDI grant. */
export function isMbdiApproverRole(roles: string[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false
  if (roles.includes('SUPER_ADMIN')) return true
  return MBDI_APPROVER_ROLES.some((r) => roles.includes(r))
}

/**
 * MBDI module access:
 * - Approvers (SUPER_ADMIN | ADMIN | MANAGER | DIRECTOR) always allowed
 * - Everyone else needs users/{uid}.modules.mbdi === true
 */
export function canAccessMbdi(
  user: MbdiAccessUser,
  roles: string[] | null | undefined
): boolean {
  if (isMbdiApproverRole(roles)) return true
  return user?.modules?.mbdi === true
}
