'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { canAccessMbdi } from '@/features/mbdi/utils/access'
import { BackgroundPicker } from '@/components/layout/BackgroundPicker'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { 
  Menu, 
  Bell, 
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Rocket,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BRAND_CONFIG } from '@/config/branding'
import Link from 'next/link'

interface TopBarProps {
  onOpenMobileMenu?: () => void
}

export function TopBar({ onOpenMobileMenu }: TopBarProps) {
  const { user, profile, getRoles } = useAuthStore()
  const { appSettings } = useAdminStore()
  const { loading: permLoading, load: loadPermissions } = usePermissionsStore()
  const { isCollapsed, toggleSidebar } = useUIStore()
  const pathname = usePathname()
  const [notificationStatus, setNotificationStatus] = useState('default')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadMbdi, setUnreadMbdi] = useState(0)

  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  const canOpenMbdi = canAccessMbdi(profile, getRoles())

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(window.Notification.permission)
    }
  }, [])

  // Live total of unread chat messages across all of the user's conversations
  useEffect(() => {
    const uid = user?.uid
    if (!uid) {
      setUnreadMessages(0)
      return
    }

    const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid))
    const unsub = onSnapshot(q, (snapshot) => {
      const total = snapshot.docs.reduce(
        (sum, d) => sum + Number(d.data().unreadCount?.[uid] || 0),
        0
      )
      setUnreadMessages(total)
    }, (err) => {
      console.error('Unread messages badge listener error:', err)
    })

    return unsub
  }, [user?.uid])

  // Live unread MBDI notifications for the Rocket shortcut badge
  useEffect(() => {
    const uid = user?.uid
    if (!uid || !canOpenMbdi) {
      setUnreadMbdi(0)
      return
    }

    const q = query(
      collection(db, 'mbdiNotifications'),
      where('userId', '==', uid),
      where('read', '==', false)
    )
    let prevCount = 0
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const count = snapshot.size
        // Browser toast when new unread arrives while the tab is hidden
        if (
          count > prevCount &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted' &&
          document.visibilityState === 'hidden'
        ) {
          const newest = snapshot.docs
            .map((d) => d.data())
            .sort((a, b) => {
              const at = a.createdAt?.toMillis?.() ?? 0
              const bt = b.createdAt?.toMillis?.() ?? 0
              return bt - at
            })[0]
          if (newest) {
            try {
              new window.Notification(newest.title || 'MBDI update', {
                body: newest.body || '',
                icon: '/favicon.ico',
              })
            } catch {
              // Notification API unavailable
            }
          }
        }
        prevCount = count
        setUnreadMbdi(count)
      },
      (err) => {
        console.error('Unread MBDI badge listener error:', err)
      }
    )

    return unsub
  }, [user?.uid, canOpenMbdi])

  const handleRequestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await window.Notification.requestPermission()
        setNotificationStatus(permission)
      } catch (err) {
        console.error('Failed to request notification permission:', err)
      }
    }
  }

  // Generate dynamic page title based on route prefix
  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard'
    if (pathname.startsWith('/job-cards')) return 'Job Cards'
    if (pathname.startsWith('/subcontractors/guide')) return 'Subcontractors Guide'
    if (pathname.startsWith('/subcontractors')) return 'Subcontractors'
    if (pathname.startsWith('/bom-templates')) return 'BOM Templates'
    if (pathname.startsWith('/crm')) return 'CRM & Leads'
    if (pathname.startsWith('/opex')) return 'Finance & OPEX'
    if (pathname.startsWith('/transfers')) return 'Finance & Transfers'
    if (pathname.startsWith('/business-loans')) return 'Business Loans'
    if (pathname.startsWith('/ledger')) return 'General Ledger'
    if (pathname.startsWith('/accounting/reserve-account')) return 'Reserve Account'
    if (pathname.startsWith('/accounting/audit-logs')) return 'Finance Audit Logs'
    if (pathname.startsWith('/accounting')) return 'Accounting'
    if (pathname.startsWith('/payment-submissions')) return 'Pay Review'
    if (pathname.startsWith('/inventory')) return 'Inventory'
    if (pathname.startsWith('/container-access')) return 'Container Access'
    if (pathname.startsWith('/tasks')) return 'Tasks'
    if (pathname.startsWith('/mbdi')) return 'MBDI Scheme'
    if (pathname.startsWith('/hr')) return 'Human Resources'
    if (pathname.startsWith('/admin')) return 'Admin Settings'
    if (pathname.startsWith('/support')) return 'Support Desk'
    if (pathname.startsWith('/profile')) return 'User Profile'
    return BRAND_CONFIG.tagline ? `${BRAND_CONFIG.name} ${BRAND_CONFIG.tagline}` : BRAND_CONFIG.name
  }

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-border bg-card px-4 shrink-0 select-none">
      {/* Left section: Mobile menu toggle + Page title */}
      <div className="flex items-center gap-2 md:gap-3">
        {onOpenMobileMenu && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden size-9 shrink-0" 
            onClick={onOpenMobileMenu}
            title="Open Navigation Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="size-5 text-foreground" />
          </Button>
        )}
        {/* Desktop Sidebar Pin Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex size-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg"
          onClick={toggleSidebar}
          title={isCollapsed ? "Pin sidebar" : "Unpin sidebar"}
          aria-label={isCollapsed ? "Pin sidebar" : "Unpin sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="size-5" />
          ) : (
            <ChevronLeft className="size-5" />
          )}
        </Button>
        <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right section: Toolbar actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Enable Notification Action */}
        {notificationStatus !== 'granted' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRequestPermission}
            title="Enable Notifications"
            aria-label="Enable Notifications"
            className="size-9 shrink-0"
          >
            <Bell className="size-5" />
          </Button>
        )}



        {/* Chat Module Navigation Shortcut */}
        <Link href="/chat" passHref legacyBehavior>
          <Button
            variant="ghost"
            size="icon"
            title={unreadMessages > 0 ? `Chat Messages (${unreadMessages} unread)` : 'Chat Messages'}
            aria-label={unreadMessages > 0 ? `Chat Messages, ${unreadMessages} unread` : 'Chat Messages'}
            className="relative size-9 shrink-0"
          >
            <img 
              src="/icons/chat-192.png" 
              alt="Chat" 
              className="size-7 object-contain rounded-md" 
            />
            {unreadMessages > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </Button>
        </Link>

        {/* MBDI Module Navigation Shortcut */}
        {canOpenMbdi && (
          <Link
            href="/mbdi"
            title={unreadMbdi > 0 ? `MBDI Scheme (${unreadMbdi} unread)` : 'MBDI Scheme'}
            aria-label={unreadMbdi > 0 ? `MBDI Scheme, ${unreadMbdi} unread` : 'MBDI Scheme'}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'relative size-9 shrink-0',
              pathname.startsWith('/mbdi') && 'bg-red-500/15 text-red-600 dark:text-red-400'
            )}
          >
            <Rocket className="size-5" />
            {unreadMbdi > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {unreadMbdi > 99 ? '99+' : unreadMbdi}
              </span>
            )}
          </Link>
        )}

        {/* Workspace Background Picker */}
        <BackgroundPicker />
      </div>
    </header>
  )
}
