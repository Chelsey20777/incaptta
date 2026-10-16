'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useAdminStore } from '@/stores/admin-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import type { ModuleKey } from '@/constants/modules'
import { canAccessMbdi } from '@/features/mbdi/utils/access'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './topbar'
import { MobileBottomNav } from './mobile-bottom-nav'
import { AppBootLoader } from './app-boot-loader'
import { BrandLogo } from './brand-logo'
import { BRAND_CONFIG } from '@/config/branding'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
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
  Egg,
  Building2,
  MessageSquare,
  Wrench,
  DollarSign,
  Truck,
  Rocket,
  HardHat,
  Landmark,
  History,
} from 'lucide-react'

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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading: authLoading, hasAnyRole, getRoles } = useAuthStore()
  const { sidebarMode, initializeSidebar, compactMode } = useUIStore()
  const { appSettings, fetchSettings } = useAdminStore()
  const { loading: permLoading, load: loadPermissions, canAccessModule } = usePermissionsStore()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [userBgUrl, setUserBgUrl] = useState<string>('')

  // Read user background preference from localStorage and listen for changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const checkBg = () => {
      const storageKey = `incaptta_bg_url_${user?.uid || 'global'}`
      const val = localStorage.getItem(storageKey)
      setUserBgUrl(val || '')
    }
    checkBg()
    window.addEventListener('bg-changed', checkBg)
    return () => window.removeEventListener('bg-changed', checkBg)
  }, [user?.uid])

  const isAuthPage = pathname === '/login' || pathname === '/setup-mfa' || pathname.startsWith('/verify/')

  // 1. Initialize stores on mount
  useEffect(() => {
    initializeSidebar()
  }, [initializeSidebar])

  // Sync compact mode class to root html element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (compactMode) {
        document.documentElement.classList.add('compact')
      } else {
        document.documentElement.classList.remove('compact')
      }
    }
  }, [compactMode])

  // 2. Fetch admin settings when user auth state resolves
  useEffect(() => {
    if (user?.uid) {
      const unsub = fetchSettings(user.uid)
      return () => unsub()
    }
  }, [user?.uid, fetchSettings])

  // Load the role-permissions matrix so nav visibility reflects it
  useEffect(() => {
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

  // Mobile menu items
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

  // Show a branded full-screen loader while auth state is resolving
  if (authLoading) {
    return <AppBootLoader />
  }

  // For unauthenticated login/verify routes, render directly without the sidebar/header shell
  if (isAuthPage || !user) {
    return <>{children}</>
  }

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'
  const brandSecondaryColor = appSettings?.uiColors?.brandSecondaryColor || '#ff8903'
  const activeBgUrl = userBgUrl || appSettings?.defaultBackgroundUrl || appSettings?.backgroundImageUrl || ''

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* Dynamic Theme Color Overrides */}
      {appSettings && (
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --brand-primary: ${brandColor};
              --brand-secondary: ${brandSecondaryColor};
              --grid-header-bg: ${appSettings.uiColors?.gridHeaderBgColor || '#2a0808'};
              --grid-header-text: ${appSettings.uiColors?.gridHeaderTextColor || '#ff8903'};
              --grid-secondary-bg: ${appSettings.uiColors?.gridSecondaryBgColor || '#1a0505'};
              --grid-border: ${appSettings.uiColors?.gridBorderColor || 'rgba(255,137,3,0.1)'};
              ${activeBgUrl ? `--bg-image: url(${activeBgUrl});` : ''}
              --bg-brightness: ${appSettings.backgroundOpacity !== undefined ? appSettings.backgroundOpacity / 100 : 1};
            }
          `
        }} />
      )}

      {/* Desktop App Sidebar */}
      <AppSidebar />

      {/* Main content grid */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <TopBar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

        {/* Scrollable child layout area */}
        <main className="flex-1 overflow-y-auto w-full pb-16 md:pb-0">
          <div className="px-3 py-4 md:p-4 lg:p-6 w-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav menu toolbar */}
        <MobileBottomNav onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
      </div>

      {/* Mobile Drawer Navigation Sheet */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent
          side="left"
          overlayClassName="bg-black/50 backdrop-blur-sm"
          className="w-[300px] p-0 border-none bg-[var(--bg-solid)] flex flex-col h-full overflow-hidden"
        >
          <SheetHeader className="p-6 border-b shrink-0 text-left">
            <SheetTitle className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded bg-primary/10 overflow-hidden shrink-0">
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
              <span className="font-bold text-lg select-none uppercase">
                <span style={{ color: brandColor }}>{BRAND_CONFIG.name}</span>
                {BRAND_CONFIG.tagline && (
                  <span style={{ color: brandSecondaryColor }}> {BRAND_CONFIG.tagline}</span>
                )}
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Navigation link list */}
          <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
            <nav className="flex flex-col gap-0.5">
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
                        className="flex items-center justify-between w-full h-12 px-3 rounded-lg text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground"
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="size-5 shrink-0" />
                          <span>{item.title}</span>
                        </div>
                        {isGroupExpanded ? <ChevronDown className="size-4 opacity-50" /> : <ChevronRight className="size-4 opacity-50" />}
                      </button>

                      {isGroupExpanded && (
                        <div className="pl-6 space-y-1">
                          {item.children?.map((child) => {
                            if (child.roles && !hasAnyRole(child.roles as any)) return null
                            const ChildIcon = child.icon
                            const isChildActive = pathname === child.path
                            return (
                              <Link
                                key={child.path}
                                href={child.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                  "flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-all border-l-2 border-transparent",
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
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center h-12 px-3 rounded-lg text-sm font-medium transition-all border-l-2 border-transparent gap-3",
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
                    <span>{item.title}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="p-4 border-t bg-muted/30 shrink-0 text-center text-xs text-muted-foreground font-semibold uppercase">
            {BRAND_CONFIG.name}{BRAND_CONFIG.tagline ? ` ${BRAND_CONFIG.tagline}` : ""} v2.0
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
