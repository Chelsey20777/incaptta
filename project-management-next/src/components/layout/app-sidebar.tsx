'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useAdminStore } from '@/stores/admin-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import type { ModuleKey } from '@/constants/modules'
import { canAccessMbdi } from '@/features/mbdi/utils/access'
import { auth } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  FileText, 
  Layers, 
  Briefcase,
  Users,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  ScanLine,
  ShieldCheck,
  Package,
  Container,
  ClipboardList,
  UsersRound,
  User,
  UserCog,
  LifeBuoy,
  LogOut,
  ChevronDown,
  ChevronRight,
  Building2,
  Egg,
  MessageSquare,
  Wrench,
  DollarSign,
  Truck,
  Rocket,
  HardHat,
  Landmark,
  History,
} from 'lucide-react'
import { BrandLogo } from './brand-logo'
import { BRAND_CONFIG } from '@/config/branding'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

interface NavChild {
  title: string
  icon: React.ComponentType<{ className?: string }>
  path: string
  /** When set, child is shown only if the user has one of these roles */
  roles?: string[]
}

interface NavItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  path?: string
  roles: string[]
  module?: ModuleKey
  children?: NavChild[]
}

export function AppSidebar() {
  const { user, profile, hasAnyRole, getRoles } = useAuthStore()
  const { isCollapsed, isSidebarHovered, setSidebarHovered } = useUIStore()
  const { appSettings } = useAdminStore()
  const { loading: permLoading, load: loadPermissions, canAccessModule } = usePermissionsStore()
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  const canSee = (item: NavItem) => {
    // Module-tagged items: matrix is source of truth (union of the user's roles).
    // Extra roles unlock extra modules — e.g. TECHNICAL + ACCOUNTANT => finance.
    // MBDI uses per-user grant + approver bypass.
    if (item.module === 'mbdi') {
      return canAccessMbdi(profile, getRoles())
    }
    if (item.module) {
      return canAccessModule(getRoles(), item.module)
    }
    // Untagged items (Profile, BOM Templates, etc.): keep the legacy role allowlist.
    return hasAnyRole(item.roles as any)
  }

  const isPinned = !isCollapsed
  const showExpanded = isPinned || isSidebarHovered

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    CRM: false,
    Finance: false
  })

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [title]: !prev[title]
    }))
  }

  const handleLogout = async () => {
    try {
      await auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  const navItems: NavItem[] = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'dashboard' },
    { title: 'Job Cards', icon: FileText, path: '/job-cards', roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN', 'DIRECTOR'], module: 'jobCards' },
    { title: 'Subcontractors', icon: HardHat, path: '/subcontractors', roles: ['ACCOUNTANT', 'MANAGER', 'ADMIN', 'DIRECTOR', 'SUPER_ADMIN'], module: 'subcontractors' },
    { title: 'BOM Templates', icon: Layers, path: '/bom-templates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' },
    {
      title: 'CRM',
      icon: Briefcase,
      roles: ['SALES', 'MANAGER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'TECHNICAL', 'DIRECTOR'],
      module: 'crm',
      children: [
        { title: 'Customers', icon: Users, path: '/crm/customers' },
        { title: 'Quotations', icon: FileText, path: '/crm/quotations' },
        { title: 'Invoices', icon: FileText, path: '/crm/invoices' },
        { title: 'Leads', icon: TrendingUp, path: '/crm/leads' },
      ]
    },
    {
      title: 'Finance',
      icon: Wallet,
      roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL', 'SALES', 'STOREKEEPER', 'DIRECTOR'],
      module: 'finance',
      children: [
        { title: 'OPEX', icon: Wallet, path: '/opex' },
        { title: 'Transfers', icon: ArrowLeftRight, path: '/transfers' },
        { title: 'Business Loans', icon: DollarSign, path: '/business-loans', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'] },
        { title: 'Reserve Account', icon: Landmark, path: '/accounting/reserve-account' },
        { title: 'Ledger', icon: FileText, path: '/ledger' },
        { title: 'Auto Approvals', icon: ShieldCheck, path: '/accounting/auto-approvals' },
        { title: 'Audit Logs', icon: History, path: '/accounting/audit-logs', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'] },
      ]
    },
    { title: 'Pay Review', icon: ScanLine, path: '/payment-submissions', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN', 'DIRECTOR'], module: 'finance' },
    { title: 'Inventory', icon: Package, path: '/inventory', roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'], module: 'inventory' },
    { title: 'PMO portal', icon: Package, path: '/inventory/fulfilment', roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'TECHNICAL', 'MANAGER', 'DIRECTOR'], module: 'pmo' },
    { title: 'Container Access', icon: Container, path: '/container-access', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'containerAccess' },
    { title: 'Tasks', icon: ClipboardList, path: '/tasks', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'], module: 'tasks' },
    { title: 'Agric Structures', icon: Building2, path: '/agric-structures', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL', 'DIRECTOR'], module: 'agricStructures' },
    { title: 'Poultry', icon: Egg, path: '/poultry', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND'], module: 'poultry' },
    { title: 'Chat', icon: MessageSquare, path: '/chat', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'], module: 'chat' },
    { title: 'Tools', icon: Wrench, path: '/tools', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL', 'STOREKEEPER'], module: 'tools' },
    { title: 'Commissions', icon: DollarSign, path: '/commissions', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'], module: 'commissions' },
    { title: 'MBDI', icon: Rocket, path: '/mbdi', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR', 'POULTRY_MANAGER', 'FARM_HAND', 'MBDI_STAFF'], module: 'mbdi' },
    { title: 'Equipment Hire', icon: Truck, path: '/equipment-hire', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL', 'DIRECTOR'] },
    { title: 'HR', icon: UsersRound, path: '/hr', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'], module: 'hr' },
    { title: 'Settings', icon: UserCog, path: '/admin', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'], module: 'admin' },
    { title: 'Support', icon: LifeBuoy, path: '/support', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'], module: 'support' },
    { title: 'Profile', icon: User, path: '/profile', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
  ]

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'

  return (
    <>
      {/* Reserve icon-rail width so content does not jump when the overlay expands */}
      {!isPinned && (
        <div className="hidden md:block w-[70px] shrink-0" aria-hidden="true" />
      )}

      <aside
        className={cn(
          "hidden md:flex flex-col h-screen border-r border-sidebar-border transition-all duration-300 overflow-hidden",
          isPinned
            ? "w-[260px] shrink-0 bg-sidebar"
            : cn(
                // Overlay must be near-opaque so content/wallpaper do not bleed through labels
                "fixed left-0 top-0 z-40 bg-[var(--bg-solid)]/95 backdrop-blur-xl border-sidebar-border",
                showExpanded ? "w-[260px] shadow-2xl shadow-black/40" : "w-[70px]"
              )
        )}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center px-4 border-b border-sidebar-border shrink-0 gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-muted overflow-hidden shrink-0">
            {appSettings?.faviconDataUrl || appSettings?.faviconUrl || appSettings?.logoDataUrl || appSettings?.logoUrl ? (
              <img 
                src={appSettings.faviconDataUrl || appSettings.faviconUrl || appSettings.logoDataUrl || appSettings.logoUrl} 
                alt="Logo" 
                className="w-full h-full object-contain"
              />
            ) : (
              <BrandLogo />
            )}
          </div>
          {showExpanded && (
            <span className="font-bold text-lg tracking-tight select-none uppercase whitespace-nowrap">
              <span style={{ color: brandColor }}>{BRAND_CONFIG.name}</span>
              {BRAND_CONFIG.tagline && (
                <span style={{ color: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }}> {BRAND_CONFIG.tagline}</span>
              )}
            </span>
          )}
        </div>

        {/* Navigation Scroll Area */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-sidebar">
          {navItems.map((item) => {
            if (!canSee(item)) return null

            const IconComponent = item.icon
            const hasChildren = !!item.children
            const isGroupExpanded = expandedGroups[item.title]

            if (hasChildren) {
              return (
                <div key={item.title} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(item.title)}
                    className={cn(
                      "flex items-center w-full h-11 px-3 rounded-lg text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground",
                      showExpanded ? "justify-between" : "justify-center"
                    )}
                    title={!showExpanded ? item.title : undefined}
                    aria-label={item.title}
                  >
                    <div className="flex items-center gap-3">
                      <IconComponent className="size-5 shrink-0" />
                      {showExpanded && <span className="whitespace-nowrap">{item.title}</span>}
                    </div>
                    {showExpanded && (
                      isGroupExpanded ? <ChevronDown className="size-4 opacity-50" /> : <ChevronRight className="size-4 opacity-50" />
                    )}
                  </button>

                  {showExpanded && isGroupExpanded && (
                    <div className="pl-6 space-y-1">
                      {item.children?.map((child) => {
                        if (child.roles && !hasAnyRole(child.roles as any)) return null
                        const ChildIcon = child.icon
                        const isChildActive = pathname === child.path
                        return (
                          <Link
                            key={child.path}
                            href={child.path}
                            className={cn(
                              "flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-all border-l-2 border-transparent whitespace-nowrap",
                              isChildActive 
                                ? "text-primary" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                            )}
                            style={isChildActive ? { 
                              backgroundColor: `${brandColor}15`, 
                              color: brandColor,
                              borderLeftColor: brandColor
                            } : {}}
                          >
                            <ChildIcon className="size-4 shrink-0" />
                            <span>{child.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            const isActive = pathname === item.path

            return (
              <Link
                key={item.title}
                href={item.path || '#'}
                className={cn(
                  "flex items-center h-11 px-3 rounded-lg text-sm font-medium transition-all border-l-2 border-transparent",
                  showExpanded ? "gap-3" : "justify-center",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                style={isActive ? { 
                  backgroundColor: `${brandColor}15`, 
                  color: brandColor,
                  borderLeftColor: brandColor
                } : {}}
                title={!showExpanded ? item.title : undefined}
                aria-label={item.title}
              >
                <IconComponent className="size-5 shrink-0" />
                {showExpanded && <span className="whitespace-nowrap">{item.title}</span>}
              </Link>
            )
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t p-2 bg-muted/20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 px-2 py-1.5 h-auto overflow-hidden cursor-pointer"
                  title={!showExpanded ? "User Settings" : undefined}
                  aria-label="User Settings"
                />
              }
            >
              <Avatar className="size-8 shrink-0">
                {user?.photoURL ? (
                  <AvatarImage src={user.photoURL} alt={user.displayName || 'Profile'} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs uppercase">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {showExpanded && (
                <div className="flex flex-col items-start overflow-hidden text-left transition-opacity duration-300">
                  <span className="text-sm font-medium truncate w-full">{user?.displayName || 'User'}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{user?.email}</span>
                </div>
              )}
              {showExpanded && (
                <ChevronDown className="ml-auto size-4 opacity-50 shrink-0" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side={showExpanded ? 'top' : 'right'} align="end" className="w-56">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push('/profile')}
              >
                <User className="mr-2 size-4" />
                <span>My Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="mr-2 size-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  )
}
