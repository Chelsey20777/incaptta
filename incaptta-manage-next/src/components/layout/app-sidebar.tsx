'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useAdminStore } from '@/stores/admin-store'
import { auth } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  Wallet,
  FileText, 
  Briefcase,
  Package,
  UsersRound,
  ShieldCheck,
  LogOut,
  ChevronDown,
  TrendingUp,
  Scale
} from 'lucide-react'
import { BrandLogo } from './brand-logo'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'

interface NavItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  path: string
}

export function AppSidebar() {
  const { user } = useAuthStore()
  const { isCollapsed } = useUIStore()
  const { appSettings } = useAdminStore()
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const navItems: NavItem[] = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { title: 'Balances', icon: Scale, path: '/balances' },
    { title: 'OPEX', icon: Wallet, path: '/opex' },
    { title: 'Job Cards', icon: FileText, path: '/job-cards' },
    { title: 'Finance', icon: TrendingUp, path: '/finance' },
    { title: 'CRM', icon: Briefcase, path: '/crm' },
    { title: 'Inventory', icon: Package, path: '/inventory' },
    { title: 'HR', icon: UsersRound, path: '/hr' },
    { title: 'Accounting', icon: FileText, path: '/accounting' },
    { title: 'Auto Approvals', icon: ShieldCheck, path: '/auto-approvals' },
  ]

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'

  return (
    <aside className={cn(
      "hidden md:flex flex-col h-screen border-r bg-card transition-all duration-300 shrink-0 overflow-hidden",
      isCollapsed ? "w-[70px]" : "w-[260px]"
    )}>
      {/* Sidebar Header */}
      <div className="flex h-16 items-center px-4 border-b shrink-0 gap-3">
        <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 overflow-hidden shrink-0">
          {appSettings?.logoDataUrl || appSettings?.logoUrl ? (
            <img 
              src={appSettings.logoDataUrl || appSettings.logoUrl} 
              alt="Logo" 
              className="w-full h-full object-contain"
            />
          ) : (
            <BrandLogo />
          )}
        </div>
        {!isCollapsed && (
          <span className="font-bold text-lg tracking-tight select-none">
            <span style={{ color: brandColor }}>INCAPTTA</span>
            <span style={{ color: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }}>MANAGE</span>
          </span>
        )}
      </div>

      {/* Navigation Scroll Area */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-sidebar">
        {navItems.map((item) => {
          const IconComponent = item.icon
          const isActive = pathname === item.path

          return (
            <Link
              key={item.title}
              href={item.path}
              className={cn(
                "flex items-center h-11 px-3 rounded-lg text-sm font-medium transition-all border-l-2 border-transparent",
                isCollapsed ? "justify-center" : "gap-3",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              style={isActive ? { 
                backgroundColor: `${brandColor}15`, 
                color: brandColor,
                borderLeftColor: brandColor
              } : {}}
            >
              <IconComponent className="size-5 shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </Link>
          )
        })}
      </div>

      {/* Sidebar Footer */}
      <div className="border-t p-2 bg-muted/20 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="w-full justify-start gap-2 px-2 py-1.5 h-auto overflow-hidden">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs uppercase">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex flex-col items-start overflow-hidden text-left transition-opacity duration-300">
                    <span className="text-sm font-medium truncate w-full">{user?.displayName || 'User'}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">{user?.email}</span>
                  </div>
                )}
                {!isCollapsed && (
                  <ChevronDown className="ml-auto size-4 opacity-50 shrink-0" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent side={isCollapsed ? 'right' : 'top'} align="end" className="w-56">
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
