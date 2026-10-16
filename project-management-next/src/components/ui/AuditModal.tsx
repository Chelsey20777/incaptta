'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface AuditModalProps {
  isOpen: boolean
  onClose: (open: boolean) => void
  title: string
  description?: string
  leftPanel: React.ReactNode // Current Document/Form
  rightPanel: React.ReactNode // Reference Data / Comparative logs
  className?: string
  leftClassName?: string
  rightClassName?: string
}

export function AuditModal({
  isOpen,
  onClose,
  title,
  description,
  leftPanel,
  rightPanel,
  className,
  leftClassName,
  rightClassName,
}: AuditModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          'max-w-6xl w-[95vw] md:w-[90vw] h-[85vh] p-0 flex flex-col overflow-hidden bg-card/90 backdrop-blur-lg border border-border/40 rounded-3xl shadow-2xl',
          className
        )}
      >
        {/* Sticky Dialog Header */}
        <DialogHeader className="p-5 border-b border-border/20 shrink-0 text-left">
          <DialogTitle className="text-lg font-black tracking-tight text-foreground">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Side-by-Side comparative content area */}
        <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border/20 overflow-hidden">
          {/* Left Column: Form / Document details */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
            <ScrollArea className="flex-1">
              <div className={cn('p-5 space-y-4', leftClassName)}>
                {leftPanel}
              </div>
            </ScrollArea>
          </div>

          {/* Right Column: Comparative Reference Data */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full bg-muted/10">
            <ScrollArea className="flex-1">
              <div className={cn('p-5 space-y-4', rightClassName)}>
                {rightPanel}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
