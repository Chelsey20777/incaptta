'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading, isActiveUser } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthPage = pathname === '/login'

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
  }, [user, loading, pathname, router, isAuthPage, isActiveUser])

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
