import type { User } from 'firebase/auth'

export interface MbdiOwnerUser {
  uid: string
  email?: string | null
  /** Linked HR employee doc id from users/{uid}.employeeId */
  employeeId?: string | null
}

/** Shared ownership check for MBDI register + detail. */
export function isMbdiInitiativeOwner(
  initiative: { ownerId?: string | null; ownerEmail?: string | null } | null | undefined,
  user: MbdiOwnerUser | Pick<User, 'uid' | 'email'> | { uid: string; email?: string | null } | null | undefined,
  extras?: { employeeId?: string | null }
): boolean {
  if (!initiative || !user?.uid) return false

  // 1. Direct auth uid match
  if (initiative.ownerId && initiative.ownerId === user.uid) return true

  // 2. Auth email matches stored owner email
  const email = user.email?.trim().toLowerCase()
  if (email && (initiative.ownerEmail || '').trim().toLowerCase() === email) return true

  // 3. Current user's linked HR employee id equals initiative.ownerId
  //    (covers initiatives created when ownerId was the employee doc id)
  const employeeId =
    extras?.employeeId ??
    ('employeeId' in user ? (user as MbdiOwnerUser).employeeId : null)
  if (
    employeeId &&
    initiative.ownerId &&
    employeeId === initiative.ownerId
  ) {
    return true
  }

  return false
}
