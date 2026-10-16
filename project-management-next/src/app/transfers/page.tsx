'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { useAuthStore } from '@/stores/auth-store'
import { useFinanceStore } from '@/stores/finance-store'
import { useAdminStore } from '@/stores/admin-store'
import { generateTransfersReportPdf } from '@/features/fundTransfers/utils/generateTransfersReportPdf'
import { generateTransfersReportExcel } from '@/features/fundTransfers/utils/generateTransfersReportExcel'
import { generateTransfersReportCsv } from '@/features/fundTransfers/utils/generateTransfersReportCsv'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, Loader2, ArrowLeftRight, Banknote, Smartphone, Landmark, ListChecks, Wallet, Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { resolveStaffName } from '@/lib/person-name'
import { formatZar, formatCurrency } from '@/lib/format'
import { transferInvolvesIrd, usdToZar } from '@/lib/ird-fx'
import { normalizeAccountKey } from '@/lib/account-keys'

// ---- Presentation helpers (match OPEX / ledger color language) ------------

const ACCOUNT_META: Record<string, {
  label: string
  icon: typeof Landmark
  pill: string
  text: string
  iconCls: string
  chip: string
  card: string
  valueCls: string
  badgeCls: string
}> = {
  BANK: {
    label: 'Bank',
    icon: Landmark,
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    text: 'text-amber-500',
    iconCls: 'text-amber-500',
    chip: 'bg-amber-500/10',
    card: 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10',
    valueCls: 'text-amber-600 dark:text-amber-400',
    badgeCls: 'border-amber-400/40 text-amber-600 dark:text-amber-400',
  },
  CASH: {
    label: 'Cash',
    icon: Banknote,
    pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    text: 'text-emerald-500',
    iconCls: 'text-emerald-500',
    chip: 'bg-emerald-500/10',
    card: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10',
    valueCls: 'text-emerald-600 dark:text-emerald-400',
    badgeCls: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400',
  },
  ECOCASH: {
    label: 'EcoCash',
    icon: Smartphone,
    pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    text: 'text-orange-500',
    iconCls: 'text-orange-500',
    chip: 'bg-orange-500/10',
    card: 'border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10',
    valueCls: 'text-orange-600 dark:text-orange-400',
    badgeCls: 'border-orange-400/40 text-orange-600 dark:text-orange-400',
  },
  IRD: {
    label: 'IRD',
    icon: ListChecks,
    pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    text: 'text-red-500',
    iconCls: 'text-red-500',
    chip: 'bg-red-500/10',
    card: 'border-red-500/20 bg-red-500/5 dark:bg-red-500/10',
    valueCls: 'text-red-600 dark:text-red-400',
    badgeCls: 'border-red-400/40 text-red-600 dark:text-red-400',
  },
  SALARIES: {
    label: 'Salaries',
    icon: Wallet,
    pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    text: 'text-violet-500',
    iconCls: 'text-violet-500',
    chip: 'bg-violet-500/10',
    card: 'border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10',
    valueCls: 'text-violet-600 dark:text-violet-400',
    badgeCls: 'border-violet-400/40 text-violet-600 dark:text-violet-400',
  },
  RESERVE: {
    label: 'Reserve Account',
    icon: Landmark,
    pill: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    text: 'text-sky-500',
    iconCls: 'text-sky-500',
    chip: 'bg-sky-500/10',
    card: 'border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10',
    valueCls: 'text-sky-600 dark:text-sky-400',
    badgeCls: 'border-sky-400/40 text-sky-600 dark:text-sky-400',
  },
}

