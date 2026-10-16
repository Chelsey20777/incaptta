'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useFinanceStore } from '@/stores/finance-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { generateAutoApprovalsReportPdf } from '@/features/accounting/utils/generateAutoApprovalsReportPdf'
import { generateAutoApprovalsReportExcel } from '@/features/accounting/utils/generateAutoApprovalsReportExcel'
import { generateAutoApprovalsReportCsv } from '@/features/accounting/utils/generateAutoApprovalsReportCsv'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  ShieldCheck, Clock, CalendarDays, CalendarRange, LayoutList,
  TrendingDown, ArrowLeft, Download, Search, ChevronDown, ChevronRight,
  FileText, FileSpreadsheet, Loader2
} from 'lucide-react'
import { resolveStaffName } from '@/lib/person-name'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const THRESHOLD = 300

type Granularity = 'daily' | 'weekly' | 'monthly'

function startOfDay(d: Date): Date {
  const n = new Date(d)
  n.setHours(0, 0, 0, 0)
  return n
}
function endOfDay(d: Date): Date {
  const n = new Date(d)
  n.setHours(23, 59, 59, 999)
  return n
}
function startOfWeek(d: Date): Date {
  const n = new Date(d)
  const day = n.getDay()
  const diff = (day === 0 ? 6 : day - 1)
  n.setDate(n.getDate() - diff)
  n.setHours(0, 0, 0, 0)
  return n
}
function endOfWeek(d: Date): Date {
  const n = startOfWeek(d)
  n.setDate(n.getDate() + 6)
  n.setHours(23, 59, 59, 999)
  return n
}
function startOfMonth(d: Date): Date {
  const n = new Date(d.getFullYear(), d.getMonth(), 1)
  n.setHours(0, 0, 0, 0)
  return n
}
function endOfMonth(d: Date): Date {
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  n.setHours(23, 59, 59, 999)
  return n
}
function isWithinInterval(d: Date, interval: { start: Date; end: Date }): boolean {
  return d >= interval.start && d <= interval.end
}
function getISOWeek(d: Date): number {
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1))
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
function formatDateLabel(d: Date, granularity: Granularity): string {
  if (granularity === 'daily') {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } else if (granularity === 'weekly') {
    const week = getISOWeek(d)
    const ws = startOfWeek(d)
    const we = endOfWeek(d)
    return `Week ${week} (${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
  } else {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
}

export default function AutoApprovalsPage() {
  const router = useRouter()
  const financeStore = useFinanceStore()
  const { user: authUser } = useAuthStore()
  const adminStore = useAdminStore()

  const [activeTab, setActiveTab] = useState<Granularity>('daily')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [isExporting, setIsExporting] = useState(false)
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const unsub = financeStore.fetchExpenses()
    return () => unsub()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  const getDate = useCallback((e: any): Date => {
    if (e.accountantApprovedAt?.toDate) return e.accountantApprovedAt.toDate()
    if (e.createdAt?.toDate) return e.createdAt.toDate()
    return new Date()
  }, [])

  const autoApprovedExpenses = useMemo(() => {
    return financeStore.expenses.filter((e: any) => {
      const amount = Number(e.amount || 0)
      const actionType = typeof e.managerApprovedBy === 'object' ? e.managerApprovedBy?.actionType : null
      return amount > 0 && (
        (actionType === 'POLICY_BYPASS_JOBCARD_UNDER_200' && amount < 200) ||
        (actionType === 'POLICY_BYPASS_UNDER_300' && amount < THRESHOLD) ||
        (typeof e.managerApprovedBy === 'string' && e.managerApprovedBy.includes('Auto-approved') && amount < THRESHOLD)
      )
    })
  }, [financeStore.expenses])

  const todayStats = useMemo(() => {
    const interval = { start: startOfDay(new Date()), end: endOfDay(new Date()) }
    const items = autoApprovedExpenses.filter((e: any) => isWithinInterval(getDate(e), interval))
    return { count: items.length, total: items.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0), items }
  }, [autoApprovedExpenses, getDate])

  const weekStats = useMemo(() => {
    const interval = { start: startOfWeek(new Date()), end: endOfWeek(new Date()) }
    const items = autoApprovedExpenses.filter((e: any) => isWithinInterval(getDate(e), interval))
    return { count: items.length, total: items.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0), items }
  }, [autoApprovedExpenses, getDate])

  const monthStats = useMemo(() => {
    const interval = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) }
    const items = autoApprovedExpenses.filter((e: any) => isWithinInterval(getDate(e), interval))
    return { count: items.length, total: items.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0), items }
  }, [autoApprovedExpenses, getDate])

  const activeItems = useMemo(() => {
    const items = [...autoApprovedExpenses].sort((a, b) => getDate(b).getTime() - getDate(a).getTime())
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter((e: any) =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (
        (typeof e.accountantApprovedBy === 'object' ? e.accountantApprovedBy?.displayName : e.accountantApprovedBy) ||
        (typeof e.managerApprovedBy === 'object' ? e.managerApprovedBy?.displayName : e.managerApprovedBy) ||
        ''
      ).toLowerCase().includes(q)
    )
  }, [autoApprovedExpenses, searchQuery, getDate])

  const totalPages = useMemo(() =>
    Math.ceil(activeItems.length / itemsPerPage) || 1,
    [activeItems, itemsPerPage]
  )

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return activeItems.slice(start, start + itemsPerPage)
  }, [activeItems, currentPage, itemsPerPage])

  const paginatedGroups = useMemo(() => {
    const groups: { label: string; count: number; total: number; items: any[] }[] = []
    paginatedItems.forEach((e: any) => {
      const d = getDate(e)
      const label = formatDateLabel(d, activeTab)
      let g = groups.find(x => x.label === label)
      if (!g) {
        g = { label, count: 0, total: 0, items: [] }
        groups.push(g)
      }
      g.count++
      g.total += Math.abs(Number(e.amount || 0))
      g.items.push(e)
    })
    return groups
  }, [paginatedItems, activeTab, getDate])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (activeItems.length === 0) {
      toast.error('No auto-approved expenses to export')
      return
    }
    setIsExporting(true)
    try {
      let settings = adminStore.appSettings
      if (!settings || Object.keys(settings).length === 0) {
        const snap = await getDoc(doc(db, 'appSettings', 'general'))
        if (snap.exists()) settings = { id: snap.id, ...snap.data() }
      }
      const generatedBy = resolveStaffName({
        directoryUser: (adminStore.users || []).find(
          (u: any) => u.id === authUser?.uid || u.uid === authUser?.uid
        ),
        authDisplayName: authUser?.displayName,
      })
      if (format === 'pdf') {
        await generateAutoApprovalsReportPdf(
          activeItems,
          activeTab,
          searchQuery,
          settings as any,
          generatedBy
        )
      } else if (format === 'excel') {
        await generateAutoApprovalsReportExcel(
          activeItems,
          activeTab,
          searchQuery,
          settings as any,
          generatedBy
        )
      } else {
        await generateAutoApprovalsReportCsv(
          activeItems,
          activeTab,
          searchQuery,
          settings as any,
          generatedBy
        )
      }
      toast.success(`Audit ${format.toUpperCase()} downloaded`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || `Failed to generate ${format.toUpperCase()}`)
    } finally {
      setIsExporting(false)
    }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

  const formatDateTime = (e: any) => {
    const d = getDate(e)
    return d.toLocaleDateString('en-US', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const getCategoryLabel = (e: any) => {
    const cat = String(e.category || e.title || 'Opex').trim()
    if (cat.toLowerCase() === 'job-card-expense' || cat.toLowerCase() === 'job card expense') return 'Ad-hoc'
    return cat.replace(/-/g, ' ')
  }

  const groupItemsByParent = useCallback((items: any[]) => {
    const parents: Record<string, { key: string; label: string; items: any[]; total: number }> = {}
    
    items.forEach((item) => {
      let key = 'standalone-' + item.id
      let label = ''
      
      if (item.sourceJobId) {
        key = 'jobcard-' + item.sourceJobId
        const match = String(item.description || '').match(/Job Card\s+([^\s-]+)/i)
        const jobNo = match ? match[1] : item.sourceJobId.substring(0, 8)
        label = `Job Card #${jobNo}`
      } else if (item.payrollId) {
        key = 'payroll-' + item.payrollId
        label = `Payroll Record`
      } else if (item.project) {
        key = 'project-' + item.project
        label = `Project: ${item.project}`
      }
      
      if (key.startsWith('standalone-')) {
        parents[key] = {
          key,
          label: '',
          items: [item],
          total: Math.abs(Number(item.amount || 0))
        }
      } else {
        if (!parents[key]) {
          parents[key] = {
            key,
            label,
            items: [],
            total: 0
          }
        }
        parents[key].items.push(item)
        parents[key].total += Math.abs(Number(item.amount || 0))
      }
    })
    
    return Object.values(parents)
  }, [])

  const under300Label = '\u003C $300'

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <ShieldCheck className="size-6 text-amber-500" />
              Auto-Approvals Audit Trail
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Job-card ad-hoc expenses under <span className="font-bold text-amber-500">$200</span> and other eligible Opex under $300 — no manager sign-off required
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={isExporting || financeStore.loading || activeItems.length === 0}
                className="h-10 lg:h-9 text-xs font-semibold gap-1.5 flex items-center shrink-0 border-amber-500/30 hover:bg-amber-500/10 text-foreground"
              />
            }
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin text-amber-500" />
            ) : (
              <Download className="size-4 text-amber-500" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => void handleExport('pdf')}
              disabled={isExporting}
              className="gap-2 text-xs cursor-pointer"
            >
              <FileText className="size-3.5 text-red-500" />
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleExport('excel')}
              disabled={isExporting}
              className="gap-2 text-xs cursor-pointer"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleExport('csv')}
              disabled={isExporting}
              className="gap-2 text-xs cursor-pointer"
            >
              <FileSpreadsheet className="size-3.5 text-blue-500" />
              CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="relative overflow-hidden border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock className="size-4 text-amber-500" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold border-amber-400/40 text-amber-600 dark:text-amber-400">
                TODAY
              </Badge>
            </div>
            <p className="text-3xl font-black tabular-nums text-foreground">
              {formatCurrency(todayStats.total)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {todayStats.count} transaction{todayStats.count !== 1 ? 's' : ''} auto-approved
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <CalendarDays className="size-4 text-blue-500" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold border-blue-400/40 text-blue-600 dark:text-blue-400">
                THIS WEEK
              </Badge>
            </div>
            <p className="text-3xl font-black tabular-nums text-foreground">
              {formatCurrency(weekStats.total)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {weekStats.count} transaction{weekStats.count !== 1 ? 's' : ''} auto-approved
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <CalendarRange className="size-4 text-emerald-500" />
              </div>
              <Badge variant="outline" className="text-[10px] font-bold border-emerald-400/40 text-emerald-600 dark:text-emerald-400">
                THIS MONTH
              </Badge>
            </div>
            <p className="text-3xl font-black tabular-nums text-foreground">
              {formatCurrency(monthStats.total)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {monthStats.count} transaction{monthStats.count !== 1 ? 's' : ''} auto-approved
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <LayoutList className="size-4 text-muted-foreground" />
                Transaction Log
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                All auto-approved expenses grouped by period
              </CardDescription>
            </div>

            <div className="flex items-center bg-muted/50 rounded-lg p-1 gap-0.5 border border-border/50">
              {(['daily', 'weekly', 'monthly'] as Granularity[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                    activeTab === tab
                      ? 'bg-background shadow-sm text-foreground border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by description, category or approver…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-4 py-2 text-sm bg-muted/50 border border-border/60 rounded-lg outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 transition-all"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {financeStore.loading ? (
            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <div className="size-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <p className="text-sm">Loading audit data…</p>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <TrendingDown className="size-10 opacity-30" />
              <p className="text-sm font-medium">No auto-approved expenses found</p>
              <p className="text-xs opacity-70">
                Verified auto-approved expenses that bypass manager approval will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {paginatedGroups.map((group, gi) => (
                <div key={gi}>
                  <div className="flex items-center justify-between py-2 border-b border-dashed border-border/50">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">
                        {group.count} item{group.count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                        {formatCurrency(group.total)}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border/40">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/40">
                          <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Date & Time
                          </th>
                          <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Type
                          </th>
                          <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Description
                          </th>
                          <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Approved By
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Amount
                          </th>
                          <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Rule
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {groupItemsByParent(group.items).map((parentGroup) => {
                          const isStandalone = !parentGroup.label
                          const isExpanded = expandedParents[parentGroup.key] ?? false
                          
                          if (isStandalone) {
                            const item = parentGroup.items[0]
                            const actApproved = typeof item.accountantApprovedBy === 'object'
                              ? item.accountantApprovedBy.displayName
                              : (item.accountantApprovedBy || '—')
                              
                            const ruleLabel = typeof item.accountantApprovedBy === 'object' && item.accountantApprovedBy.actionType === 'WORKFLOW_BYPASS_JOBCARD'
                              ? 'Workflow Bypass'
                              : typeof item.managerApprovedBy === 'object' && item.managerApprovedBy.actionType === 'POLICY_BYPASS_JOBCARD_UNDER_200'
                              ? 'Auto-Bypass (< $200)'
                              : typeof item.managerApprovedBy === 'object' && item.managerApprovedBy.actionType === 'POLICY_BYPASS_UNDER_300'
                              ? 'Auto-Bypass (< $300)'
                              : '< $300'
                            
                            return (
                              <tr key={item.id || item.title} className="hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                  {formatDateTime(item)}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    String(item.category || '').toLowerCase().includes('job-card') || String(item.category || '').toLowerCase().includes('job card')
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                      : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                  }`}>
                                    {getCategoryLabel(item)}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-foreground max-w-[200px] truncate" title={item.description || item.title || '—'}>
                                  {item.description || item.title || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {actApproved}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                                  {formatCurrency(Math.abs(Number(item.amount || 0)))}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                                    ruleLabel.includes('Bypass')
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  }`}>
                                    <ShieldCheck className="size-3" /> {ruleLabel}
                                  </span>
                                </td>
                              </tr>
                            )
                          }
                          
                          return (
                            <React.Fragment key={parentGroup.key}>
                              <tr 
                                className="bg-muted/10 hover:bg-muted/30 cursor-pointer font-medium border-l-4 border-l-brand-primary transition-colors"
                                onClick={() => setExpandedParents(p => ({ ...p, [parentGroup.key]: !isExpanded }))}
                              >
                                <td className="px-3 py-2.5 flex items-center gap-2 whitespace-nowrap text-foreground font-bold">
                                  {isExpanded ? <ChevronDown className="size-4 text-brand-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                                  {parentGroup.label}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs font-semibold">
                                  Grouped Expense
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs italic">
                                  {parentGroup.items.length} line items (click to {isExpanded ? 'collapse' : 'expand'})
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                                  Multiple Actors
                                </td>
                                <td className="px-3 py-2.5 text-right font-black text-amber-600 dark:text-amber-400 tabular-nums">
                                  {formatCurrency(parentGroup.total)}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/10 text-brand-primary whitespace-nowrap">
                                    <ShieldCheck className="size-3" /> Multi-Item Rule
                                  </span>
                                </td>
                              </tr>
                              
                              {isExpanded && parentGroup.items.map((item: any, ci: number) => {
                                const actApproved = typeof item.accountantApprovedBy === 'object'
                                  ? item.accountantApprovedBy.displayName
                                  : (item.accountantApprovedBy || '—')
                                  
                                const ruleLabel = typeof item.accountantApprovedBy === 'object' && item.accountantApprovedBy.actionType === 'WORKFLOW_BYPASS_JOBCARD'
                                  ? 'Workflow Bypass'
                                  : typeof item.managerApprovedBy === 'object' && item.managerApprovedBy.actionType === 'POLICY_BYPASS_JOBCARD_UNDER_200'
                                  ? 'Auto-Bypass (< $200)'
                                  : typeof item.managerApprovedBy === 'object' && item.managerApprovedBy.actionType === 'POLICY_BYPASS_UNDER_300'
                                  ? 'Auto-Bypass (< $300)'
                                  : '< $300'

                                return (
                                  <tr key={ci} className="hover:bg-muted/10 bg-muted/5 transition-colors border-l-2 border-l-muted">
                                    <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground pl-8 whitespace-nowrap">
                                      {formatDateTime(item)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                                        String(item.category || '').toLowerCase().includes('job-card') || String(item.category || '').toLowerCase().includes('job card')
                                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                      }`}>
                                        {getCategoryLabel(item)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-foreground max-w-[200px] truncate text-xs" title={item.description || item.title || '—'}>
                                      {item.description || item.title || '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                                      {actApproved}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-medium text-amber-600 dark:text-amber-400 tabular-nums text-xs">
                                      {formatCurrency(Math.abs(Number(item.amount || 0)))}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${
                                        ruleLabel.includes('Bypass')
                                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      }`}>
                                        {ruleLabel}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!financeStore.loading && activeItems.length > 0 && (
            <div className="flex items-center justify-between px-2 py-4 border-t border-border/30 flex-wrap gap-4 mt-6">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                Showing{' '}
                <span className="font-bold text-foreground">
                  {activeItems.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-foreground">
                  {Math.min(currentPage * itemsPerPage, activeItems.length)}
                </span>{' '}
                of{' '}
                <span className="font-bold text-foreground">{activeItems.length}</span>{' '}
                entries
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
                    className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-amber-500 focus:outline-none cursor-pointer text-foreground"
                  >
                    <option value={20}>20 per view</option>
                    <option value={50}>50 per view</option>
                    <option value={100}>100 per view</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                  >
                    &laquo;
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    &lsaquo;
                  </Button>

                  <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                    Page <span className="font-bold text-foreground">{currentPage}</span> of{' '}
                    <span className="font-bold text-foreground">{totalPages}</span>
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    &rsaquo;
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    &raquo;
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
