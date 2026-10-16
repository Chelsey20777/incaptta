'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useFinanceStore } from '@/stores/finance-store'
import { useAdminStore } from '@/stores/admin-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { useUnifiedOperationalContext } from '@/hooks/use-unified-operational-context'
import { requestAnalyticsBrief, AiBriefError, type AiBriefErrorCode } from '@/lib/analytics-ai-service'
import type { AiBriefResponse } from '@/lib/types-analytics'
import { buildAiContext } from '@/lib/build-ai-context'
import { generateAnalyticsPdf } from '@/lib/generate-analytics-pdf'

// Lucide React Icons
import {
  Landmark, Smartphone, Banknote, ListChecks,
  AlertTriangle, Clock, CheckCircle2,
  Wallet, BarChart3, Download, Package, Loader2,
  MessageSquare
} from 'lucide-react'

// Custom Components
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

import ExpenseTrendChart from '@/features/analytics/components/ExpenseTrendChart'
import JobCardStatusChart from '@/features/analytics/components/JobCardStatusChart'
import DepartmentPerformanceChart from '@/features/analytics/components/DepartmentPerformanceChart'
import AiBriefPanel from '@/features/analytics/components/AiBriefPanel'
import AnalyticsChatPanel from '@/features/analytics/components/AnalyticsChatPanel'
import AnalyticsSkeleton from '@/features/analytics/components/AnalyticsSkeleton'

const PERIOD_OPTIONS = [7, 30, 90] as const

const ACCOUNT_DISPLAY: Record<string, { label: string; icon: any; colorHex: string }> = {
  BANK:      { label: 'Bank',                  icon: Landmark,   colorHex: '#eab308' },
  ECOCASH:   { label: 'EcoCash',               icon: Smartphone, colorHex: '#f97316' },
  CASH:      { label: 'Cash',                  icon: Banknote,   colorHex: '#10b981' },
  IRD:       { label: 'IRD Account',           icon: ListChecks, colorHex: '#ef4444' },
  SALARIES:  { label: 'Salaries Account',      icon: Landmark,   colorHex: '#10b981' },
  RESERVE: { label: 'Reserve Account',     icon: Wallet,     colorHex: '#0ea5e9' },
  CREDIT:    { label: 'Customer Credit',       icon: Wallet,     colorHex: '#3b82f6' },
  INVENTORY: { label: 'Inventory Consumption', icon: Package,    colorHex: '#8b5cf6' },
}

function getAccountMeta(key: string) {
  if (key === 'UNKNOWN' || key === 'INVENTORY') {
    return { label: 'Inventory Consumption', icon: Package, colorHex: '#8b5cf6' }
  }
  return ACCOUNT_DISPLAY[key] ?? { label: key, icon: Wallet, colorHex: '#6b7280' }
}

