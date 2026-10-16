'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Building2,
  Hammer,
  ArrowRight,
  DollarSign,
  ClipboardList,
  Settings,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

interface OverviewTabProps {
  jobCards: any[]
  rates: any
  loadingJobCards: boolean
  loadingRates: boolean
  isProcessing: boolean
  editRates: { brickUnitCost: number; cementUnitCost: number }
  setEditRates: React.Dispatch<React.SetStateAction<{ brickUnitCost: number; cementUnitCost: number }>>
  includeLabour: boolean
  setIncludeLabour: (val: boolean) => void
  includeTransport: boolean
  setIncludeTransport: (val: boolean) => void
  onSaveRates: () => Promise<void>
}

export function OverviewTab({
  jobCards,
  rates,
  loadingJobCards,
  loadingRates,
  isProcessing,
  editRates,
  setEditRates,
  includeLabour,
  setIncludeLabour,
  includeTransport,
  setIncludeTransport,
  onSaveRates,
}: OverviewTabProps) {
  const stats = useMemo(() => {
    const total = jobCards.length
    const draft = jobCards.filter((j) => j.status === 'DRAFT').length
    const approved = jobCards.filter((j) => j.status === 'APPROVED').length
    const paid = jobCards.filter((j) => j.status === 'PAID').length
    const completed = jobCards.filter((j) => j.status === 'COMPLETED').length
    const totalValue = jobCards.reduce((s, j) => s + (j.totalAmount || 0), 0)
    const totalPaid = jobCards.reduce((s, j) => s + (j.paidAmount || 0), 0)
    const totalOutstanding = totalValue - totalPaid
    return { total, draft, approved, paid, completed, totalValue, totalPaid, totalOutstanding }
  }, [jobCards])

  const statusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      DRAFT: 'secondary',
      APPROVED: 'default',
      PAID: 'outline',
      COMPLETED: 'outline',
      CANCELLED: 'destructive',
    }
    return <Badge variant={v[status] || 'secondary'}>{status}</Badge>
  }

  const recentJobCards = useMemo(() => jobCards.slice(0, 5), [jobCards])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Quotes</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingJobCards ? <Skeleton className="h-8 w-16" /> : stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.draft} draft · {stats.approved} approved
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              ${stats.totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${stats.totalPaid.toLocaleString()} paid
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Outstanding</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              ${stats.totalOutstanding.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.paid} fully paid
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Completed</CardTitle>
            <ClipboardList className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.approved} in progress
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Construction Rates Card */}
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-brand-primary" />
              Construction Rates Customizer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingRates ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Brick Unit Cost ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRates.brickUnitCost}
                    onChange={(e) =>
                      setEditRates((p) => ({
                        ...p,
                        brickUnitCost: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Cement Unit Cost ($/bag)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editRates.cementUnitCost}
                    onChange={(e) =>
                      setEditRates((p) => ({
                        ...p,
                        cementUnitCost: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={includeLabour}
                      onCheckedChange={setIncludeLabour}
                    />
                    <Label className="cursor-pointer font-semibold text-xs text-muted-foreground uppercase">Include Labour</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={includeTransport}
                      onCheckedChange={setIncludeTransport}
                    />
                    <Label className="cursor-pointer font-semibold text-xs text-muted-foreground uppercase">Include Transport</Label>
                  </div>
                </div>
                <Button
                  onClick={onSaveRates}
                  disabled={isProcessing}
                  className="w-full bg-brand-primary hover:bg-brand-primary/95 text-white font-bold"
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Rates Configuration
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Quotes */}
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-brand-primary" />
              Recent System Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingJobCards ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : recentJobCards.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="mx-auto h-8 w-8 mb-2 opacity-50 text-muted-foreground" />
                <p className="italic">No quotes generated yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobCards.map((jc) => (
                  <Link
                    key={jc.id}
                    href={`/agric-structures/job-cards/${jc.id}`}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 border border-transparent hover:border-border/50 transition-all bg-muted/10"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">
                        {jc.jobNumber}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {jc.clientName || 'No client name'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono font-bold">
                        ${(jc.totalAmount || 0).toLocaleString()}
                      </span>
                      {statusBadge(jc.status)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
