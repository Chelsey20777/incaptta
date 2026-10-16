'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type BadgeColorType = 'red' | 'amber' | 'green' | 'gray'

interface TrafficLightBadgeProps {
  status: string
  className?: string
  customMap?: Record<string, BadgeColorType>
}

const defaultStatusMap: Record<string, BadgeColorType> = {
  // Red
  REJECTED: 'red',
  DISPUTED: 'red',
  VARIANCE_EXCEEDED: 'red',
  CANCELLED: 'red',
  FAILED: 'red',
  OUT_OF_STOCK: 'red',
  CRITICAL: 'red',

  // Amber
  SUBMITTED: 'amber',
  PENDING_MATCH: 'amber',
  PARTIALLY_FULFILLED: 'amber',
  PROCESSING: 'amber',
  VARIANCE_FLAGGED: 'amber',
  VARIANCE_WITHIN_THRESHOLD: 'amber',
  PAYMENT_PENDING: 'amber',
  WARNING: 'amber',

  // Green
  APPROVED: 'green',
  MATCHED: 'green',
  COMPLETE: 'green',
  ACTIVE: 'green',
  PAYMENT_PROCESSED: 'green',
  VERIFIED: 'green',
  HEALTHY: 'green',

  // Gray / Info
  DRAFT: 'gray',
  SENT: 'gray',
  ACKNOWLEDGED: 'gray',
  PENDING_GRN: 'gray',
  INACTIVE: 'gray',
}

const colorStyles: Record<BadgeColorType, string> = {
  red: 'bg-red-50 text-red-700 border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
  green: 'bg-green-50 text-green-700 border-green-200/50 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30',
  gray: 'bg-gray-50 text-gray-600 border-gray-200/50 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800/30',
}

export function TrafficLightBadge({ status, className, customMap }: TrafficLightBadgeProps) {
  const statusKey = status?.toUpperCase() || ''
  const statusMap = { ...defaultStatusMap, ...customMap }
  const color = statusMap[statusKey] || 'gray'

  const formattedLabel = status
    ?.toLowerCase()
    ?.split('_')
    ?.map(word => word.charAt(0).toUpperCase() + word.slice(1))
    ?.join(' ')

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] h-5 px-2 font-bold uppercase tracking-wider rounded-md border transition-colors',
        colorStyles[color],
        className
      )}
    >
      {formattedLabel}
    </Badge>
  )
}
