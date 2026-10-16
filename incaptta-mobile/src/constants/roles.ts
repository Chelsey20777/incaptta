import type { UserRole } from '@/types'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 90,
  DIRECTOR: 80,
  MANAGER: 70,
  ACCOUNTANT: 60,
  SALES: 50,
  TECHNICAL: 40,
  STOREKEEPER: 30
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DIRECTOR: 'Director',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant',
  SALES: 'Sales',
  TECHNICAL: 'Technical',
  STOREKEEPER: 'Storekeeper'
}

export function hasHigherRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function hasAnyRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
  return requiredRoles.some(role => userRoles.includes(role))
}
