'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { 
  LayoutDashboard, 
  FileText, 
  Package, 
  ClipboardList, 
  Menu 
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileBottomNavProps {
  onOpenMobileMenu: () => void
}

export function MobileBottomNav({ onOpenMobileMenu }: MobileBottomNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { appSettings } = useAdminStore()
  const { getRoles } = useAuthStore()
  const canAccessModule = usePermissionsStore(state => state.canAccessModule)

  const navItems = [
    { title: 'Home', icon: LayoutDashboard, path: '/', module: 'dashboard' },
    { title: 'Job Cards', icon: FileText, path: '/job-cards', module: 'jobCards' },
    { title: 'Tasks', icon: ClipboardList, path: '/tasks', module: 'tasks' },
    { title: 'Inventory', icon: Package, path: '/inventory', module: 'inventory' },
    { title: 'PMO', icon: Package, path: '/inventory/fulfilment', module: 'pmo' },
  ]
  const visibleItems = navItems.filter(item => canAccessModule(getRoles(), item.module))

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const brandColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-lg border-t z-50 flex items-center justify-around px-2 pb-safe select-none">
      {visibleItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.path)
        return (
          <button 
            key={item.path}
            onClick={() => router.push(item.path)}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-all relative"
            style={active ? { color: brandColor } : { color: 'hsl(var(--muted-foreground))' }}
          >
            <Icon className={cn("size-5 transition-transform", active && "scale-110")} />
            <span className="text-[10px] font-medium">{item.title}</span>
            {active && (
              <div 
                className="absolute bottom-0 w-1 h-1 rounded-full" 
                style={{ backgroundColor: brandColor }}
              />
            )}
          </button>
        )
      })}
      
      <button 
        onClick={onOpenMobileMenu}
        className="flex flex-col items-center gap-1 flex-1 py-1 text-muted-foreground"
      >
        <Menu className="size-5" />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </nav>
  )
}
