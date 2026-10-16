'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { db } from '@/lib/firebase'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'

type AuditSource = 'OPEX' | 'JOB_CARD_ADHOC' | 'ADMIN'

interface FinanceAuditLog {
  id: string
  source: AuditSource
  action: string
  createdAt: Date | null
  deletedByName: string
  deletedByEmail: string
  deletedVia: string
  description: string
  amount: number
  jobCardId?: string | null
  jobNumber?: string | null
  opexId?: string | null
  expenseId?: string | null
  snapshot: Record<string, any>
}

const AUDIT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'] as const
const FETCH_LIMIT = 150

function toDate(value: any): Date | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseAmountFromText(text?: string | null): number {
  if (!text) return 0
  const match = text.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (!match?.[1]) return 0
  return Number(match[1].replace(/,/g, '')) || 0
}

function parseJobNumberFromText(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/\bJC-\d{4}-\d+\b/i)
  return match ? match[0].toUpperCase() : null
}

function parseOpexIdFromText(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/operationalExpenses entry\s+([A-Za-z0-9]+)/i)
  return match?.[1] || null
}

function sourceBadgeLabel(source: AuditSource): string {
  if (source === 'OPEX') return 'OPEX'
  if (source === 'ADMIN') return 'Admin'
  return 'Adhoc'
}

const SOURCE_META: Record<
  AuditSource,
  { badge: string; rowAccent: string; chip: string; bar: string; amount: string }
> = {
  OPEX: {
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
    rowAccent: 'border-l-rose-500',
    chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    bar: 'bg-rose-500',
    amount: 'text-rose-600 dark:text-rose-400',
  },
  JOB_CARD_ADHOC: {
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25',
    rowAccent: 'border-l-sky-500',
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    bar: 'bg-sky-500',
    amount: 'text-sky-600 dark:text-sky-400',
  },
  ADMIN: {
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
    rowAccent: 'border-l-amber-500',
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    bar: 'bg-amber-500',
    amount: 'text-amber-700 dark:text-amber-400',
  },
}

const VIA_META: Record<string, string> = {
  OPEX_UI: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  REJECT: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  TRASH: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20',
  SAVE_DIFF: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  ADMIN_SCRIPT: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
}

function mapOpexDoc(id: string, data: any): FinanceAuditLog {
  const snapshot = data.expenseSnapshot || {}
  return {
    id,
    source: 'OPEX',
    action: data.action || 'OPEX_DELETED',
    createdAt: toDate(data.createdAt),
    deletedByName: data.deletedBy?.displayName || data.deletedBy?.email || 'Unknown',
    deletedByEmail: data.deletedBy?.email || '',
    deletedVia: data.deletedVia || 'OPEX_UI',
    description: snapshot.title || snapshot.description || 'Untitled OPEX',
    amount: Number(snapshot.amount || 0),
    opexId: data.opexId || null,
    jobCardId: snapshot.sourceJobId || null,
    expenseId: snapshot.sourceItemId || null,
    snapshot,
  }
}

function mapJobCardDoc(id: string, data: any): FinanceAuditLog {
  const snapshot = data.expenseSnapshot || {}
  return {
    id,
    source: 'JOB_CARD_ADHOC',
    action: data.action || 'ADHOC_EXPENSE_DELETED',
    createdAt: toDate(data.createdAt),
    deletedByName: data.deletedBy?.displayName || data.deletedBy?.email || 'Unknown',
    deletedByEmail: data.deletedBy?.email || '',
    deletedVia: data.deletedVia || 'REJECT',
    description: snapshot.description || 'Ad-hoc expense',
    amount: Number(snapshot.amount || 0),
    jobCardId: data.jobCardId || null,
    jobNumber: data.jobNumber || null,
    opexId: Array.isArray(data.opexIds) && data.opexIds[0] ? data.opexIds[0] : snapshot.opexId || null,
    expenseId: data.expenseId || null,
    snapshot,
  }
}

function mapAdminDoc(id: string, data: any): FinanceAuditLog {
  const description = data.description || data.action || 'Admin audit entry'
  const performer = data.performedByEmail || data.performedBy?.email || 'ADMIN_SCRIPT'
  const amount =
    Number(data.amount) ||
    Number(data.expenseSnapshot?.amount) ||
    parseAmountFromText(description)
  const opexId =
    data.opexId ||
    data.operationalExpenseId ||
    parseOpexIdFromText(description) ||
    null

  return {
    id,
    source: 'ADMIN',
    action: data.action || 'ADMIN_AUDIT',
    createdAt: toDate(data.createdAt),
    deletedByName: performer,
    deletedByEmail: performer.includes('@') ? performer : '',
    deletedVia: data.deletedVia || 'ADMIN_SCRIPT',
    description,
    amount,
    jobCardId: data.jobCardId || null,
    jobNumber: data.jobNumber || parseJobNumberFromText(description),
    opexId,
    expenseId: data.expenseId || data.sourceItemId || null,
    snapshot: {
      ...(data.expenseSnapshot || {}),
      rawDescription: description,
      performedByUid: data.performedByUid || data.performedBy?.uid || null,
      before: data.before || null,
      after: data.after || null,
    },
  }
}

