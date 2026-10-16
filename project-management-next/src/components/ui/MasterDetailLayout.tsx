'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface MasterDetailLayoutProps {
  leftPanel: React.ReactNode
  rightPanel: React.ReactNode
  className?: string
  leftClassName?: string
  rightClassName?: string
}

export function MasterDetailLayout({
  leftPanel,
  rightPanel,
  className,
  leftClassName,
  rightClassName,
}: MasterDetailLayoutProps) {
  return (
    <div
      className={cn(
        'h-[calc(100vh-110px)] md:h-[calc(100vh-130px)] flex flex-col md:flex-row gap-5 pb-4 overflow-hidden w-full select-none',
        className
      )}
    >
      {/* Left Panel: Stats, Filters, Search (25%) */}
      <aside
        className={cn(
          'w-full md:w-[25%] flex flex-col gap-4 overflow-y-auto max-h-full pr-1 shrink-0',
          'scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent',
          leftClassName
        )}
      >
        {leftPanel}
      </aside>

      {/* Right Panel: Primary interactive grid / list (75%) */}
      <main
        className={cn(
          'w-full md:w-[75%] flex flex-col border border-border/40 rounded-2xl bg-card/45 backdrop-blur-md overflow-hidden h-full shadow-lg relative',
          rightClassName
        )}
      >
        {rightPanel}
      </main>
    </div>
  )
}
