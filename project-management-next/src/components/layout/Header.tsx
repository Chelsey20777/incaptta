'use client';

import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Bell, Search, User } from 'lucide-react';

export function Header() {
  return (
    <GlassCard
      as="header"
      hoverable={false}
      className="flex items-center justify-between h-16 px-6 mx-4 mt-4 border border-[var(--glass-border)] bg-[var(--card)]"
    >
      {/* Search Input */}
      <div className="relative w-72">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
        </span>
        <input
          type="text"
          placeholder="Search projects..."
          className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--foreground)] transition-all duration-200 focus:outline-none focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[rgba(121,194,27,0.15)]"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button 
          type="button"
          className="p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[rgba(121,194,27,0.08)] hover:text-[var(--brand-primary)] transition-colors duration-200 cursor-pointer"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* User profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-[var(--border)]">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold text-sm">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-[var(--foreground)]">Admin User</p>
            <p className="text-[10px] text-[var(--muted-foreground)]">System Administrator</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
