'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useFinanceStore } from '@/stores/finance-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { generateLedgerReportPdf } from '@/features/fundTransfers/utils/generateLedgerReportPdf'
import { generateLedgerReportExcel } from '@/features/fundTransfers/utils/generateLedgerReportExcel'
import { generateLedgerReportCsv } from '@/features/fundTransfers/utils/generateLedgerReportCsv'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, Filter, X, RefreshCw, Calendar, ChevronDown, ChevronRight,
  Briefcase, Wallet, Package, Layers, FileText, FileSpreadsheet, Loader2
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, formatZar, formatAccountMoney, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { resolveStaffName } from '@/lib/person-name'

// ---- Presentation helpers -------------------------------------------------

const ACCOUNT_META: Record<string, { label: string; pill: string; text: string; accent: string }> = {
  BANK: { label: 'Bank', pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', text: 'text-amber-500', accent: 'border-amber-500/30' },
  CASH: { label: 'Cash', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', text: 'text-emerald-500', accent: 'border-emerald-500/30' },
  ECOCASH: { label: 'EcoCash', pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', text: 'text-orange-500', accent: 'border-orange-500/30' },
  IRD: { label: 'R1', pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', text: 'text-red-500', accent: 'border-red-500/30' },
  SALARIES: { label: 'Salaries', pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', text: 'text-violet-500', accent: 'border-violet-500/30' },
  RESERVE: { label: 'Reserve Account', pill: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20', text: 'text-sky-500', accent: 'border-sky-500/30' },
}

const TYPE_META: Record<string, { pill: string }> = {
  EXPENSE: { pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  INCOME: { pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  TRANSFER: { pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  TOPUP: { pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  LOAN_RECEIPT: { pill: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  LOAN_REPAYMENT: { pill: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
}

function accountMeta(account?: string) {
  const key = String(account || '').toUpperCase()
  return ACCOUNT_META[key] || {
    label: key || '—',
    pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    text: 'text-slate-500',
    accent: 'border-slate-500/30',
  }
}

function typePill(type?: string) {
  return TYPE_META[String(type || '').toUpperCase()]?.pill
    || 'bg-muted text-muted-foreground border-border'
}

function AccountPill({ account }: { account?: string }) {
  const m = accountMeta(account)
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', m.pill)}>
      {m.label}
    </span>
  )
}

function TypePill({ type }: { type?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', typePill(type))}>
      {type || '—'}
    </span>
  )
}

type ParentKind = 'jobcard' | 'salary' | 'cogs' | 'standalone'
interface ParentGroup {
  key: string
  label: string
  kind: ParentKind
  items: any[]
  total: number
}
interface DateGroup {
  key: string
  label: string
  items: any[]
  net: number
  parents: ParentGroup[]
}

function toDate(v: any): Date | null {
  if (!v) return null
  if (typeof v?.toDate === 'function') return v.toDate()
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function entryDate(e: any): Date {
  return toDate(e.createdAt) || toDate(e.date) || new Date(0)
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(d: Date): string {
  if (!d.getTime()) return 'Undated'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function parsePeriod(s: string) {
  const m = String(s || '').match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : null
}

function isCogs(item: any, category: string, text: string) {
  return item.type === 'COST_OF_SALES' ||
    String(item.originalType || '').toUpperCase() === 'COST_OF_SALES' ||
    category.includes('cost of sales') ||
    category.includes('cogs') ||
    /^cogs\b/i.test(text)
}

function groupParents(items: any[]): ParentGroup[] {
  const order: string[] = []
  const map: Record<string, ParentGroup> = {}

  items.forEach((item) => {
    let key = 'standalone-' + item.id
    let label = ''
    let kind: ParentKind = 'standalone'
    const text = item.description || item.title || ''
    const category = String(item.category || '').toLowerCase()

    if (item.sourceJobId) {
      const m = String(text).match(/Job Card\s+([A-Za-z0-9-]+)/i)
      const jobNo = m ? m[1] : String(item.sourceJobId).substring(0, 8)
      key = 'jobcard-' + item.sourceJobId
      label = `Job Card #${jobNo}`
      kind = 'jobcard'
    } else if (item.payrollId || category.includes('salar') || category.includes('statutory') || /^salary\b/i.test(text)) {
      const period = parsePeriod(text)
      if (period) {
        key = 'salary-' + period
        label = `Salaries — ${period}`
        kind = 'salary'
      } else if (item.payrollId) {
        key = 'payroll-' + item.payrollId
        label = 'Payroll Batch'
        kind = 'salary'
      }
    } else if (isCogs(item, category, text)) {
      key = 'cogs'
      label = 'COGS'
      kind = 'cogs'
    }

    if (!map[key]) {
      map[key] = { key, label, kind, items: [], total: 0 }
      order.push(key)
    }
    map[key].items.push(item)
    map[key].total += Number(item.amount || 0)
  })

  return order.map((k) => map[k])
}

function groupByDate(entries: any[]): DateGroup[] {
  const groups: DateGroup[] = []
  const index: Record<string, DateGroup> = {}

  entries.forEach((e) => {
    const d = entryDate(e)
    const key = dayKey(d)
    if (!index[key]) {
      const g: DateGroup = { key, label: dayLabel(d), items: [], net: 0, parents: [] }
      index[key] = g
      groups.push(g)
    }
    index[key].items.push(e)
    index[key].net += Number(e.amount || 0)
  })

  groups.forEach((g) => { g.parents = groupParents(g.items) })
  return groups
}

const PARENT_META: Record<Exclude<ParentKind, 'standalone'>, { icon: React.ElementType; pill: string; accent: string; iconCls: string }> = {
  jobcard: { icon: Briefcase, pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', accent: 'border-l-blue-500', iconCls: 'text-blue-500' },
  salary: { icon: Wallet, pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', accent: 'border-l-violet-500', iconCls: 'text-violet-500' },
  cogs: { icon: Package, pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', accent: 'border-l-orange-500', iconCls: 'text-orange-500' },
}

const TAB_LABEL: Record<string, string> = {
  all: 'All Accounts',
  bank: 'BANK',
  cash: 'CASH',
  ecocash: 'ECOCASH',
  ird: 'IRD',
  salaries: 'SALARIES',
  reserve: 'RESERVE',
}

export default function LedgerPage() {
  const {
    ledger,
    finalBalances,
    ledgerAnomalies,
    subscribeLedger,
    fetchHistoricalInventoryConsumption,
    loading
  } = useFinanceStore()
  const adminStore = useAdminStore()
  const { user: authUser } = useAuthStore()

  const formatTimestamp = (ts: any) => {
    if (!ts) return ''
    if (ts.toDate) return formatDate(ts.toDate())
    return formatDate(ts)
  }

  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [timeframe, setTimeframe] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({})
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'excel' | 'csv' | null>(null)

  const toggleParent = (key: string) =>
    setExpandedParents((p) => ({ ...p, [key]: !p[key] }))

  useEffect(() => {
    const unsubscribeLedger = subscribeLedger()
    fetchHistoricalInventoryConsumption()
    if (authUser?.uid) adminStore.fetchSettings(authUser.uid)
    return unsubscribeLedger
  }, [authUser?.uid])

  const refreshData = () => {
    // Ledger sources are live onSnapshot subscriptions; only the one-shot
    // historical inventory aggregate needs an explicit refresh.
    fetchHistoricalInventoryConsumption()
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, typeFilter, timeframe, dateFrom, dateTo, activeTab])

  const hasActiveFilters = useMemo(() => {
    return !!searchQuery || typeFilter !== 'all' || timeframe !== 'all' || !!dateFrom || !!dateTo
  }, [searchQuery, typeFilter, timeframe, dateFrom, dateTo])

  const resetFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setTimeframe('all')
    setDateFrom('')
    setDateTo('')
  }

  const filteredEntries = useMemo(() => {
    let baseEntries = ledger

    if (activeTab === 'bank') {
      baseEntries = ledger.filter(e => e.account === 'BANK').map(e => ({ ...e, balance: e.accountBalance }))
    } else if (activeTab === 'cash') {
      baseEntries = ledger.filter(e => e.account === 'CASH').map(e => ({ ...e, balance: e.accountBalance }))
    } else if (activeTab === 'ecocash') {
      baseEntries = ledger.filter(e => e.account === 'ECOCASH').map(e => ({ ...e, balance: e.accountBalance }))
    } else if (activeTab === 'ird') {
      baseEntries = ledger.filter(e => e.account === 'IRD').map(e => ({ ...e, balance: e.accountBalance }))
    } else if (activeTab === 'salaries') {
      baseEntries = ledger.filter(e => e.account === 'SALARIES').map(e => ({ ...e, balance: e.accountBalance }))
    } else if (activeTab === 'reserve') {
      baseEntries = ledger.filter(e => e.account === 'RESERVE').map(e => ({ ...e, balance: e.accountBalance }))
    } else {
      baseEntries = ledger.map(e => ({ ...e, balance: e.globalBalance }))
    }

    return baseEntries.filter(entry => {
      const q = searchQuery.toLowerCase()
      const searchMatch = !q || (entry.description || '').toLowerCase().includes(q)
      const typeMatch = typeFilter === 'all' || entry.type === typeFilter

      let timeMatch = true
      if (timeframe !== 'all') {
        const raw = entry.createdAt?.toDate?.() ?? new Date(entry.createdAt || 0)
        const now = new Date()

        if (timeframe === 'today') {
          timeMatch = raw.toDateString() === now.toDateString()
        } else if (timeframe === 'week') {
          const wk = new Date()
          wk.setDate(now.getDate() - 7)
          timeMatch = raw >= wk
        } else if (timeframe === 'month') {
          timeMatch = raw.getMonth() === now.getMonth() && raw.getFullYear() === now.getFullYear()
        } else if (timeframe === 'custom') {
          const from = dateFrom ? new Date(dateFrom) : null
          const to = dateTo ? new Date(dateTo + 'T23:59:59') : null
          if (from) timeMatch = raw >= from
          if (to) timeMatch = timeMatch && raw <= to
        }
      }

      return searchMatch && typeMatch && timeMatch
    })
  }, [ledger, activeTab, searchQuery, typeFilter, timeframe, dateFrom, dateTo])

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredEntries.slice(start, start + itemsPerPage)
  }, [filteredEntries, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage) || 1
  const dateGroups = useMemo(() => groupByDate(paginatedEntries), [paginatedEntries])

  const resolveCompanySettings = async () => {
    let currentSettings = adminStore.appSettings
    if (!currentSettings || Object.keys(currentSettings).length <= 1) {
      const snap = await getDoc(doc(db, 'appSettings', 'general'))
      if (snap.exists()) {
        currentSettings = { id: snap.id, ...snap.data() } as typeof currentSettings
      }
    }
    return currentSettings
  }

  const exportDateRange = () =>
    timeframe === 'custom' && (dateFrom || dateTo)
      ? { from: dateFrom || 'Start', to: dateTo || 'End' }
      : null

  const exportGeneratedBy = () =>
    resolveStaffName({
      directoryUser: (adminStore.users || []).find((u: any) => u.id === authUser?.uid || u.uid === authUser?.uid),
      authDisplayName: authUser?.displayName,
    })

  const handleDownloadPdf = async () => {
    if (filteredEntries.length === 0) {
      toast.error('No entries to export', { description: 'Adjust your filters and try again.' })
      return
    }
    setDownloadingFormat('pdf')
    try {
      const settings = await resolveCompanySettings()
      await generateLedgerReportPdf(
        filteredEntries,
        TAB_LABEL[activeTab] || 'All Accounts',
        exportDateRange(),
        settings as any,
        settings as any,
        exportGeneratedBy()
      )
      toast.success('Ledger Report Downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate report')
    } finally {
      setDownloadingFormat(null)
    }
  }

  const handleDownloadExcel = async () => {
    if (filteredEntries.length === 0) {
      toast.error('No entries to export', { description: 'Adjust your filters and try again.' })
      return
    }
    setDownloadingFormat('excel')
    try {
      const settings = await resolveCompanySettings()
      await generateLedgerReportExcel(
        filteredEntries,
        TAB_LABEL[activeTab] || 'All Accounts',
        exportDateRange(),
        settings as any,
        exportGeneratedBy()
      )
      toast.success('Ledger Excel Downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate Excel')
    } finally {
      setDownloadingFormat(null)
    }
  }

  const handleDownloadCsv = async () => {
    if (filteredEntries.length === 0) {
      toast.error('No entries to export', { description: 'Adjust your filters and try again.' })
      return
    }
    setDownloadingFormat('csv')
    try {
      const settings = await resolveCompanySettings()
      await generateLedgerReportCsv(
        filteredEntries,
        TAB_LABEL[activeTab] || 'All Accounts',
        exportDateRange(),
        settings as any,
        exportGeneratedBy()
      )
      toast.success('Ledger CSV Downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate CSV')
    } finally {
      setDownloadingFormat(null)
    }
  }

  const renderEntryRow = (entry: any, indented = false) => {
    const isPositive = entry.amount >= 0
    return (
      <tr
        key={entry.id}
        className={cn('border-b hover:bg-muted/30 transition-colors cursor-pointer', indented && 'bg-muted/5 border-l-2 border-l-border')}
        onClick={() => setSelectedEntry(entry)}
      >
        <td className={cn('p-3 text-xs whitespace-nowrap text-muted-foreground', indented && 'pl-8')}>
          {indented ? '' : entry.date}
        </td>
        <td className="p-3"><AccountPill account={entry.account} /></td>
        <td className={cn('p-3 text-sm text-foreground/90 max-w-md truncate', indented && 'text-muted-foreground')} title={entry.description}>
          {entry.description}
        </td>
        <td className="p-3"><TypePill type={entry.type} /></td>
        <td className={cn('p-3 text-right font-bold text-sm tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
          {isPositive ? '+' : '-'}{formatAccountMoney(entry.account, Math.abs(entry.amount || 0))}
        </td>
        <td className="p-3 text-right font-bold text-foreground tabular-nums">
          {formatAccountMoney(entry.account, entry.balance || 0)}
        </td>
      </tr>
    )
  }

  const renderParentRow = (dateKey: string, parent: ParentGroup) => {
    const meta = PARENT_META[parent.kind as Exclude<ParentKind, 'standalone'>]
    const Icon = meta.icon
    const expandKey = `${dateKey}::${parent.key}`
    const isExpanded = expandedParents[expandKey] ?? false
    const isPositive = parent.total >= 0

    return (
      <React.Fragment key={expandKey}>
        <tr
          className={cn('border-b bg-muted/10 hover:bg-muted/30 cursor-pointer font-medium border-l-4 transition-colors', meta.accent)}
          onClick={() => toggleParent(expandKey)}
        >
          <td className="p-3 text-sm font-bold text-foreground">
            <span className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
              <Icon className={cn('size-4 shrink-0', meta.iconCls)} />
              {parent.label}
            </span>
          </td>
          <td className="p-3">
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', meta.pill)}>
              {parent.items.length} item{parent.items.length !== 1 ? 's' : ''}
            </span>
          </td>
          <td className="p-3 text-xs italic text-muted-foreground">
            Click to {isExpanded ? 'collapse' : 'expand'}
          </td>
          <td className="p-3 text-xs text-muted-foreground">Grouped</td>
          <td className={cn('p-3 text-right font-black text-sm tabular-nums', isPositive ? 'text-emerald-500' : 'text-red-500')}>
            {isPositive ? '+' : '-'}{formatCurrency(Math.abs(parent.total))}
          </td>
          <td className="p-3" />
        </tr>
        {isExpanded && parent.items.map((entry) => renderEntryRow(entry, true))}
      </React.Fragment>
    )
  }

  const renderEntryCard = (entry: any, nested = false) => {
    const isPositive = entry.amount >= 0
    return (
      <Card
        key={entry.id}
        className={cn('p-4 space-y-3 shadow-sm cursor-pointer hover:border-brand-primary/20 transition-colors', nested && 'bg-muted/20 border-border/60')}
        onClick={() => setSelectedEntry(entry)}
      >
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{entry.date}</span>
          <TypePill type={entry.type} />
        </div>
        <div className="space-y-2 min-w-0">
          <AccountPill account={entry.account} />
          <p className="text-sm font-medium text-foreground leading-snug break-words">
            {entry.description}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t pt-3 border-border/50">
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
              Amount
            </span>
            <span
              className={cn(
                'mt-0.5 block text-base font-black tabular-nums leading-tight',
                isPositive ? 'text-emerald-500' : 'text-red-500'
              )}
            >
              {isPositive ? '+' : '-'}{formatAccountMoney(entry.account, Math.abs(entry.amount || 0))}
            </span>
          </div>
          <div className="min-w-0 text-right">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
              Balance
            </span>
            <span className="mt-0.5 block text-base font-bold tabular-nums text-foreground leading-tight">
              {formatAccountMoney(entry.account, entry.balance || 0)}
            </span>
          </div>
        </div>
      </Card>
    )
  }

  const renderParentCard = (dateKey: string, parent: ParentGroup) => {
    const meta = PARENT_META[parent.kind as Exclude<ParentKind, 'standalone'>]
    const Icon = meta.icon
    const expandKey = `${dateKey}::${parent.key}`
    const isExpanded = expandedParents[expandKey] ?? false
    const isPositive = parent.total >= 0

    return (
      <div key={expandKey} className={cn('rounded-xl border-l-4 border bg-card shadow-sm overflow-hidden', meta.accent)}>
        <button type="button" className="w-full flex items-center justify-between gap-2 p-4 text-left" onClick={() => toggleParent(expandKey)}>
          <span className="flex items-center gap-2 min-w-0">
            {isExpanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
            <Icon className={cn('size-4 shrink-0', meta.iconCls)} />
            <span className="min-w-0">
              <span className="block font-bold text-sm truncate">{parent.label}</span>
              <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold mt-0.5', meta.pill)}>
                {parent.items.length} item{parent.items.length !== 1 ? 's' : ''}
              </span>
            </span>
          </span>
          <span className={cn('text-sm font-mono font-black shrink-0', isPositive ? 'text-emerald-500' : 'text-red-500')}>
            {isPositive ? '+' : '-'}{formatCurrency(Math.abs(parent.total))}
          </span>
        </button>
        {isExpanded && (
          <div className="space-y-3 px-3 pb-3">
            {parent.items.map((entry) => renderEntryCard(entry, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Ledger Records</h2>
          <p className="text-muted-foreground">Historical transaction log for all accounts.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="border-dashed w-full sm:w-auto"
                  disabled={!!downloadingFormat}
                />
              }
            >
              {downloadingFormat ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Export
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onClick={handleDownloadPdf} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" />
                <span>PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadExcel} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span>Excel</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadCsv} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span>CSV</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={refreshData} className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative w-full sm:min-w-[240px] sm:flex-1 md:flex-initial">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search description..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="flex-1 sm:w-[170px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="EXPENSE">Expense</SelectItem>
              <SelectItem value="INCOME">Income</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="TOPUP">Top-up</SelectItem>
              <SelectItem value="LOAN_RECEIPT">Loan receipt</SelectItem>
              <SelectItem value="LOAN_REPAYMENT">Loan repayment</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className={cn('shrink-0', showFilters ? 'bg-muted' : '')}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            <span className="sm:hidden">Filters</span>
            <span className="hidden sm:inline">More Filters</span>
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="icon" className="shrink-0 sm:hidden" onClick={resetFilters} title="Reset filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={resetFilters}>
            <X className="mr-2 h-4 w-4" />
            Reset
          </Button>
        )}

        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {filteredEntries.length} result{filteredEntries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {showFilters && (
        <Card className="bg-muted/20 border-muted">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground block">Timeframe</label>
              <Select value={timeframe} onValueChange={(v) => v && setTimeframe(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Past 7 Days</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {timeframe === 'custom' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground block">From</label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input type="date" className="pl-8" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground block">To</label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input type="date" className="pl-8" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data-quality warnings: entries excluded or unassignable to a real account */}
      {!loading && (ledgerAnomalies.unknownAccountCount > 0 || ledgerAnomalies.nonUsdCount > 0 || ledgerAnomalies.legacyTransferCount > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-bold uppercase tracking-wide">Ledger data warnings</p>
          {ledgerAnomalies.unknownAccountCount > 0 && (
            <p>{ledgerAnomalies.unknownAccountCount} entr{ledgerAnomalies.unknownAccountCount === 1 ? 'y' : 'ies'} totaling {formatCurrency(ledgerAnomalies.unknownAccountTotal)} have an unrecognized payment method and are not counted in any account balance above.</p>
          )}
          {ledgerAnomalies.nonUsdCount > 0 && (
            <p>{ledgerAnomalies.nonUsdCount} approved expense{ledgerAnomalies.nonUsdCount === 1 ? '' : 's'} in a non-USD currency {ledgerAnomalies.nonUsdCount === 1 ? 'is' : 'are'} excluded from balances (no FX conversion).</p>
          )}
          {ledgerAnomalies.legacyTransferCount > 0 && (
            <p>{ledgerAnomalies.legacyTransferCount} legacy fund transfer{ledgerAnomalies.legacyTransferCount === 1 ? '' : 's'} without an approval status {ledgerAnomalies.legacyTransferCount === 1 ? 'is' : 'are'} excluded from balances.</p>
          )}
        </div>
      )}

      {/* Account filter chips — scrollable on mobile so balances never overlap */}
      <div className="-mx-1 px-1">
        <div
          role="tablist"
          aria-label="Filter by account"
          className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory no-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={cn(
              'min-w-[8.75rem] shrink-0 snap-start rounded-xl border px-3.5 py-2.5 text-left transition-colors',
              activeTab === 'all'
                ? 'bg-background border-primary/40 ring-1 ring-primary/30 shadow-sm'
                : 'bg-card/80 border-border/60 hover:bg-muted/40'
            )}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              All Entries
            </span>
            <span className="mt-1 block text-sm font-black tabular-nums text-foreground leading-none">
              Total Ledger
            </span>
          </button>

          {([
            { value: 'bank', key: 'BANK' },
            { value: 'cash', key: 'CASH' },
            { value: 'ecocash', key: 'ECOCASH' },
            { value: 'ird', key: 'IRD' },
            { value: 'salaries', key: 'SALARIES' },
            { value: 'reserve', key: 'RESERVE' },
          ] as const).map((tab) => {
            const m = accountMeta(tab.key)
            const selected = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'min-w-[8.75rem] shrink-0 snap-start rounded-xl border px-3.5 py-2.5 text-left transition-colors border-l-4',
                  m.accent,
                  selected
                    ? 'bg-background ring-1 ring-primary/30 shadow-sm'
                    : 'bg-card/80 border-border/60 hover:bg-muted/40'
                )}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </span>
                <span className={cn('mt-1 block text-sm font-black tabular-nums leading-none', m.text)}>
                  {tab.key === 'IRD'
                    ? formatZar(finalBalances[tab.key] || 0)
                    : formatCurrency(finalBalances[tab.key] || 0)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop */}
      <Card className="hidden md:block bg-muted/10 dark:bg-card/5 backdrop-blur-sm border-muted shadow-md rounded-xl overflow-hidden">
        {!loading && dateGroups.length > 0 && (
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <Layers className="size-3.5" />
            Grouped by date · Salaries, Job Cards & COGS collapsible within each day
          </div>
        )}
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="text-left p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Account</th>
                  <th className="text-left p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="text-left p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="text-right p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="text-right p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-4"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-12 text-muted-foreground italic">
                      No ledger entries found.
                    </td>
                  </tr>
                ) : (
                  dateGroups.map((group) => (
                    <React.Fragment key={group.key}>
                      <tr className="bg-muted/20 border-b border-dashed border-border/60">
                        <td colSpan={4} className="px-3 py-2.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className={cn('px-3 py-2.5 text-right text-xs font-black tabular-nums', group.net >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                          {group.net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(group.net))}
                        </td>
                        <td className="px-3 py-2.5" />
                      </tr>
                      {group.parents.map((parent) =>
                        parent.kind === 'standalone'
                          ? renderEntryRow(parent.items[0])
                          : renderParentRow(group.key, parent)
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-card text-muted-foreground">
            No ledger entries found.
          </div>
        ) : (
          dateGroups.map((group) => (
            <div key={group.key} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{group.items.length} items</span>
                </div>
                <span className={cn('text-sm font-black tabular-nums shrink-0', group.net >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  {group.net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(group.net))}
                </span>
              </div>
              {group.parents.map((parent) =>
                parent.kind === 'standalone'
                  ? renderEntryCard(parent.items[0])
                  : renderParentCard(group.key, parent)
              )}
            </div>
          ))
        )}
      </div>

      {!loading && filteredEntries.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>
              {' '}to{' '}
              <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredEntries.length)}</span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{filteredEntries.length}</span>
              {' '}entries
            </div>

            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="bg-background border border-muted rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer text-foreground"
                >
                  <option value={20}>20 per view</option>
                  <option value={50}>50 per view</option>
                  <option value={100}>100 per view</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="First Page">&laquo;</Button>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} title="Previous Page">&lsaquo;</Button>
                <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                  Page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages}</span>
                </span>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} title="Next Page">&rsaquo;</Button>
                <Button variant="outline" size="icon" className="h-8 w-8 text-foreground" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Last Page">&raquo;</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-md bg-card border-border/80 text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Ledger Entry Details</span>
              {selectedEntry && <TypePill type={selectedEntry.type} />}
            </DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/50">
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Account & Date</span>
                  <div className="flex items-center gap-2 mt-1">
                    <AccountPill account={selectedEntry.account} />
                    <span className="text-sm text-muted-foreground">{selectedEntry.date}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Amount</span>
                  <span className={`text-base font-bold tabular-nums block mt-0.5 ${selectedEntry.amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {selectedEntry.amount >= 0 ? '+' : '-'}{formatAccountMoney(selectedEntry.account, Math.abs(selectedEntry.amount || 0))}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground block">Description</span>
                <p className="text-sm font-medium text-foreground">{selectedEntry.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                {selectedEntry.reference && (
                  <div>
                    <span className="text-muted-foreground block">Reference</span>
                    <span className="font-mono text-foreground font-medium block mt-0.5">{selectedEntry.reference}</span>
                  </div>
                )}
                {selectedEntry.category && (
                  <div>
                    <span className="text-muted-foreground block">Category</span>
                    <span className="text-foreground font-medium block mt-0.5 uppercase tracking-wide text-[10px]">{selectedEntry.category.replace('-', ' ')}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <span className="text-xs text-muted-foreground block uppercase font-medium">Audit Trail</span>

                {selectedEntry.type === 'EXPENSE' && (
                  <div className="grid grid-cols-2 gap-4 text-xs bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Accountant Approval</span>
                      {selectedEntry.accountantApprovedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{typeof selectedEntry.accountantApprovedBy === 'object' ? selectedEntry.accountantApprovedBy.displayName : selectedEntry.accountantApprovedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.accountantApprovedAt)}
                          </span>
                        </span>
                      ) : ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(selectedEntry.status) ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>System / Approved</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.createdAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">Pending</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Manager Approval</span>
                      {selectedEntry.managerApprovedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{typeof selectedEntry.managerApprovedBy === 'object' ? selectedEntry.managerApprovedBy.displayName : selectedEntry.managerApprovedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.managerApprovedAt)}
                          </span>
                        </span>
                      ) : ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(selectedEntry.status) ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>System / Approved</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.createdAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">Pending</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedEntry.type === 'TRANSFER' && (
                  <div className="grid grid-cols-2 gap-4 text-xs bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Initiated By</span>
                      <span className="text-foreground block mt-1">
                        {selectedEntry.initiatedByName || selectedEntry.initiatedByEmail ? (
                          <>
                            By: <strong>{selectedEntry.initiatedByName || selectedEntry.initiatedByEmail}</strong>
                            <span className="text-muted-foreground block text-[10px] mt-0.5">
                              {formatTimestamp(selectedEntry.createdAt)}
                            </span>
                          </>
                        ) : '—'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Accountant Initial</span>
                      {selectedEntry.accountantInitialedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{selectedEntry.accountantInitialedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.accountantInitialedAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">
                          {selectedEntry.status === 'COMPLETED' || selectedEntry.status === 'PENDING_MANAGER' ? 'System (Auto-approved)' : 'Pending'}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 space-y-1 pt-2 border-t border-border/50">
                      <span className="text-muted-foreground font-medium block">Manager Approval</span>
                      {selectedEntry.managerApprovedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{typeof selectedEntry.managerApprovedBy === 'object' ? selectedEntry.managerApprovedBy.displayName : selectedEntry.managerApprovedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.managerApprovedAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">Pending</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedEntry.type === 'TOPUP' && (
                  <div className="grid grid-cols-2 gap-4 text-xs bg-muted/20 p-3 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Accountant Initial</span>
                      {selectedEntry.accountantInitialedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{selectedEntry.accountantInitialedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.accountantInitialedAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">
                          {selectedEntry.status === 'COMPLETED' ? 'System (Auto-approved)' : 'Pending'}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Manager Approval</span>
                      {selectedEntry.managerApprovedBy ? (
                        <span className="text-foreground block mt-1">
                          By: <strong>{typeof selectedEntry.managerApprovedBy === 'object' ? selectedEntry.managerApprovedBy.displayName : selectedEntry.managerApprovedBy}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {formatTimestamp(selectedEntry.managerApprovedAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic block mt-1">Pending</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedEntry.type === 'INCOME' && (
                  <div className="bg-muted/20 p-3 rounded-lg border border-border/50 text-xs italic text-muted-foreground text-center">
                    Income entry from client payment. Approved automatically on transaction entry.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedEntry(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
