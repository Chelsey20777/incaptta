'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  Loader2,
  Plus,
  Rocket,
  TrendingUp,
  Wallet,
  Hourglass,
  Download,
  Search,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useMbdiStore } from '@/stores/mbdi-store'
import { useAuthStore } from '@/stores/auth-store'
import { downloadMbdiRegisterCsv } from '@/features/mbdi/utils/export-register'
import { markAllMbdiNotificationsRead } from '@/features/mbdi/utils/notify'
import { isMbdiInitiativeOwner } from '@/features/mbdi/utils/ownership'
import { useMbdiLinkedEmployeeId } from '@/features/mbdi/utils/use-linked-employee-id'
import { repairOrphanedMbdiOwners } from '@/features/mbdi/utils/repair-owners'
import { MbdiStatusPill, MbdiTierPill, ProgressBar } from '@/features/mbdi/ui'
import { db } from '@/lib/firebase'
import {
  MBDI_STATUS_LABELS,
  MBDI_APPROVER_ROLES,
  taskProgress,
  type MbdiStatus,
  type MbdiInitiative,
} from '@/features/mbdi/types'

function displayProgress(ini: MbdiInitiative): number {
  if (ini.status === 'VALUE_CONFIRMED') return 100
  if (ini.status === 'COMPLETED' || ini.status === 'PERFORMANCE_CLAIMED') return 50
  if (ini.status === 'COMPLETION_CLAIMED') return Math.max(50, taskProgress(ini.tasks))
  return taskProgress(ini.tasks)
}

