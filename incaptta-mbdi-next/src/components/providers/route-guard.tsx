'use client'

import { useAuthStore } from '@/stores/auth-store'
import { canAccessMbdi } from '@/features/mbdi/utils/access'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading, profile, profileLoading, getRoles, isActiveUser } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthPage = pathname === '/login'
  const isAccessDeniedPage = pathname === '/access-denied'

  useEffect(() => {
    if (loading) return

    // 1. Unauthenticated → login
    if (!user) {
      if (!isAuthPage) {
        router.push('/login')
      }
      return
    }

    // 2. Authenticated but inactive → login
    if (!isActiveUser()) {
      if (!isAuthPage) {
        router.push('/login')
      }
      return
    }

    // 3. Logged in on /login → home
    if (isAuthPage) {
      router.push('/')
      return
    }

    // 4. Wait for users/{uid} profile before MBDI gate
    if (profileLoading) return

    const roles = getRoles()
    const allowed = canAccessMbdi(profile, roles)

    if (!allowed && !isAccessDeniedPage) {
      router.replace('/access-denied')
      return
    }

    if (allowed && isAccessDeniedPage) {
      router.replace('/')
    }
  }, [
    user,
    loading,
    profile,
    profileLoading,
    pathname,
    router,
    isAuthPage,
    isAccessDeniedPage,
    isActiveUser,
    getRoles,
  ])

  if (loading || (user && isActiveUser() && profileLoading && !isAuthPage)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!user && !isAuthPage) {
    return null
  }

  return <>{children}</>
}
