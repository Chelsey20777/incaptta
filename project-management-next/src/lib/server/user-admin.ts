export const ALLOWED_USER_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'STOREKEEPER',
  'TECHNICAL',
  'SALES',
  'DIRECTOR',
  'POULTRY_MANAGER',
  'FARM_HAND',
  'MBDI_STAFF',
] as const

const ALLOWED = new Set<string>(ALLOWED_USER_ROLES)

export class UserAdminError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class UserAdminOperationError extends Error {
  readonly operation: string
  readonly code: string | null

  constructor(operation: string, cause: unknown) {
    const err = cause as { code?: unknown; message?: unknown }
    super(`User invitation failed during ${operation}.`)
    this.name = 'UserAdminOperationError'
    this.operation = operation
    this.code = typeof err?.code === 'string' ? err.code : null
    this.cause = cause
  }
}

/** Keep known roles once each. Unknown values are dropped and never replaced with Technical. */
export function sanitizeUserRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const roles: string[] = []
  for (const role of input) {
    if (typeof role !== 'string') continue
    const trimmed = role.trim()
    if (!ALLOWED.has(trimmed) || roles.includes(trimmed)) continue
    roles.push(trimmed)
  }
  return roles
}

export function assertAssignableRoles(requested: unknown, performerRoles: string[]): string[] {
  const roles = sanitizeUserRoles(requested)
  if (roles.length === 0) {
    throw new UserAdminError('At least one valid role is required.', 400)
  }
  if (roles.includes('SUPER_ADMIN') && !performerRoles.includes('SUPER_ADMIN')) {
    throw new UserAdminError('Unauthorized: Only a Super Admin can assign the SUPER_ADMIN role.', 403)
  }
  return roles
}

export function assertRoleUpdate(
  requested: unknown,
  performerRoles: string[],
  previousRoles: string[],
): string[] {
  const roles = sanitizeUserRoles(requested)
  if (roles.length === 0) {
    throw new UserAdminError('At least one valid role is required.', 400)
  }
  const hadSuperAdmin = previousRoles.includes('SUPER_ADMIN')
  const willHaveSuperAdmin = roles.includes('SUPER_ADMIN')
  if (hadSuperAdmin !== willHaveSuperAdmin && !performerRoles.includes('SUPER_ADMIN')) {
    throw new UserAdminError(
      'Unauthorized: Only a Super Admin can assign or revoke the SUPER_ADMIN role.',
      403,
    )
  }
  return roles
}

export function mapAuthError(err: { code?: string; message?: string; errorInfo?: { code?: string } }): {
  message: string
  status: number
} {
  const code = err.code || err.errorInfo?.code || ''
  if (code === 'auth/email-already-exists') {
    return { message: 'Email already exists.', status: 409 }
  }
  if (code === 'auth/invalid-password' || code === 'auth/weak-password') {
    return { message: 'The password must be at least 6 characters long.', status: 400 }
  }
  if (code === 'auth/invalid-email') {
    return { message: 'The email address is badly formatted.', status: 400 }
  }
  return { message: err.message || 'Internal Server Error', status: 500 }
}