const TOTAL_TRANSFERRED_META = {
  label: 'Total Transferred',
  icon: ArrowLeftRight,
  iconCls: 'text-blue-500',
  chip: 'bg-blue-500/10',
  card: 'border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10',
  valueCls: 'text-blue-600 dark:text-blue-400',
  badge: 'FLOW',
  badgeCls: 'border-blue-400/40 text-blue-600 dark:text-blue-400',
}

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  PENDING_ACCOUNTANT: { label: 'Pending Accountant', pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  PENDING_MANAGER: { label: 'Pending Manager', pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dot: 'bg-blue-500' },
  COMPLETED: { label: 'Completed', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  REJECTED: { label: 'Rejected', pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelled', pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', dot: 'bg-slate-500' },
}

const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function accountMeta(account?: string) {
  const key = String(account || '').toUpperCase()
  return ACCOUNT_META[key] || {
    label: key || '—',
    icon: Wallet,
    pill: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    text: 'text-slate-500',
    iconCls: 'text-slate-500',
    chip: 'bg-slate-500/10',
    card: 'border-slate-500/20 bg-slate-500/5 dark:bg-slate-500/10',
    valueCls: 'text-foreground',
    badgeCls: 'border-slate-400/40 text-slate-600 dark:text-slate-300',
  }
}

function formatBalance(account: string, value: number) {
  return normalizeAccountKey(account) === 'IRD' ? formatZar(value) : formatCurrency(value)
}

function formatTransferAmount(t: { amount?: number; amountZar?: number; exchangeRate?: number; fromAccount?: string; toAccount?: string }) {
  const usd = Number(t.amount || 0)
  if (transferInvolvesIrd(t.fromAccount, t.toAccount) && Number(t.amountZar || 0) > 0) {
    const rate = Number(t.exchangeRate || 0)
    const rateLabel = rate > 0 ? ` @ ${rate}` : ''
    return `${formatCurrency(usd)} → ${formatZar(Number(t.amountZar))}${rateLabel}`
  }
  return formatCurrency(usd)
}

function statusMeta(status?: string) {
  if (!status) {
    return STATUS_META.PENDING_ACCOUNTANT
  }
  if (status.includes('REJECTED')) {
    return { label: titleCase(status), pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' }
  }
  return STATUS_META[status] || { label: titleCase(status), pill: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' }
}

function AccountPill({ account }: { account?: string }) {
  const m = accountMeta(account)
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', m.pill)}>
      {m.label}
    </span>
  )
}

function StatusPill({ status }: { status?: string }) {
  const m = statusMeta(status)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', m.pill)}>
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

export default function TransfersPage() {
  const { 
    finalBalances, 
    subscribeLedger,
    fetchHistoricalInventoryConsumption,
    initiateTransfer, 
    accountantInitialTransfer, 
    approveTransfer, 
    rejectTransfer, 
    cancelTransfer,
  } = useFinanceStore()
  
  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const isAdmin = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const isAccountant = authStore.hasRole('ACCOUNTANT' as any) || isAdmin
  const isManager = authStore.hasRole('MANAGER' as any) || isAdmin
  const [transfers, setTransfers] = useState<any[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    fromAccount: 'Cash',
    toAccount: 'Bank',
    amount: 0,
    exchangeRate: 0,
    description: '',
    reference: '',
    date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    if (authStore.user?.uid) adminStore.fetchSettings(authStore.user.uid)
  }, [authStore.user?.uid])

  useEffect(() => {
    const q = query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingTransfers(false)
    })

    // Establish live listener subscriptions to build finalBalances
    const unsubscribeLedger = subscribeLedger()
    fetchHistoricalInventoryConsumption()

    return () => {
      unsub()
      unsubscribeLedger()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredTransfers = useMemo(() => {
    if (!searchQuery) return transfers
    const q = searchQuery.toLowerCase()
    return transfers.filter((t: any) =>
      t.description?.toLowerCase().includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.fromAccount?.toLowerCase().includes(q) ||
      t.toAccount?.toLowerCase().includes(q)
    )
  }, [transfers, searchQuery])

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (filteredTransfers.length === 0) {
      toast.error('No transfers to export', { description: 'Adjust your filters and try again.' })
      return
    }
    setExportingFormat(format)
    try {
      let settings = adminStore.appSettings
      if (!settings || Object.keys(settings).length === 0) {
        const snap = await getDoc(doc(db, 'appSettings', 'general'))
        if (snap.exists()) settings = { id: snap.id, ...snap.data() }
      }
      const by = resolveStaffName({
        directoryUser: (adminStore.users || []).find(
          (u: any) => u.id === authStore.user?.uid || u.uid === authStore.user?.uid
        ),
        authDisplayName: authStore.user?.displayName,
      })
      if (format === 'pdf') await generateTransfersReportPdf(filteredTransfers, settings as any, by)
      else if (format === 'excel') await generateTransfersReportExcel(filteredTransfers, settings as any, by)
      else await generateTransfersReportCsv(filteredTransfers, settings as any, by)
      toast.success(`Transfers ${format.toUpperCase()} downloaded`)
    } catch (err) {
      console.error(err)
      toast.error(`Failed to generate ${format.toUpperCase()}`)
    } finally {
      setExportingFormat(null)
    }
  }

  // Reset to first page whenever search changes so results stay in range.
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTransfers.length / itemsPerPage)),
    [filteredTransfers.length, itemsPerPage]
  )

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const paginatedTransfers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredTransfers.slice(start, start + itemsPerPage)
  }, [filteredTransfers, currentPage, itemsPerPage])

  const totalTransferred = transfers.reduce((s: number, t: any) => s + (t.amount || 0), 0)

  const accountOptions = (['Bank', 'Cash', 'EcoCash', 'IRD', 'Salaries', 'Reserve'] as const).map((value) => {
    const meta = accountMeta(value)
    return { value, label: meta.label, meta }
  })

  const irdFxActive = transferInvolvesIrd(formData.fromAccount, formData.toAccount)
  const previewZar = irdFxActive ? usdToZar(formData.amount, formData.exchangeRate) : 0
  const irdIsDestination = normalizeAccountKey(formData.toAccount) === 'IRD'
  const irdIsSource = normalizeAccountKey(formData.fromAccount) === 'IRD'

  const handleTransfer = async () => {
    if (formData.amount <= 0) { toast.error('Amount must be greater than 0'); return }
    if (formData.fromAccount === formData.toAccount) { toast.error('Cannot transfer to same account'); return }
    if (irdIsSource && irdIsDestination) { toast.error('Cannot transfer from IRD to IRD'); return }
    if (irdFxActive && !(formData.exchangeRate > 0)) {
      toast.error('Exchange rate required', { description: 'Enter today’s ZAR per USD rate for IRD transfers.' })
      return
    }
    setSaving(true)
    try {
      const activeUser = {
        name: authStore.user?.displayName || authStore.user?.email || 'Unknown User',
        email: authStore.user?.email || ''
      }
      
      const autoApprove = isManager || isAdmin

      await initiateTransfer({
        fromAccount: formData.fromAccount,
        toAccount: formData.toAccount,
        amount: formData.amount,
        ...(irdFxActive ? { exchangeRate: formData.exchangeRate } : {}),
        description: formData.description || `Transfer from ${formData.fromAccount} to ${formData.toAccount}`,
        reference: formData.reference,
        date: formData.date
      }, activeUser, autoApprove)

      toast.success(autoApprove ? 'Transfer completed' : 'Transfer submitted, awaiting approval')
      setIsDialogOpen(false)
      setFormData({
        fromAccount: 'Cash',
        toAccount: 'Bank',
        amount: 0,
        exchangeRate: 0,
        description: '',
        reference: '',
        date: new Date().toISOString().split('T')[0],
      })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Fund Transfers</h2>
          <p className="text-muted-foreground">Transfer funds between accounts</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="w-full sm:w-auto" disabled={!!exportingFormat} />
              }
            >
              {exportingFormat ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" /><span>PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /><span>Excel</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /><span>CSV</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />New Transfer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {accountOptions.map((acc) => {
          const Icon = acc.meta.icon
          return (
            <Card key={acc.value} className={cn('relative overflow-hidden shadow-sm', acc.meta.card)}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', acc.meta.chip)}>
                    <Icon className={cn('size-4', acc.meta.iconCls)} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-bold bg-transparent', acc.meta.badgeCls)}>
                    BAL
                  </Badge>
                </div>
                <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', acc.meta.valueCls)}>
                  {formatBalance(acc.value, finalBalances[acc.value.toUpperCase()] || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{acc.label}</p>
              </CardContent>
            </Card>
          )
        })}
        <Card className={cn('relative overflow-hidden shadow-sm', TOTAL_TRANSFERRED_META.card)}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={cn('p-2 rounded-lg', TOTAL_TRANSFERRED_META.chip)}>
                <TOTAL_TRANSFERRED_META.icon className={cn('size-4', TOTAL_TRANSFERRED_META.iconCls)} />
              </div>
              <Badge variant="outline" className={cn('text-[10px] font-bold bg-transparent', TOTAL_TRANSFERRED_META.badgeCls)}>
                {TOTAL_TRANSFERRED_META.badge}
              </Badge>
            </div>
            <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', TOTAL_TRANSFERRED_META.valueCls)}>
              ${totalTransferred.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{TOTAL_TRANSFERRED_META.label}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search transfers..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left p-3 font-medium text-sm">Date</th>
              <th className="text-left p-3 font-medium text-sm">From</th>
              <th className="text-center p-3 font-medium text-sm">→</th>
              <th className="text-left p-3 font-medium text-sm">To</th>
              <th className="text-right p-3 font-medium text-sm">Amount</th>
              <th className="text-left p-3 font-medium text-sm">Description</th>
              <th className="text-left p-3 font-medium text-sm">Reference</th>
              <th className="text-center p-3 font-medium text-sm">Status</th>
              <th className="text-center p-3 font-medium text-sm">Actions</th>
            </tr></thead>
            <tbody>
              {loadingTransfers ? (
                Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b">{Array.from({ length: 9 }).map((_, j) => (<td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>))}</tr>))
              ) : filteredTransfers.length === 0 ? (
                <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">No transfers found</td></tr>
              ) : (
                paginatedTransfers.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedTransfer(t)}>
                    <td className="p-3 text-sm">{t.date ? new Date(t.date).toLocaleDateString() : t.createdAt?.toDate?.()?.toLocaleDateString() || '-'}</td>
                    <td className="p-3"><AccountPill account={t.fromAccount} /></td>
                    <td className="p-3 text-center text-blue-500/70 font-bold">→</td>
                    <td className="p-3"><AccountPill account={t.toAccount} /></td>
                    <td className="p-3 text-sm text-right font-mono font-semibold whitespace-nowrap">{formatTransferAmount(t)}</td>
                    <td className="p-3 text-sm">{t.description || '-'}</td>
                    <td className="p-3 text-sm font-mono text-muted-foreground">{t.reference || '-'}</td>
                    <td className="p-3 text-center">
                      <StatusPill status={t.status || 'PENDING_ACCOUNTANT'} />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-1">
                        {(!t.status || t.status === 'PENDING_ACCOUNTANT') && isAccountant && (
                          <>
                            <Button variant="ghost" size="sm" className="text-emerald-500 hover:bg-emerald-500/10 h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); accountantInitialTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}>
                              Initial
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); rejectTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}>
                              Reject
                            </Button>
                          </>
                        )}
                        {t.status === 'PENDING_MANAGER' && isManager && (
                          <>
                            <Button variant="ghost" size="sm" className="text-emerald-500 hover:bg-emerald-500/10 h-7 px-2 text-[11px]" onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await approveTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' });
                                toast.success('Transfer approved');
                              } catch (err: any) {
                                toast.error(err.message);
                              }
                            }}>
                              Approve
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); rejectTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}>
                              Reject
                            </Button>
                          </>
                        )}
                        {(!t.status || t.status === 'PENDING_ACCOUNTANT') && (t.initiatedByEmail === authStore.user?.email || isAdmin) && (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); cancelTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-4">
        {loadingTransfers ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-10 w-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </Card>
          ))
        ) : filteredTransfers.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-card text-muted-foreground">
            No transfers found
          </div>
        ) : (
          paginatedTransfers.map((t: any) => (
            <Card key={t.id} className="p-4 space-y-3 shadow-sm hover:border-brand-primary/20 transition-colors cursor-pointer" onClick={() => setSelectedTransfer(t)}>
              {/* Header: Date + Status */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">
                  {t.date ? new Date(t.date).toLocaleDateString() : t.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                </span>
                <StatusPill status={t.status || 'PENDING_ACCOUNTANT'} />
              </div>

              {/* Accounts & Amount Flow */}
              <div className="flex items-center justify-between border-y py-2 border-border/50 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <AccountPill account={t.fromAccount} />
                  <span className="text-blue-500/70 text-xs font-bold">→</span>
                  <AccountPill account={t.toAccount} />
                </div>
                <div className="text-base font-bold font-mono shrink-0 text-right">
                  {formatTransferAmount(t)}
                </div>
              </div>

              {/* Details: Description & Reference */}
              <div className="space-y-1 text-xs">
                {t.description && (
                  <div>
                    <span className="text-muted-foreground">Description: </span>
                    <span className="text-foreground">{t.description}</span>
                  </div>
                )}
                {t.reference && (
                  <div>
                    <span className="text-muted-foreground">Reference: </span>
                    <span className="font-mono text-foreground">{t.reference}</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              {(((!t.status || t.status === 'PENDING_ACCOUNTANT') && isAccountant) ||
                (t.status === 'PENDING_MANAGER' && isManager) ||
                ((!t.status || t.status === 'PENDING_ACCOUNTANT') && (t.initiatedByEmail === authStore.user?.email || isAdmin))) && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                  {(!t.status || t.status === 'PENDING_ACCOUNTANT') && isAccountant && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 h-9"
                        onClick={(e) => { e.stopPropagation(); accountantInitialTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}
                      >
                        Initial
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20 h-9"
                        onClick={(e) => { e.stopPropagation(); rejectTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {t.status === 'PENDING_MANAGER' && isManager && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 h-9"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await approveTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' });
                            toast.success('Transfer approved');
                          } catch (err: any) {
                            toast.error(err.message);
                          }
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20 h-9"
                        onClick={(e) => { e.stopPropagation(); rejectTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {(!t.status || t.status === 'PENDING_ACCOUNTANT') && (t.initiatedByEmail === authStore.user?.email || isAdmin) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20 h-9"
                      onClick={(e) => { e.stopPropagation(); cancelTransfer(t.id, { name: authStore.user?.displayName || '', email: authStore.user?.email || '' }) }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {!loadingTransfers && filteredTransfers.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>
              {' '}to{' '}
              <span className="font-bold text-foreground">
                {Math.min(currentPage * itemsPerPage, filteredTransfers.length)}
              </span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{filteredTransfers.length}</span>
              {' '}transfers
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
                  className="bg-background border border-muted rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer text-foreground"
                >
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  title="Previous Page"
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
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                >
                  &raquo;
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Fund Transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>From Account</Label>
                <Select value={formData.fromAccount} onValueChange={(v) => v && setFormData(p => ({ ...p, fromAccount: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accountOptions.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Balance: {formatBalance(formData.fromAccount, finalBalances[formData.fromAccount.toUpperCase()] || 0)}</p>
              </div>
              <div className="space-y-2"><Label>To Account</Label>
                <Select value={formData.toAccount} onValueChange={(v) => v && setFormData(p => ({ ...p, toAccount: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accountOptions.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Balance: {formatBalance(formData.toAccount, finalBalances[formData.toAccount.toUpperCase()] || 0)}</p>
              </div>
            </div>
            <div className="space-y-2"><Label>Amount ($)</Label><Input type="number" min="0" step="0.01" value={formData.amount || ''} onChange={(e) => setFormData(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
            {irdFxActive && (
              <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <Label>Exchange rate (ZAR per 1 USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 16.60"
                  value={formData.exchangeRate || ''}
                  onChange={(e) => setFormData(p => ({ ...p, exchangeRate: Number(e.target.value) }))}
                />
                {previewZar > 0 ? (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    {irdIsDestination
                      ? `IRD receives ${formatZar(previewZar)}`
                      : `IRD sends ${formatZar(previewZar)}`}
                    {' '}({formatCurrency(formData.amount)} × {formData.exchangeRate})
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Enter today’s rate to preview the ZAR leg.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={formData.date} onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Reference</Label><Input value={formData.reference} onChange={(e) => setFormData(p => ({ ...p, reference: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!selectedTransfer} onOpenChange={(open) => !open && setSelectedTransfer(null)}>
        <DialogContent className="max-w-md bg-card border-border/80 text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Transfer Details</span>
              {selectedTransfer && (
                <StatusPill status={selectedTransfer.status || 'PENDING_ACCOUNTANT'} />
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-4">
              {/* Accounts Flow & Amount */}
              <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Flow</span>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <AccountPill account={selectedTransfer.fromAccount} />
                    <span className="text-blue-500/70 text-xs font-bold">→</span>
                    <AccountPill account={selectedTransfer.toAccount} />
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Amount</span>
                  <span className="text-lg font-bold font-mono block mt-0.5 text-blue-600 dark:text-blue-400">
                    {formatTransferAmount(selectedTransfer)}
                  </span>
                </div>
              </div>

              {/* Description & Reference */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground block font-medium">Reference</span>
                  <span className="font-mono text-foreground block mt-0.5">{selectedTransfer.reference || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium">Date</span>
                  <span className="text-foreground block mt-0.5">
                    {selectedTransfer.date ? new Date(selectedTransfer.date).toLocaleDateString() : selectedTransfer.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
                  </span>
                </div>
              </div>

              {selectedTransfer.description && (
                <div className="space-y-1.5 p-3 bg-muted/40 rounded-lg border border-border">
                  <span className="text-xs text-muted-foreground block uppercase font-medium">Description</span>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedTransfer.description}</p>
                </div>
              )}

              {/* Audit Trail */}
              <div className="space-y-2.5">
                <span className="text-xs text-muted-foreground block uppercase font-medium">Audit Trail</span>
                <div className="grid grid-cols-2 gap-4 text-xs bg-muted/20 p-3 rounded-lg border border-border/50">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium block">Initiated By</span>
                    <span className="text-foreground block mt-1">
                      {selectedTransfer.initiatedByName || selectedTransfer.initiatedByEmail ? (
                        <>
                          By: <strong>{selectedTransfer.initiatedByName || selectedTransfer.initiatedByEmail}</strong>
                          <span className="text-muted-foreground block text-[10px] mt-0.5">
                            {selectedTransfer.createdAt ? (selectedTransfer.createdAt.toDate ? selectedTransfer.createdAt.toDate().toLocaleString() : new Date(selectedTransfer.createdAt).toLocaleString()) : ''}
                          </span>
                        </>
                      ) : '—'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium block">Accountant Initial</span>
                    {selectedTransfer.accountantInitialedBy ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>{selectedTransfer.accountantInitialedBy}</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedTransfer.accountantInitialedAt ? (selectedTransfer.accountantInitialedAt.toDate ? selectedTransfer.accountantInitialedAt.toDate().toLocaleString() : new Date(selectedTransfer.accountantInitialedAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic block mt-1">
                        {selectedTransfer.status === 'COMPLETED' || selectedTransfer.status === 'PENDING_MANAGER' ? 'System (Auto-approved)' : 'Pending'}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 space-y-1 pt-2 border-t border-border/50">
                    <span className="text-muted-foreground font-medium block">Manager Approval</span>
                    {selectedTransfer.managerApprovedBy ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>{typeof selectedTransfer.managerApprovedBy === 'object' ? selectedTransfer.managerApprovedBy.displayName : selectedTransfer.managerApprovedBy}</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedTransfer.managerApprovedAt ? (selectedTransfer.managerApprovedAt.toDate ? selectedTransfer.managerApprovedAt.toDate().toLocaleString() : new Date(selectedTransfer.managerApprovedAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic block mt-1">Pending</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedTransfer(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
