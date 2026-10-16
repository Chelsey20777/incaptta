'use client'

import React, { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EquipmentAsset, HireContract } from '@/types/equipment-hire'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Calendar as CalendarIcon, Info } from 'lucide-react'

interface DispatchBoardProps {
  assets: EquipmentAsset[]
  contracts: HireContract[]
}

export function DispatchBoard({ assets, contracts }: DispatchBoardProps) {
  // Generate date list for the next 14 days
  const dates = useMemo(() => {
    const arr = []
    const today = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date()
      d.setDate(today.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [])

  // Helper to format date key YYYY-MM-DD
  const formatDateKey = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  // Find active contract on a specific date for a specific asset
  const getContractStatusOnDate = (assetId: string, dateKey: string) => {
    const active = contracts.find(c => {
      if (c.assetId !== assetId) return false
      if (c.status === 'Closed' || c.status === 'Draft') return false
      return dateKey >= c.startDate && dateKey <= c.endDate
    })

    if (!active) return null
    return active.status
  }

  // Check if an asset is undergoing the 24h biosecurity washdown buffer on a specific date
  // Biosecurity buffer applies on the day immediately following the end date of a returned contract
  const isBiosecurityBufferOnDate = (assetId: string, dateKey: string) => {
    const closedContract = contracts.find(c => {
      if (c.assetId !== assetId) return false
      if (c.status !== 'Closed') return false
      
      // Get the day after the end date
      const end = new Date(c.endDate)
      const bufferDate = new Date(end)
      bufferDate.setDate(end.getDate() + 1)
      const bufferDateKey = bufferDate.toISOString().split('T')[0]
      
      return dateKey === bufferDateKey
    })

    return !!closedContract
  }

  const getStatusBadge = (status: EquipmentAsset['status']) => {
    const styles: Record<EquipmentAsset['status'], string> = {
      Available: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      On_Hire: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      Maintenance: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      Standby: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    }
    return (
      <Badge variant="outline" className={`font-semibold uppercase text-[10px] ${styles[status]}`}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="bg-muted/10 dark:bg-card/5 backdrop-blur-sm border-muted shadow-md rounded-xl overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-5 text-brand-primary" />
            <CardTitle>14-Day Timeline Dispatch Board</CardTitle>
          </div>
          <CardDescription>
            Visual calendar showing machinery availability, active hire contracts, and post-hire biosecurity buffers.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 px-6 py-4 border-b border-border/50 text-xs font-semibold text-muted-foreground bg-muted/5 dark:bg-card/10">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-500" />
              <span>Active Hire (WET / DRY)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span>Pending Return Inspection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>Maintenance Status</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40 repeating-stripes" />
              <span>24h Biosecurity Washdown Buffer</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px] divide-y divide-border/50">
              {/* Header Row */}
              <div className="grid grid-cols-[220px_1fr] bg-green-950/20 dark:bg-green-950/10">
                <div className="p-4 font-bold text-xs uppercase text-muted-foreground border-r border-border/50">Equipment Asset</div>
                <div className="grid grid-cols-14 divide-x divide-border/30">
                  {dates.map((date, idx) => (
                    <div key={idx} className="p-2 text-center flex flex-col justify-center items-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">
                        {date.toLocaleDateString(undefined, { weekday: 'short' })}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {date.getDate()}
                      </span>
                      <span className="text-[8px] text-muted-foreground font-semibold">
                        {date.toLocaleDateString(undefined, { month: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rows */}
              {assets.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground italic">
                  No equipment assets configured. Please add assets in the Assets tab.
                </div>
              ) : (
                assets.map(asset => (
                  <div key={asset.id} className="grid grid-cols-[220px_1fr] hover:bg-muted/10 transition-colors">
                    {/* Y-Axis Label */}
                    <div className="p-4 border-r border-border/50 flex flex-col justify-center gap-1">
                      <span className="font-semibold text-sm text-foreground line-clamp-1">{asset.name}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                          {asset.serialNumber}
                        </span>
                        {getStatusBadge(asset.status)}
                      </div>
                    </div>

                    {/* X-Axis Calendar Grid */}
                    <div className="grid grid-cols-14 divide-x divide-border/30 h-full min-h-[60px]">
                      {dates.map((date, idx) => {
                        const dateKey = formatDateKey(date)
                        const contractStatus = getContractStatusOnDate(asset.id, dateKey)
                        const isBuffer = isBiosecurityBufferOnDate(asset.id, dateKey)
                        const inMaintenance = asset.status === 'Maintenance'

                        let cellClass = 'h-full w-full flex items-center justify-center p-1 relative'
                        let content = null

                        if (inMaintenance) {
                          content = (
                            <div className="absolute inset-1 rounded bg-red-500/25 border border-red-500/40 text-[9px] font-bold text-red-600 dark:text-red-400 flex items-center justify-center uppercase tracking-wider">
                              Maint.
                            </div>
                          )
                        } else if (contractStatus === 'Active') {
                          content = (
                            <div className="absolute inset-1 rounded bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center uppercase tracking-wider shadow-sm">
                              On Hire
                            </div>
                          )
                        } else if (contractStatus === 'Pending_Return') {
                          content = (
                            <div className="absolute inset-1 rounded bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center uppercase tracking-wider shadow-sm animate-pulse">
                              Pending
                            </div>
                          )
                        } else if (isBuffer) {
                          content = (
                            <div className="absolute inset-1 rounded bg-amber-500/20 border border-amber-500/40 repeating-stripes text-[9px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center uppercase tracking-wider">
                              Buffer
                            </div>
                          )
                        }

                        return (
                          <div key={idx} className={cellClass}>
                            {content}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Styled custom CSS for biosecurity buffer stripes */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .repeating-stripes {
            background-image: repeating-linear-gradient(
              45deg,
              transparent,
              transparent 4px,
              rgba(245, 158, 11, 0.1) 4px,
              rgba(245, 158, 11, 0.1) 8px
            );
          }
        `
      }} />
    </div>
  )
}
