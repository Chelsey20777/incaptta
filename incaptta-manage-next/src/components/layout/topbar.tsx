'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { useTheme } from '@/components/providers/theme-provider'
import { auth } from '@/lib/firebase'
import { 
  Menu, 
  Bell, 
  Sun, 
  Moon, 
  LogOut, 
  User,
  ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

interface TopBarProps {
  onOpenMobileMenu?: () => void
}

export function TopBar({ onOpenMobileMenu }: TopBarProps) {
  const { user } = useAuthStore()
  const { appSettings } = useAdminStore()
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const [notificationStatus, setNotificationStatus] = useState('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(window.Notification.permission)
    }
  }, [])

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

  const handleLogout = async () => {
    try {
      await auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  // Generate dynamic page title based on route prefix
  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard'
    if (pathname.startsWith('/balances')) return 'Balances'
    if (pathname.startsWith('/opex')) return 'OPEX'
    if (pathname.startsWith('/job-cards')) return 'Job Cards'
    if (pathname.startsWith('/finance')) return 'Finance'
    if (pathname.startsWith('/crm')) return 'CRM'
    if (pathname.startsWith('/inventory')) return 'Inventory'
    if (pathname.startsWith('/hr')) return 'HR'
    if (pathname.startsWith('/accounting')) return 'Accounting'
    if (pathname.startsWith('/auto-approvals')) return 'Auto Approvals'
    return 'Incaptta Manage'
  }

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'

  return (
    <header className="flex h-16 w-full items-center justify-between border-b bg-card px-4 shrink-0 select-none">
      {/* Left section: Mobile menu toggle + Page title */}
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden size-9 shrink-0" 
            onClick={onOpenMobileMenu}
          >
            <Menu className="size-5 text-foreground" />
          </Button>
        )}
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
            className="size-9 shrink-0"
          >
            <Bell className="size-5" />
          </Button>
        )}

        {/* Theme Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Theme"
          className="size-9 shrink-0"
        >
          {theme === 'dark' ? (
            <Sun className="size-5 text-amber-500" />
          ) : (
            <Moon className="size-5 text-slate-700 dark:text-slate-300" />
          )}
        </Button>

        {/* User Account Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="flex items-center gap-1.5 px-1 py-0.5 rounded-full hover:bg-muted shrink-0">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs uppercase">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="size-4 opacity-50 shrink-0 hidden sm:inline" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 mt-2">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.displayName || 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
