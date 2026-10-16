'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

// Define modules corresponding to each path prefix
const ROUTE_MODULES: Record<string, string> = {
  '/job-cards': 'jobCards',
  '/commissions': 'commissions',
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
  '/container-access': 'containerAccess'
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading, getRoles, isActiveUser } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthPage = pathname === '/login' || pathname.startsWith('/verify/')

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

    // 4. Role-based module access check
    const matchedPrefix = Object.keys(ROUTE_MODULES).find(prefix => pathname.startsWith(prefix))
    if (matchedPrefix) {
      const moduleKey = ROUTE_MODULES[matchedPrefix]
      const roles = getRoles()
      const isSuperAdmin = roles.includes('SUPER_ADMIN')
      
      if (!isSuperAdmin) {
        // We will wire this up fully with permission store checking once layouts are created.
      }
    }
  }, [user, loading, pathname, router, isAuthPage, isActiveUser, getRoles])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Hide page content for unauthenticated users (unless on login page)
  if (!user && !isAuthPage) {
    return null
  }

  return <>{children}</>
}