export default function FinanceAuditLogsPage() {
  const authStore = useAuthStore()
  const canView = authStore.hasAnyRole([...AUDIT_ROLES] as any)

  const [logs, setLogs] = useState<FinanceAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'ALL' | AuditSource>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  const loadLogs = async () => {
    setLoading(true)
    try {
      const [opexSnap, jobSnap, adminSnap] = await Promise.all([
        getDocs(query(collection(db, 'opexAuditLogs'), orderBy('createdAt', 'desc'), limit(FETCH_LIMIT))),
        getDocs(query(collection(db, 'jobCardAuditLogs'), orderBy('createdAt', 'desc'), limit(FETCH_LIMIT))),
        getDocs(query(collection(db, 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(FETCH_LIMIT))),
      ])

      const merged = [
        ...opexSnap.docs.map((d) => mapOpexDoc(d.id, d.data())),
        ...jobSnap.docs.map((d) => mapJobCardDoc(d.id, d.data())),
        ...adminSnap.docs.map((d) => mapAdminDoc(d.id, d.data())),
      ].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))

      setLogs(merged)
    } catch (err: any) {
      console.error('[FinanceAuditLogs] Failed to load:', err)
      toast.error('Failed to load audit logs', { description: err?.message || 'Check Firestore indexes/rules' })
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) return
    loadLogs()
  }, [canView])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null

    return logs.filter((log) => {
      if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false
      if (from && (!log.createdAt || log.createdAt < from)) return false
      if (to && (!log.createdAt || log.createdAt > to)) return false
      if (!q) return true
      const haystack = [
        log.description,
        log.deletedByName,
        log.deletedByEmail,
        log.deletedVia,
        log.action,
        log.jobNumber,
        log.jobCardId,
        log.opexId,
        log.expenseId,
        log.snapshot?.category,
        log.snapshot?.paymentMethod,
        log.snapshot?.recipientName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [logs, searchQuery, sourceFilter, dateFrom, dateTo])

  const counts = useMemo(
    () => ({
      OPEX: logs.filter((l) => l.source === 'OPEX').length,
      JOB_CARD_ADHOC: logs.filter((l) => l.source === 'JOB_CARD_ADHOC').length,
      ADMIN: logs.filter((l) => l.source === 'ADMIN').length,
    }),
    [logs]
  )

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center px-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
          <ShieldAlert className="size-7 text-rose-500" />
        </div>
        <h3 className="text-lg font-semibold">Access Denied</h3>
        <p className="text-muted-foreground max-w-md">
          Only administrators, managers, and accountants can view finance deletion audit logs.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-amber-500/5 p-5 md:p-6">
        <div className="absolute -right-8 -top-8 size-32 rounded-full bg-primary/15 blur-2xl" aria-hidden />
        <div className="absolute -bottom-10 left-1/3 size-28 rounded-full bg-sky-500/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
                <ClipboardList className="size-5" />
              </span>
              Audit Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Deletion and reversal history for OPEX, job-card ad-hoc expenses, and admin actions.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
            className="gap-2 self-start border-primary/25 bg-background/70 hover:bg-primary/10 hover:text-primary"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            ['OPEX', 'OPEX deletes', counts.OPEX],
            ['JOB_CARD_ADHOC', 'Adhoc deletes', counts.JOB_CARD_ADHOC],
            ['ADMIN', 'Admin actions', counts.ADMIN],
          ] as const).map(([source, label, value]) => {
            const meta = SOURCE_META[source]
            const active = sourceFilter === source
            return (
              <button
                key={source}
                type="button"
                onClick={() => setSourceFilter(active ? 'ALL' : source)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition-colors',
                  meta.chip,
                  active && 'ring-2 ring-offset-1 ring-offset-background ring-current/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</span>
                  <span className={cn('size-1.5 rounded-full', meta.bar)} />
                </div>
                <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
              </button>
            )
          })}
        </div>
      </div>

      <Card className="border-border/40 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-sky-500 to-amber-500" aria-hidden />
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-primary/70" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search description, actor, job, opex id…"
                className="pl-9 border-primary/15 focus-visible:ring-primary/30"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as 'ALL' | AuditSource)}>
              <SelectTrigger className="border-primary/15">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sources</SelectItem>
                <SelectItem value="OPEX">OPEX</SelectItem>
                <SelectItem value="JOB_CARD_ADHOC">Job Card Adhoc</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" className="border-primary/15" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" className="border-primary/15" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{' '}
            <span className="font-semibold text-foreground">{logs.length}</span> loaded entries
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-primary/20 bg-primary/5">
          <CardContent className="py-16 text-center text-muted-foreground">
            No audit log entries match your filters.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border/40 overflow-hidden bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5 hover:bg-primary/5">
                  <TableHead className="w-10" />
                  <TableHead className="text-primary/80">When</TableHead>
                  <TableHead className="text-primary/80">Source</TableHead>
                  <TableHead className="text-primary/80">Description</TableHead>
                  <TableHead className="text-right text-primary/80">Amount</TableHead>
                  <TableHead className="text-primary/80">Deleted by</TableHead>
                  <TableHead className="text-primary/80">Via</TableHead>
                  <TableHead className="text-primary/80">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => {
                  const open = !!expandedIds[log.id]
                  const meta = SOURCE_META[log.source]
                  return (
                    <React.Fragment key={`${log.source}-${log.id}`}>
                      <TableRow
                        className={cn(
                          'cursor-pointer border-l-4 hover:bg-muted/30 transition-colors',
                          meta.rowAccent,
                          open && 'bg-muted/20'
                        )}
                        onClick={() => toggleExpanded(log.id)}
                      >
                        <TableCell>
                          {open ? (
                            <ChevronDown className="size-4 text-primary" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {log.createdAt ? formatDate(log.createdAt) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px] uppercase border', meta.badge)}>
                            {sourceBadgeLabel(log.source)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate font-medium">{log.description}</TableCell>
                        <TableCell className={cn('text-right font-mono text-sm font-semibold', meta.amount)}>
                          {formatCurrency(log.amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{log.deletedByName}</div>
                          {log.deletedByEmail && (
                            <div className="text-[11px] text-muted-foreground">{log.deletedByEmail}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-mono border',
                              VIA_META[log.deletedVia] || 'bg-muted text-muted-foreground border-border'
                            )}
                          >
                            {log.deletedVia}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.jobNumber || log.jobCardId ? (
                            log.jobCardId ? (
                              <Link
                                href={`/job-cards/${log.jobCardId}`}
                                className="text-primary font-medium hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {log.jobNumber || log.jobCardId.slice(0, 8)}
                              </Link>
                            ) : (
                              log.jobNumber
                            )
                          ) : log.opexId ? (
                            <span className="font-mono">{String(log.opexId).slice(0, 10)}</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className={cn('hover:bg-transparent', meta.rowAccent, 'border-l-4')}>
                          <TableCell colSpan={8} className="p-4 bg-gradient-to-r from-muted/40 to-transparent">
                            <AuditSnapshotDetail log={log} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((log) => {
              const open = !!expandedIds[log.id]
              const meta = SOURCE_META[log.source]
              return (
                <Card
                  key={`${log.source}-${log.id}`}
                  className={cn('border-border/40 overflow-hidden border-l-4 shadow-sm', meta.rowAccent)}
                >
                  <button
                    type="button"
                    className="w-full text-left p-4 space-y-2"
                    onClick={() => toggleExpanded(log.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={cn('text-[10px] uppercase border', meta.badge)}>
                        {sourceBadgeLabel(log.source)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.createdAt ? formatDate(log.createdAt) : '—'}
                      </span>
                    </div>
                    <div className="font-semibold">{log.description}</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={cn('font-mono font-semibold', meta.amount)}>
                        {formatCurrency(log.amount)}
                      </span>
                      <span className="text-muted-foreground">{log.deletedByName}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-border/40 p-4 bg-gradient-to-b from-muted/30 to-transparent">
                      <AuditSnapshotDetail log={log} />
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function AuditSnapshotDetail({ log }: { log: FinanceAuditLog }) {
  const snap = log.snapshot || {}
  const meta = SOURCE_META[log.source]
  const rows: Array<[string, React.ReactNode]> = [
    ['Action', log.action],
    ['Deleted via', log.deletedVia],
    ['Category', snap.category || '—'],
    ['Payment method', snap.paymentMethod || '—'],
    ['Status', snap.approvalStatus || snap.status || '—'],
    ['Recipient', snap.recipientName || '—'],
    ['Phone', snap.recipientPhone || '—'],
    ['Expense id', log.expenseId || '—'],
    ['OPEX id', log.opexId || snap.opexId || '—'],
    [
      'Job card',
      log.jobCardId ? (
        <Link href={`/job-cards/${log.jobCardId}`} className="text-primary hover:underline">
          {log.jobNumber || log.jobCardId}
        </Link>
      ) : (
        log.jobNumber || '—'
      ),
    ],
    [
      'Attachments',
      Array.isArray(snap.attachmentUrls) && snap.attachmentUrls.length > 0
        ? `${snap.attachmentUrls.length} file(s) removed`
        : 'None',
    ],
  ]

  return (
    <div className="space-y-3">
      <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider', meta.badge)}>
        <span className={cn('size-1.5 rounded-full', meta.bar)} />
        {sourceBadgeLabel(log.source)} detail
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border/30 bg-background/80 px-3 py-2 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-0.5 break-all">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
