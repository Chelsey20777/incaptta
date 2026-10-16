'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { useAdminStore } from '@/stores/admin-store'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './topbar'
import { MobileBottomNav } from './mobile-bottom-nav'
import { BrandLogo } from './brand-logo'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { 
  LayoutDashboard, 
  Wallet,
  FileText, 
  Briefcase,
  Package,
  UsersRound,
  ShieldCheck,
  TrendingUp,
  Scale
} from 'lucide-react'

interface NavItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  path: string
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuthStore()
  const { initializeSidebar } = useUIStore()
  const { appSettings, fetchSettings } = useAdminStore()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isAuthPage = pathname === '/login' || pathname.startsWith('/verify/')

  // 1. Initialize stores on mount
  useEffect(() => {
    initializeSidebar()
  }, [initializeSidebar])

  // 2. Fetch admin settings when user auth state resolves
  useEffect(() => {
    if (user?.uid) {
      const unsub = fetchSettings(user.uid)
      return () => unsub()
    }
  }, [user?.uid, fetchSettings])

  // Mobile menu items
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

  // Show a loading overlay while auth state is resolving
  if (authLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  // For unauthenticated login/verify routes, render directly without the sidebar/header shell
  if (isAuthPage || !user) {
    return <>{children}</>
  }

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'
  const brandSecondaryColor = appSettings?.uiColors?.brandSecondaryColor || '#ff8903'

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* Dynamic Theme Color Overrides */}
      {appSettings?.uiColors && (
        <style dangerouslySetInnerHTML={{
          __html: `
            :root {
              --brand-primary: ${brandColor};
              --brand-secondary: ${brandSecondaryColor};
              --grid-header-bg: ${appSettings.uiColors.gridHeaderBgColor || '#2a0808'};
              --grid-header-text: ${appSettings.uiColors.gridHeaderTextColor || '#ff8903'};
              --grid-secondary-bg: ${appSettings.uiColors.gridSecondaryBgColor || '#1a0505'};
              --grid-border: ${appSettings.uiColors.gridBorderColor || 'rgba(255,137,3,0.1)'};
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
          <div className="px-3 py-4 md:p-8 w-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav menu toolbar */}
        <MobileBottomNav onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
      </div>

      {/* Mobile Drawer Navigation Sheet */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-[300px] p-0 border-none bg-card flex flex-col h-full overflow-hidden">
          <SheetHeader className="p-6 border-b shrink-0 text-left">
            <SheetTitle className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded bg-primary/10 overflow-hidden shrink-0">
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
              <span className="font-bold text-lg select-none">
                <span style={{ color: brandColor }}>INCAPTTA</span>
                <span style={{ color: brandSecondaryColor }}>MANAGE</span>
              </span>
            </SheetTitle>
          </SheetHeader>

          {/* Navigation link list */}
          <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
            <nav className="flex flex-col gap-0.5">
              {navItems.map((item) => {
                const IconComponent = item.icon
                const isActive = pathname === item.path

                return (
                  <Link
                    key={item.title}
                    href={item.path}
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

          <div className="p-4 border-t bg-muted/30 shrink-0 text-center text-xs text-muted-foreground font-semibold">
            Incaptta Manage Portal v2.0
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
