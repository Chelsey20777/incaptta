'use client'

import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { canAccessMbdi } from '@/features/mbdi/utils/access'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppBootLoader } from '@/components/layout/app-boot-loader'

// Define modules corresponding to each path prefix
const ROUTE_MODULES: Record<string, string> = {
  '/inventory/fulfilment': 'pmo',
  '/job-cards': 'jobCards',
  '/subcontractors': 'subcontractors',
  '/commissions': 'commissions',
  '/mbdi': 'mbdi',
  '/opex': 'opex',
  '/finance': 'finance',
  '/inventory': 'inventory',
  '/procurement': 'procurement',
  '/crm': 'crm',
  '/tasks': 'tasks',
  '/hr': 'hr',
  '/analytics': 'analytics',
  '/support': 'support',
  '/admin': 'admin',
  '/container-access': 'containerAccess',
  '/dashboard': 'dashboard',
  '/accounting': 'finance',
  '/ledger': 'finance',
  '/transfers': 'finance',
  '/business-loans': 'finance',
  '/payment-submissions': 'finance',
  '/bom-templates': 'jobCards',
  '/agric-structures': 'agricStructures',
  '/projects': 'agricStructures',
  '/poultry': 'poultry',
  '/equipment-hire': 'tools',
  '/settings-unlock': 'admin'
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading, profile, profileLoading, getRoles, isActiveUser } = useAuthStore()
  const { loading: permLoading, load: loadPermissions, canAccessModule } = usePermissionsStore()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/verify/')

  // Ensure the role-permissions matrix is loaded so module access can be enforced.
  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  useEffect(() => {
    if (loading) return

    // 1. Unauthenticated users redirected to login
    if (!user) {
      if (!isAuthPage) {
        router.push('/login')
      }
      return
    }

    // 2. Authenticated but deactivated accounts redirected to login
    if (!isActiveUser()) {
      if (!isAuthPage) {
        router.push('/login')
      }
      return
    }

    // 3. User is logged in, redirect them away from login page to dashboard
    if (isAuthPage) {
      router.push('/')
      return
    }

    // 4. Module access check driven by the role-permissions matrix.
    // Wait until the matrix has loaded so we don't redirect on stale defaults.
    // For MBDI, also wait for users/{uid} profile (modules.mbdi).
    if (permLoading) return
    if (pathname.startsWith('/mbdi') && profileLoading) return

    const roles = getRoles()
    const matchedPrefix = Object.keys(ROUTE_MODULES)
      .sort((a, b) => b.length - a.length)
      .find(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    const canAccessPmo = canAccessModule(roles, 'pmo')
    const canAccessDashboard = canAccessModule(roles, 'dashboard')
    if (pathname === '/' && canAccessPmo && !canAccessDashboard) {
      router.replace('/inventory/fulfilment')
      return
    }
    if (matchedPrefix) {
      const moduleKey = ROUTE_MODULES[matchedPrefix]

      const allowed =
        moduleKey === 'mbdi'
          ? canAccessMbdi(profile, roles)
          : canAccessModule(roles, moduleKey)

      if (!allowed) {
        router.replace('/')
        return
      }
    }
  }, [
    user,
    loading,
    permLoading,
    profile,
    profileLoading,
    pathname,
    router,
    isAuthPage,
    isActiveUser,
    getRoles,
    canAccessModule,
  ])

  if (loading) {
    return <AppBootLoader />
  }

  // Hide page content for unauthenticated users (unless on login page)
  if (!user && !isAuthPage) {
    return <AppBootLoader />
  }

  return <>{children}</>
}