export default function Home() {
  const router = useRouter()
  const { user, loading: authLoading, getRoles } = useAuthStore()
  const { loading: permLoading, load: loadPermissions, canAccessModule } = usePermissionsStore()

  // ── Period & Overdue state ──────────────────────────────────────────
  const [selectedPeriod, setSelectedPeriod] = useState<number>(30)
  const resolvedOverdueDays = 14

  // ── Module access (drives which KPIs we may safely load/show) ───────
  const roles = getRoles()
  const canViewFinance = canAccessModule(roles, 'finance')
  const canViewInventory = canAccessModule(roles, 'inventory')
  const canViewJobCards = canAccessModule(roles, 'jobCards')

  // ── Stores ─────────────────────────────────────────────────────────
  const fetchJobCards = useJobCardsStore((state) => state.fetchJobCards)
  const jcCleanup = useJobCardsStore((state) => state.cleanup)
  const jcLoading = useJobCardsStore((state) => state.loading)

  const subscribeLedger = useFinanceStore((state) => state.subscribeLedger)
  const fetchLoanLenders = useFinanceStore((state) => state.fetchLoanLenders)
  const fetchHistoricalInventoryConsumption = useFinanceStore((state) => state.fetchHistoricalInventoryConsumption)
  const finLoading = useFinanceStore((state) => state.loading)
  const LIQUID_ACCOUNTS = useFinanceStore((state) => state.LIQUID_ACCOUNTS)
  const loanTransactions = useFinanceStore((state) => state.loanTransactions)

  const fetchAllAdmin = useAdminStore((state) => state.fetchAll)
  const appSettings = useAdminStore((state) => state.appSettings)

  const fetchInventoryItems = useInventoryStore((state) => state.fetchItems)

  // Ensure the role-permissions matrix is loaded before deciding what to fetch.
  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  // ── Hydration ──────────────────────────────────────────────────────
  // Only subscribe to finance/inventory collections when the role may read them.
  // TECHNICAL (and similar) roles are denied the full expenses list by Firestore,
  // so loading payments/transfers without expenses produces inflated balances.
  useEffect(() => {
    if (authLoading || !user || permLoading) return

    const unsubs: Array<(() => void) | undefined> = []

    if (canViewJobCards) {
      unsubs.push(fetchJobCards())
    }

    if (canViewFinance) {
      unsubs.push(subscribeLedger())
      unsubs.push(fetchLoanLenders())
      fetchHistoricalInventoryConsumption()
    }

    if (canViewInventory) {
      fetchInventoryItems()
    }

    fetchAllAdmin()

    return () => {
      unsubs.forEach((u) => u?.())
      jcCleanup()
    }
  }, [user, authLoading, permLoading, canViewFinance, canViewInventory, canViewJobCards])

  // ── Operational context payload ────────────────────────────────────
  const { context: payload } = useUnifiedOperationalContext(selectedPeriod, resolvedOverdueDays)

  // ── Primary Loading gate ───────────────────────────────────────────
  const isLoading = permLoading || jcLoading || (canViewFinance && finLoading)

  // ── Derived KPI values ──────────────────────────────────────────────
  const totalPendingApprovals = useMemo(() => {
    if (!payload) return 0
    const p = payload.operations
    const jobPending = canViewJobCards ? p.jobCards.pendingApprovals : 0
    const expensePending = canViewFinance
      ? p.expenses.pendingApprovalCount + p.expenses.pendingManagerCount
      : 0
    const transferPending = canViewFinance
      ? p.transfers.pendingAccountantCount + p.transfers.pendingManagerCount
      : 0
    const loanPending = canViewFinance
      ? loanTransactions.filter(t => ['PENDING_ACCOUNTANT', 'PENDING_MANAGER'].includes(t.status)).length
      : 0
    return jobPending + expensePending + transferPending + loanPending
  }, [payload, canViewJobCards, canViewFinance, loanTransactions])

  const totalTreasuryBalance = useMemo(() => {
    if (!payload) return 0
    const liquidSet = new Set(LIQUID_ACCOUNTS || ['BANK', 'CASH', 'ECOCASH', 'IRD'])
    return payload.operations.accountBalances
      .filter(a => liquidSet.has(a.account) && a.account !== 'IRD')
      .reduce((s, a) => s + a.balance, 0)
  }, [payload, LIQUID_ACCOUNTS])

  const lastUpdated = useMemo(() => {
    if (!payload) return ''
    return new Date(payload.generatedAt).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit'
    })
  }, [payload])

  // ── AI Brief state ──────────────────────────────────────────────────
  const [aiBrief, setAiBrief] = useState<AiBriefResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErrorCode, setAiErrorCode] = useState<AiBriefErrorCode | null>(null)
  const [aiErrorMsg, setAiErrorMsg] = useState<string | null>(null)

  const handleRefreshAnalysis = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiErrorCode(null)
    setAiErrorMsg(null)

    try {
      const slim = buildAiContext(payload)
      const briefRes = await requestAnalyticsBrief(slim)
      setAiBrief(briefRes)
    } catch (err) {
      if (err instanceof AiBriefError) {
        setAiErrorCode(err.code)
        setAiErrorMsg(err.message)
      } else {
        setAiErrorCode('UNKNOWN')
        setAiErrorMsg('An unexpected error occurred.')
      }
    } finally {
      setAiLoading(false)
    }
  }

  // ── PDF export ──────────────────────────────────────────────────────
  const [pdfExporting, setPdfExporting] = useState(false)

  const handleExportPdf = async () => {
    if (pdfExporting) return
    setPdfExporting(true)
    try {
      await generateAnalyticsPdf(
        payload,
        aiBrief,
        appSettings as any,
        appSettings as any
      )
    } catch (err) {
      console.error('Failed to export PDF:', err)
    } finally {
      setPdfExporting(false)
    }
  }

  // ── Route navigation handlers ───────────────────────────────────────
  const handleAccountClick = (account: string) => {
    switch (account) {
      case 'BANK':
      case 'CASH':
      case 'ECOCASH':
      case 'IRD':
        router.push('/ledger')
        break
      case 'SALARIES':
        router.push('/hr/salaries-account')
        break
      case 'RESERVE':
        router.push('/accounting/reserve-account')
        break
      case 'CREDIT':
        router.push('/crm/customers')
        break
      case 'INVENTORY':
        router.push('/inventory')
        break
      default:
        router.push('/ledger')
    }
  }

  // ── Formatters ──────────────────────────────────────────────────────
  const formatCurrency = (v: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
  }

  const formatAccountBalance = (account: string, v: number) => {
    if (String(account).toUpperCase() === 'IRD') {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(v)
    }
    return formatCurrency(v)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Unknown') return '—'
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  // Auth routing effect
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return null

  const isPayloadValid = !!payload?.operations
  const showSkeleton =
    isLoading &&
    (!isPayloadValid || (canViewJobCards && payload.operations.jobCards.total === 0 && jcLoading))

  return (
    <div className="space-y-8 pb-12 px-4 md:px-8">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="size-6 text-primary" />
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Operational overview · Last {selectedPeriod} days
              {lastUpdated && <span className="text-muted-foreground/60"> · updated {lastUpdated}</span>}
            </p>
          </div>
          <Link href="/chat" passHref legacyBehavior>
            <Button
              variant="outline"
              size="icon"
              className="size-9 rounded-lg border-muted hover:bg-muted/50 shrink-0"
              title="Chat Messages"
              aria-label="Chat Messages"
            >
              <MessageSquare className="size-5 text-muted-foreground hover:text-foreground transition-colors" />
            </Button>
          </Link>
        </div>

        {/* Period selector + export */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={selectedPeriod === p ? 'default' : 'ghost'}
                className="h-7 px-3 text-xs font-semibold"
                onClick={() => setSelectedPeriod(p)}
              >
                {p}d
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 gap-1.5 text-xs"
            disabled={pdfExporting || isLoading || !isPayloadValid}
            onClick={handleExportPdf}
          >
            <Download className={`size-3 ${pdfExporting ? 'animate-pulse' : ''}`} />
            {pdfExporting ? 'Exporting…' : 'Download Report'}
          </Button>
        </div>
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {showSkeleton ? (
        <AnalyticsSkeleton />
      ) : isPayloadValid ? (
        <>
          {/* ── Account Balances ───────────────────────────────────────────── */}
          {canViewFinance && (
          <div>
            <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
              Account Balances
            </h2>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {payload.operations.accountBalances
                .filter((acc) => !['INVENTORY', 'CREDIT', 'UNKNOWN'].includes(acc.account))
                .map((account) => {
                const meta = getAccountMeta(account.account)
                return (
                  <Card
                    key={account.account}
                    className="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
                    onClick={() => handleAccountClick(account.account)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle
                        className="text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: meta.colorHex }}
                      >
                        {meta.label}
                      </CardTitle>
                      <meta.icon
                        className="size-4"
                        style={{ color: meta.colorHex }}
                      />
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-xl font-bold ${
                          account.balance < 0 ? 'text-red-500' : ''
                        }`}
                      >
                        {formatAccountBalance(account.account, account.balance)}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                        {account.account === 'IRD' ? 'Current balance (ZAR)' : 'Current balance'}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Total treasury */}
            <div className="mt-3 text-right">
              <span className="text-xs text-muted-foreground">
                Total treasury position:
                <span className="font-bold text-foreground ml-1">{formatCurrency(totalTreasuryBalance)}</span>
              </span>
            </div>
          </div>
          )}

          {/* ── Inventory Snapshot ─────────────────────────────────────────── */}
          {canViewInventory && (
          <div>
            <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
              Inventory Snapshot
            </h2>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card
                className="bg-card/50 border cursor-pointer hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                onClick={() => router.push('/inventory')}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Total Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{payload.inventory.totalItems}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{payload.inventory.activeItems} active</p>
                </CardContent>
              </Card>
              <Card
                className="bg-card/50 border cursor-pointer hover:ring-2 hover:ring-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                onClick={() => router.push('/inventory')}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                    Low Stock
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{payload.inventory.lowStockCount}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Below reorder level</p>
                </CardContent>
              </Card>
              <Card
                className="bg-card/50 border cursor-pointer hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                onClick={() => router.push('/inventory')}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Stock Value (Selling)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(payload.inventory.totalInventoryValue)}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Selling price basis · {payload.inventory.totalItems} SKUs
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
          )}

          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div>
            <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
              Current Status
            </h2>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {/* Pending Approvals */}
              {(canViewJobCards || canViewFinance) && (
              <Card
                className="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
                onClick={() => router.push(canViewJobCards ? '/job-cards' : '/opex')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Pending Approvals
                  </CardTitle>
                  <Clock className="size-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalPendingApprovals}</div>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                    {canViewFinance
                      ? 'Across job cards, OPEX, transfers & loans'
                      : 'Across job cards'}
                  </p>
                  <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                    {canViewJobCards && (
                    <div className="flex justify-between">
                      <span>Job cards</span>
                      <span className="font-semibold">{payload.operations.jobCards.pendingApprovals}</span>
                    </div>
                    )}
                    {canViewFinance && (
                    <>
                    <div className="flex justify-between">
                      <span>Expenses</span>
                      <span className="font-semibold">
                        {payload.operations.expenses.pendingApprovalCount +
                          payload.operations.expenses.pendingManagerCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transfers</span>
                      <span className="font-semibold">
                        {payload.operations.transfers.pendingAccountantCount +
                          payload.operations.transfers.pendingManagerCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Business loans</span>
                      <span className="font-semibold">
                        {loanTransactions.filter(t => ['PENDING_ACCOUNTANT', 'PENDING_MANAGER'].includes(t.status)).length}
                      </span>
                    </div>
                    </>
                    )}
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Overdue Job Cards */}
              {canViewJobCards && (
              <Card
                className="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
                onClick={() => router.push('/job-cards')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      payload.operations.jobCards.overdueOpenCards.length > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    Overdue Job Cards
                  </CardTitle>
                  <AlertTriangle
                    className={`size-4 ${
                      payload.operations.jobCards.overdueOpenCards.length > 0
                        ? 'text-red-500'
                        : 'text-muted-foreground/40'
                    }`}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{payload.operations.jobCards.overdueOpenCards.length}</div>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                    Open &gt; {resolvedOverdueDays} days
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 mt-1.5 italic leading-tight">
                    Threshold: {resolvedOverdueDays}d default · confirm with management
                  </p>
                </CardContent>
              </Card>
              )}

              {/* Completed this period */}
              {canViewJobCards && (
              <Card
                className="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
                onClick={() => router.push('/job-cards')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Completed
                  </CardTitle>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{payload.operations.jobCards.completedInPeriod}</div>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                    Job cards in last {selectedPeriod} days
                  </p>
                  <p className="text-[9px] text-muted-foreground/50 mt-1.5 italic leading-tight">
                    Based on updatedAt (proxy — see Phase 1 note)
                  </p>
                </CardContent>
              </Card>
              )}

              {/* Approved expenses this period */}
              {canViewFinance && (
              <Card
                className="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
                onClick={() => router.push('/opex')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                    Approved Expenses
                  </CardTitle>
                  <Wallet className="size-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(payload.operations.expenses.approvedAmount)}</div>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                    Committed in last {selectedPeriod} days
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    Requested: {formatCurrency(payload.operations.expenses.totalAmount)}
                  </p>
                </CardContent>
              </Card>
              )}
            </div>
          </div>

          {/* ── Charts: Trend + Status Distribution ───────────────────────── */}
          <div className={`grid gap-6 ${canViewFinance && canViewJobCards ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
            {/* Expense Trend (2/3 width) */}
            {canViewFinance && (
            <Card className={canViewJobCards ? 'lg:col-span-2 border bg-card/50' : 'border bg-card/50'}>
              <CardHeader className="pb-3 border-b bg-muted/10">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Expense Trend — Last {selectedPeriod} Days
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 px-4 pb-4">
                <ExpenseTrendChart
                  trend={payload.operations.expenses.trend}
                  periodDays={selectedPeriod}
                />
              </CardContent>
            </Card>
            )}

            {/* Job Card Status (1/3 width) */}
            {canViewJobCards && (
            <Card className="border bg-card/50">
              <CardHeader className="pb-3 border-b bg-muted/10">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Job Card Status
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <JobCardStatusChart
                  byStatus={payload.operations.jobCards.byStatus}
                  total={payload.operations.jobCards.total}
                />
              </CardContent>
            </Card>
            )}
          </div>

          {/* ── Department Performance ─────────────────────────────────────── */}
          {canViewJobCards && (
          <Card className="border bg-card/50">
            <CardHeader className="pb-3 border-b bg-muted/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Department Performance
                </CardTitle>
                <span className="text-[10px] text-muted-foreground/60 italic">
                  By job card count (all time)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4 pb-4 px-4">
              <DepartmentPerformanceChart metrics={payload.operations.departmentMetrics} />

              {/* Completion rate table below the chart */}
              {payload.operations.departmentMetrics.some((d) => d.jobCardCount > 0) && (
                <div className="mt-6">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest mb-2">
                    Completion Rate by Department
                  </p>
                  <div className="space-y-1.5">
                    {payload.operations.departmentMetrics
                      .filter((m) => m.jobCardCount > 0)
                      .map((d) => (
                        <div
                          key={d.departmentId}
                          className="flex items-center gap-3"
                        >
                          <span className="text-xs text-muted-foreground w-36 truncate shrink-0">
                            {d.departmentName}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${d.completionRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums w-10 text-right">{d.completionRate}%</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums w-16 text-right shrink-0">
                            {d.completedCount}/{d.jobCardCount}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* ── Expense Top Categories ─────────────────────────────────────── */}
          {canViewFinance && payload.operations.expenses.byCategory.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
                Top Expense Categories — Last {selectedPeriod} Days
              </h2>
              <Card className="border bg-card/50">
                <CardContent className="pt-4 space-y-2.5">
                  {payload.operations.expenses.byCategory.slice(0, 8).map((cat) => (
                    <div
                      key={cat.category}
                      className="flex items-center gap-3"
                    >
                      <span className="text-xs text-foreground w-40 truncate shrink-0 font-medium">{cat.category}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all duration-500"
                          style={{
                            width:
                              payload.operations.expenses.totalAmount > 0
                                ? `${Math.round((cat.total / payload.operations.expenses.totalAmount) * 100)}%`
                                : '0%',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold tabular-nums w-24 text-right shrink-0">
                        {formatCurrency(cat.total)}
                      </span>
                      <Badge variant="secondary" className="text-[9px] px-1.5 shrink-0">
                        {cat.count}
                      </Badge>
                    </div>
                  ))}

                  {payload.operations.expenses.byCategory.length === 0 && (
                    <p className="text-sm text-muted-foreground italic text-center py-4">
                      No expenses recorded in this period
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Overdue Job Cards Table ────────────────────────────────────── */}
          {canViewJobCards && payload.operations.jobCards.overdueOpenCards.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-red-500" />
                Overdue Job Cards
                <Badge variant="destructive" className="ml-1 text-[9px]">
                  {payload.operations.jobCards.overdueOpenCards.length}
                </Badge>
              </h2>
              <Card className="border border-red-200 dark:border-red-900/40 bg-card/50">
                <CardContent className="pt-4 pb-0 px-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide pl-4">Job #</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Title</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Department</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Status</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Created</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide text-right pr-4">
                          Days Open
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.operations.jobCards.overdueOpenCards.slice(0, 10).map((card) => (
                        <TableRow
                          key={card.id}
                          className="hover:bg-muted/30"
                        >
                          <TableCell className="pl-4 font-mono text-xs text-primary">{card.jobNumber}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{card.jobTitle}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{card.departmentName}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 font-semibold"
                            >
                              {card.status.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(card.createdAt)}</TableCell>
                          <TableCell className="text-right pr-4">
                            <span className="text-xs font-bold text-red-600 dark:text-red-400">{card.daysOpen}d</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {payload.operations.jobCards.overdueOpenCards.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center py-3 border-t">
                      Showing 10 of {payload.operations.jobCards.overdueOpenCards.length} overdue cards
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Largest Expense Items ──────────────────────────────────────── */}
          {canViewFinance && payload.operations.expenses.largestItems.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
                Largest Expenses — Last {selectedPeriod} Days
              </h2>
              <Card className="border bg-card/50">
                <CardContent className="pt-4 pb-0 px-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide pl-4">Description</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Category</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Method</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Status</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide">Date</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase tracking-wide text-right pr-4">
                          Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.operations.expenses.largestItems.map((item) => (
                        <TableRow
                          key={item.id}
                          className="hover:bg-muted/30"
                        >
                          <TableCell className="pl-4 text-xs max-w-[180px] truncate">{item.description}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[9px] px-1.5">
                              {item.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.status.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(item.date)}</TableCell>
                          <TableCell className="text-right pr-4 font-bold text-sm text-orange-600 dark:text-orange-400">
                            {formatCurrency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── AI Manager Brief ───────────────────────────────────────────── */}
          {canViewFinance && (
          <>
          <Separator />
          <AiBriefPanel
            brief={aiBrief}
            loading={aiLoading}
            errorCode={aiErrorCode}
            errorMessage={aiErrorMsg}
            onRefresh={handleRefreshAnalysis}
          />

          {/* ── Manager Analytics Chat ─────────────────────────────────────── */}
          <Separator />
          <AnalyticsChatPanel payload={payload} />
          </>
          )}
        </>
      ) : (
        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No operational data available
        </div>
      )}
    </div>
  )
}