const fmtMoney = (n?: number) =>
  typeof n === 'number' ? `US$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'

export default function MbdiRegisterPage() {
  const router = useRouter()
  const store = useMbdiStore()
  const { user, hasAnyRole } = useAuthStore()
  const linkedEmployeeId = useMbdiLinkedEmployeeId()

  const isApprover = hasAnyRole([...MBDI_APPROVER_ROLES])

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MbdiStatus | 'ALL'>('ALL')
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MINE'>('ALL')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    store.fetchInitiatives()
    return () => store.cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    void markAllMbdiNotificationsRead(user.uid).catch((err) =>
      console.error('Failed to mark MBDI notifications read:', err)
    )
  }, [user?.uid])

  // One-shot: remap HR employee ids stored as ownerId to real app uids (e.g. Kganya / MBDI-2026-003)
  useEffect(() => {
    if (!isApprover || !user?.uid) return
    const flag = 'mbdi_owner_repair_v1'
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem(flag)) return
      if (typeof window !== 'undefined') sessionStorage.setItem(flag, '1')
    } catch {
      // sessionStorage unavailable
    }
    void repairOrphanedMbdiOwners(db)
      .then((result) => {
        if (result.repaired.length > 0) {
          console.info('[mbdi] repaired orphaned owners', result.repaired)
        }
      })
      .catch((err) => console.error('[mbdi] owner repair failed:', err))
  }, [isApprover, user?.uid])

  const handleDelete = async (ini: MbdiInitiative, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!user || !isApprover) return
    if (ini.stage2Payment || ini.stage3Payment) {
      toast.error('Cannot delete — Stage 2 or Stage 3 payment has already been posted to payroll.')
      return
    }
    const label = ini.mbdiNo || ini.title
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setDeletingId(ini.id)
    try {
      await store.deleteInitiative(ini, {
        uid: user.uid,
        name: user.displayName || user.email || 'Manager',
      })
      toast.success('Initiative deleted.')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete initiative.')
    } finally {
      setDeletingId(null)
    }
  }

  const isMine = (i: { ownerId?: string; ownerEmail?: string }) =>
    isMbdiInitiativeOwner(i, user, { employeeId: linkedEmployeeId })

  const scopedInitiatives = useMemo(() => {
    if (scopeFilter === 'MINE') return store.initiatives.filter(isMine)
    return store.initiatives
  }, [store.initiatives, scopeFilter, user, linkedEmployeeId])

  const filtered = useMemo(() => {
    let list = scopedInitiatives
    if (statusFilter !== 'ALL') list = list.filter((i) => i.status === statusFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          (i.mbdiNo || '').toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.ownerName.toLowerCase().includes(q)
      )
    }
    return list
  }, [scopedInitiatives, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const active = scopedInitiatives.filter((i) =>
      ['APPROVED', 'COMPLETION_CLAIMED', 'COMPLETED', 'PERFORMANCE_CLAIMED'].includes(i.status)
    ).length
    const awaiting = scopedInitiatives.filter((i) =>
      ['PENDING_APPROVAL', 'COMPLETION_CLAIMED', 'PERFORMANCE_CLAIMED'].includes(i.status)
    ).length
    const paidOut = scopedInitiatives.reduce(
      (sum, i) => sum + (i.stage2Payment?.amount || 0) + (i.stage3Payment?.amount || 0),
      0
    )
    const confirmed = scopedInitiatives.filter((i) => i.status === 'VALUE_CONFIRMED').length
    return { active, awaiting, paidOut, confirmed }
  }, [scopedInitiatives])

  const statCards = [
    {
      key: 'active',
      label: 'Active Initiatives',
      badge: 'LIVE',
      value: stats.active,
      icon: TrendingUp,
      iconCls: 'text-orange-500',
      chip: 'bg-orange-500/10',
      card: 'border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10',
      badgeCls: 'border-orange-400/40 text-orange-600 dark:text-orange-400',
      valueCls: 'text-orange-600 dark:text-orange-400',
    },
    {
      key: 'awaiting',
      label: 'Awaiting Review',
      badge: 'ACTION',
      value: stats.awaiting,
      icon: Hourglass,
      iconCls: 'text-amber-500',
      chip: 'bg-amber-500/10',
      card: 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10',
      badgeCls: 'border-amber-400/40 text-amber-600 dark:text-amber-400',
      valueCls: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'paid',
      label: 'Rewards Posted',
      badge: 'PAY',
      value: fmtMoney(stats.paidOut),
      icon: Wallet,
      iconCls: 'text-emerald-500',
      chip: 'bg-emerald-500/10',
      card: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10',
      badgeCls: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400',
      valueCls: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'confirmed',
      label: 'Value Confirmed',
      badge: 'DONE',
      value: stats.confirmed,
      icon: CheckCircle2,
      iconCls: 'text-red-500',
      chip: 'bg-red-500/10',
      card: 'border-red-500/20 bg-red-500/5 dark:bg-red-500/10',
      badgeCls: 'border-red-400/40 text-red-600 dark:text-red-400',
      valueCls: 'text-red-600 dark:text-red-400',
    },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
            <Rocket className="size-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">MBDI Register</h1>
            <p className="text-sm text-muted-foreground">
              Monetised Business Development Initiatives — propose, execute, and earn staged rewards
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isApprover && (
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-1.5"
              disabled={filtered.length === 0}
              onClick={() => {
                downloadMbdiRegisterCsv(filtered)
                toast.success(`Exported ${filtered.length} initiative${filtered.length === 1 ? '' : 's'} to CSV.`)
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Button className="w-full sm:w-auto gap-1.5" onClick={() => router.push('/mbdi/new')}>
            <Plus className="h-4 w-4" />
            New Initiative
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.key} className={cn('relative overflow-hidden shadow-sm', s.card)}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', s.chip)}>
                    <Icon className={cn('size-4', s.iconCls)} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-bold bg-transparent', s.badgeCls)}>
                    {s.badge}
                  </Badge>
                </div>
                <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', s.valueCls)}>
                  {store.loading ? '…' : s.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by MBDI no., initiative, or owner..."
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 shrink-0">
          {(['ALL', 'MINE'] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setScopeFilter(scope)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                scopeFilter === scope
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {scope === 'ALL' ? 'All' : 'Mine'}
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as MbdiStatus | 'ALL') || 'ALL')}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {(Object.keys(MBDI_STATUS_LABELS) as MbdiStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {MBDI_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
          <span className="text-xs text-muted-foreground font-medium">
            {filtered.length} initiative{filtered.length === 1 ? '' : 's'}
            {statusFilter !== 'ALL' ? ` · ${MBDI_STATUS_LABELS[statusFilter]}` : ''}
          </span>
        </div>
        {store.loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {scopedInitiatives.length === 0
              ? scopeFilter === 'MINE'
                ? 'You have no initiatives yet. Submit a business development proposal to get started.'
                : 'No initiatives in the register yet. Submit the first business development proposal.'
              : 'No initiatives match your filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                  <th className="text-left py-2.5 px-4 font-medium">MBDI No.</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Initiative</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Owner</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Started</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Tier</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Progress</th>
                  <th className="text-left py-2.5 pr-4 font-medium">Status</th>
                  <th className="text-left py-2.5 pr-4 font-medium">1st 50%</th>
                  <th className="text-left py-2.5 pr-4 font-medium">2nd 50%</th>
                  <th className="text-left py-2.5 px-4 font-medium">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ini) => {
                  const pct = displayProgress(ini)
                  return (
                    <tr
                      key={ini.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors border-l-4 border-l-transparent hover:border-l-red-500/60"
                      onClick={() => router.push(`/mbdi/${ini.id}`)}
                    >
                      <td className="py-3 px-4 font-mono text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                        {ini.mbdiNo || 'Pending'}
                      </td>
                      <td className="py-3 pr-4 min-w-48">
                        <p className="font-semibold line-clamp-2">{ini.title}</p>
                        {ini.benefitGenerated && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {ini.benefitGenerated}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-medium">{ini.ownerName}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{ini.startDate || '—'}</td>
                      <td className="py-3 pr-4">
                        {ini.tier ? <MbdiTierPill tier={ini.tier} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 min-w-[88px]">
                          <ProgressBar value={pct} className="w-16 h-1.5" />
                          <span className="text-xs font-bold tabular-nums text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <MbdiStatusPill status={ini.status} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs font-semibold text-teal-600 dark:text-teal-400">
                        {fmtMoney(ini.stage2Payment?.amount)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtMoney(ini.stage3Payment?.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:bg-red-500/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/mbdi/${ini.id}`)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isApprover && !ini.stage2Payment && !ini.stage3Payment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10"
                              disabled={deletingId === ini.id}
                              onClick={(e) => handleDelete(ini, e)}
                            >
                              {deletingId === ini.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {store.loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {scopedInitiatives.length === 0
                ? scopeFilter === 'MINE'
                  ? 'You have no initiatives yet.'
                  : 'No initiatives in the register yet.'
                : 'No initiatives match your filters.'}
            </CardContent>
          </Card>
        ) : (
          filtered.map((ini) => {
            const pct = displayProgress(ini)
            return (
              <Card
                key={ini.id}
                className="overflow-hidden shadow-sm border-l-4 border-l-red-500/70 cursor-pointer hover:border-red-500 transition-colors"
                onClick={() => router.push(`/mbdi/${ini.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                        {ini.mbdiNo || 'Pending'}
                      </p>
                      <p className="font-semibold text-sm line-clamp-2 mt-0.5">{ini.title}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <MbdiStatusPill status={ini.status} />
                      {isApprover && !ini.stage2Payment && !ini.stage3Payment && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10"
                          disabled={deletingId === ini.id}
                          onClick={(e) => handleDelete(ini, e)}
                        >
                          {deletingId === ini.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs border-y border-border/50 py-2">
                    <div>
                      <p className="text-muted-foreground">Owner</p>
                      <p className="font-medium">{ini.ownerName}</p>
                    </div>
                    <div className="text-right">
                      {ini.tier ? <MbdiTierPill tier={ini.tier} amount={ini.rewardAmount} /> : null}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-bold tabular-nums">{pct}%</span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>

                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-teal-600 dark:text-teal-400">1st {fmtMoney(ini.stage2Payment?.amount)}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">2nd {fmtMoney(ini.stage3Payment?.amount)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
