'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GlassCard } from '../ui/GlassCard';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Package, 
  Users, 
  CheckSquare, 
  Settings,
  Menu
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agric-structures', label: 'Projects', icon: FolderKanban },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/crm/leads', label: 'CRM Leads', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/profile', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <GlassCard 
      as="aside" 
      hoverable={false}
      className="hidden md:flex flex-col w-64 h-[calc(100vh-2rem)] m-4 p-4 border border-[var(--glass-border)] bg-[var(--card)]"
    >
      <div className="flex items-center gap-3 px-2 py-4 mb-6 border-b border-[var(--border)]">
        <Menu className="h-6 w-6 text-[var(--brand-primary)]" />
        <span className="font-semibold text-lg tracking-tight text-[var(--foreground)]">
          IncapttaPro
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                isActive
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[rgba(121,194,27,0.08)] hover:text-[var(--brand-primary)]'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </GlassCard>
  );
}
