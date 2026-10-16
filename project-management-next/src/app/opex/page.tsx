'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useFinanceStore } from '@/stores/finance-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { useVerificationStore } from '@/stores/verification-store'
import { generateOpexPdf } from '@/features/operationalExpenses/utils/generateOpexPdf'
import { generateOpexReportPdf } from '@/features/operationalExpenses/utils/generateOpexReportPdf'
import { generateOpexReportExcel } from '@/features/operationalExpenses/utils/generateOpexReportExcel'
import { generateOpexReportCsv } from '@/features/operationalExpenses/utils/generateOpexReportCsv'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { db } from '@/lib/firebase'
import { collection, doc, getDoc, addDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Search, Loader2, Download, FileText, FileSpreadsheet, CheckCircle, XCircle, Clock, ExternalLink, Lock, Trash2, AlertTriangle, ChevronDown, ChevronRight, Briefcase, Wallet, Layers, Package, X, HardHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { uploadExpenseAttachment } from '@/lib/storage-helpers'
import { resolveStaffName } from '@/lib/person-name'
import { downloadBlob } from '@/lib/browser-download'

// ---- Presentation helpers -------------------------------------------------

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  PENDING_ACCOUNTANT: { label: 'Pending Accountant', pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  APPROVED_ACCOUNTANT: { label: 'Pending Manager', pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dot: 'bg-blue-500' },
  APPROVED: { label: 'Approved', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  APPROVED_FOR_PAYMENT: { label: 'Approved for Payment', pill: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20', dot: 'bg-teal-500' },
  PAYMENT_PROCESSED: { label: 'Paid', pill: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', dot: 'bg-indigo-500' },
}

const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function statusMeta(status?: string) {
  if (!status) return { label: '—', pill: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' }
  if (status.includes('REJECTED')) {
    return { label: titleCase(status), pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' }
  }
  return STATUS_META[status] || { label: titleCase(status), pill: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' }
}

function categoryPillClass(category?: string) {
  const c = String(category || '').toLowerCase()
  if (c.includes('salar')) return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
  if (c.includes('statutory')) return 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20'
  if (c.includes('job')) return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  if (c.includes('cost of sales') || c.includes('cogs') || c.includes('inventory')) {
    return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
  }
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
}

const formatCategory = (category?: string) => (category ? category.replace(/-/g, ' ') : '—')

function StatusPill({ status }: { status?: string }) {
  const m = statusMeta(status)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', m.pill)}>
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

function CategoryPill({ category }: { category?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize whitespace-nowrap', categoryPillClass(category))}>
      {formatCategory(category)}
    </span>
  )
}

type OpexGroupKind = 'jobcard' | 'subcontractor' | 'salary' | 'cogs' | 'standalone'
interface OpexGroup { key: string; label: string; sublabel?: string; kind: OpexGroupKind; items: any[]; total: number }

function toDate(v: any): Date | null {
  if (!v) return null
  if (typeof v?.toDate === 'function') return v.toDate()
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Date an expense was approved, preferring the accountant sign-off, then manager,
// then a generic approvedAt, and finally the creation date as a last resort.
function getApprovalDate(e: any): Date | null {
  return toDate(e.accountantApprovedAt) || toDate(e.managerApprovedAt) || toDate(e.approvedAt) || toDate(e.createdAt)
}

function dayKey(d: Date | null): string {
  if (!d) return 'undated'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(d: Date | null): string {
  if (!d) return 'Undated'
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Roll related expenses up under a shared parent: job-card line items collapse
// under the originating card + approval date, salary/payroll rows under their
// pay period, COGS under the approval/posting date, and everything else stays
// a standalone row. Insertion order is preserved.
function groupExpensesByParent(items: any[]): OpexGroup[] {
  const order: string[] = []
  const map: Record<string, OpexGroup> = {}

  const parsePeriod = (s: string) => {
    const m = String(s || '').match(/\(([^)]+)\)\s*$/)
    return m ? m[1].trim() : null
  }

  const isCogs = (item: any, category: string, text: string) =>
    item.type === 'COST_OF_SALES' ||
    category.includes('cost of sales') ||
    category.includes('cogs') ||
    /^cogs\b/i.test(text)

  items.forEach((item: any) => {
    let key = 'standalone-' + item.id
    let label = ''
    let kind: OpexGroupKind = 'standalone'
    const text = item.title || item.description || ''
    const category = String(item.category || '').toLowerCase()

    let sublabel: string | undefined

    if (item.subcontractorId) {
      const approvedOn = getApprovalDate(item)
      const name = item.subcontractorName || 'Subcontractor'
      key = `subcontractor-${item.subcontractorId}-${dayKey(approvedOn)}`
      label = `Subcontractor — ${name}`
      sublabel = dayLabel(approvedOn)
      kind = 'subcontractor'
    } else if (item.sourceJobId) {
      const m = String(text).match(/Job Card\s+([A-Za-z0-9-]+)/i)
      const jobNo = m ? m[1] : String(item.sourceJobId).substring(0, 8)
      const approvedOn = getApprovalDate(item)
      // Group per job card AND per approval date so transactions approved on
      // different days stay in separate groups.
      key = `jobcard-${item.sourceJobId}-${dayKey(approvedOn)}`
      label = `Job Card #${jobNo}`
      sublabel = dayLabel(approvedOn)
      kind = 'jobcard'
    } else if (item.payrollId || category.includes('salar') || category.includes('statutory')) {
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
      const approvedOn = getApprovalDate(item)
      key = `cogs-${dayKey(approvedOn)}`
      label = `COGS — ${dayLabel(approvedOn)}`
      kind = 'cogs'
    }

    if (!map[key]) {
      map[key] = { key, label, sublabel, kind, items: [], total: 0 }
      order.push(key)
    }
    map[key].items.push(item)
    map[key].total += Math.abs(Number(item.amount || 0))
  })

  return order.map((k) => map[k])
}

function statusCounts(items: any[]): { status: string; count: number }[] {
  const counts: Record<string, number> = {}
  items.forEach((i) => { const s = i.status || 'UNKNOWN'; counts[s] = (counts[s] || 0) + 1 })
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

export default function OpexPage() {
  const router = useRouter()
  const { expenses, fetchExpenses, recordExpense, approveExpenseByAccountant, rejectExpenseByAccountant, approveExpenseByManager, rejectExpenseByManager, lockExpensePdf, unlockExpensePdf, deleteExpense, loading } = useFinanceStore()
  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const verificationStore = useVerificationStore()
  const isSuperAdmin = authStore.isSuperAdmin()
  const isAdmin = isSuperAdmin || authStore.hasRole('ADMIN' as any)
  const isAccountant = authStore.hasRole('ACCOUNTANT' as any) || isAdmin
  const isManager = authStore.hasRole('MANAGER' as any) || isAdmin
  const isFinance = isAccountant || isManager || authStore.hasRole('DIRECTOR' as any)
  const canManageAttachments = isAccountant || isManager || isAdmin || isSuperAdmin
  const { user: authUser } = authStore
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [rejectionDialog, setRejectionDialog] = useState<{ id: string; type: 'accountant' | 'manager' } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null)
  const [isDownloading, setIsDownloading] = useState<string | null>(null)
  const [isUnlockingPdf, setIsUnlockingPdf] = useState<string | null>(null)
  const [isDownloadingReport, setIsDownloadingReport] = useState<string | null>(null)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<any | null>(null)
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)

  const toggleParent = (key: string) => setExpandedParents((p) => ({ ...p, [key]: !p[key] }))

  const handleDeleteConfirm = async () => {
    if (!expenseToDelete) return
    try {
      await deleteExpense(expenseToDelete.id, {
        uid: authUser?.uid,
        displayName: authUser?.displayName || authUser?.email || 'Unknown User',
        email: authUser?.email || undefined,
      })
      toast.success('Expense deleted successfully')
      setExpenseToDelete(null)
      if (selectedExpense?.id === expenseToDelete.id) {
        setSelectedExpense(null)
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to delete expense', { description: err.message })
    }
  }

  const getExpenseAttachmentUrls = (expense: any): string[] =>
    expense?.attachmentUrls ||
    (expense?.attachmentUrl ? [expense.attachmentUrl] : (expense?.receiptUrl ? [expense.receiptUrl] : []))

  const persistExpenseAttachments = async (expenseId: string, urls: string[]) => {
    await updateDoc(doc(db, 'operationalExpenses', expenseId), {
      attachmentUrls: urls,
      attachmentUrl: urls.length > 0 ? urls[0] : null,
      updatedAt: serverTimestamp(),
    })
    setSelectedExpense((prev: any) =>
      prev && prev.id === expenseId
        ? { ...prev, attachmentUrls: urls, attachmentUrl: urls.length > 0 ? urls[0] : null }
        : prev
    )
  }

  const handleOpexAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedExpense?.id || !canManageAttachments) return
    const files = e.target.files
    if (!files || files.length === 0) return
    setIsUploadingAttachment(true)
    try {
      const currentUrls = [...getExpenseAttachmentUrls(selectedExpense)]
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const url = await uploadExpenseAttachment(file, 'opex')
        currentUrls.push(url)
      }
      await persistExpenseAttachments(selectedExpense.id, currentUrls)
      toast.success('Proof of payment saved')
    } catch (err: any) {
      toast.error('Upload failed', { description: err.message })
    } finally {
      setIsUploadingAttachment(false)
      e.target.value = ''
    }
  }

  const handleOpexAttachmentRemove = async (idx: number) => {
    if (!selectedExpense?.id || !canManageAttachments) return
    try {
      const urls = [...getExpenseAttachmentUrls(selectedExpense)]
      urls.splice(idx, 1)
      await persistExpenseAttachments(selectedExpense.id, urls)
      toast.success('Attachment removed')
    } catch (err: any) {
      toast.error('Failed to remove attachment', { description: err.message })
    }
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  const filteredExpenses = useMemo(() => {
    let result = expenses
    if (searchQuery) result = result.filter((e: any) => e.title?.toLowerCase().includes(searchQuery.toLowerCase()) || e.description?.toLowerCase().includes(searchQuery.toLowerCase()) || e.vendor?.toLowerCase().includes(searchQuery.toLowerCase()))
    if (statusFilter !== 'ALL') result = result.filter((e: any) => e.status === statusFilter)
    return result
  }, [expenses, searchQuery, statusFilter])

  const groupedExpenses = useMemo(() => groupExpensesByParent(filteredExpenses), [filteredExpenses])

  // Reset to first page whenever search/filter changes so results stay in range.
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(groupedExpenses.length / itemsPerPage)),
    [groupedExpenses.length, itemsPerPage]
  )

  // Clamp page if the dataset shrinks (e.g. after a filter that leaves fewer pages).
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return groupedExpenses.slice(start, start + itemsPerPage)
  }, [groupedExpenses, currentPage, itemsPerPage])

  const pageExpenseCount = useMemo(
    () => paginatedGroups.reduce((sum, g) => sum + g.items.length, 0),
    [paginatedGroups]
  )
  const parentGroupCount = useMemo(
    () => paginatedGroups.filter((g) => g.kind !== 'standalone').length,
    [paginatedGroups]
  )
  const allExpanded = useMemo(
    () => parentGroupCount > 0 && paginatedGroups.every((g) => g.kind === 'standalone' || expandedParents[g.key]),
    [paginatedGroups, expandedParents, parentGroupCount]
  )
  const toggleAll = () => {
    if (allExpanded) {
      // Collapse only groups on the current page
      setExpandedParents((prev) => {
        const next = { ...prev }
        paginatedGroups.forEach((g) => { if (g.kind !== 'standalone') delete next[g.key] })
        return next
      })
      return
    }
    setExpandedParents((prev) => {
      const next = { ...prev }
      paginatedGroups.forEach((g) => { if (g.kind !== 'standalone') next[g.key] = true })
      return next
    })
  }

  const paginationControls = !loading && groupedExpenses.length > 0 && (
    <div className="flex items-center justify-between px-3 py-3 border-t border-border/40 flex-wrap gap-3">
      <div className="text-xs text-muted-foreground">
        Showing{' '}
        <span className="font-bold text-foreground">
          {(currentPage - 1) * itemsPerPage + 1}
        </span>
        {' '}–{' '}
        <span className="font-bold text-foreground">
          {Math.min(currentPage * itemsPerPage, groupedExpenses.length)}
        </span>
        {' '}of{' '}
        <span className="font-bold text-foreground">{groupedExpenses.length}</span>
        {' '}groups
        <span className="text-muted-foreground/70"> · {pageExpenseCount} expenses on this page</span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1) }}
            className="bg-background border border-muted-foreground/30 rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground"
          >
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="First page">&laquo;</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} title="Previous page">&lsaquo;</Button>
          <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
            Page <span className="font-bold text-foreground">{currentPage}</span> of{' '}
            <span className="font-bold text-foreground">{totalPages}</span>
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} title="Next page">&rsaquo;</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} title="Last page">&raquo;</Button>
        </div>
      </div>
    </div>
  )

  const stats = {
    total: expenses.length,
    pendingAccountant: expenses.filter((e: any) => e.status === 'PENDING_ACCOUNTANT').length,
    pendingManager: expenses.filter((e: any) => e.status === 'APPROVED_ACCOUNTANT').length,
    approved: expenses.filter((e: any) => e.status === 'APPROVED').length,
  }

  const statusBadge = (status: string) => <StatusPill status={status} />

  const GROUP_KIND_META: Record<Exclude<OpexGroupKind, 'standalone'>, { icon: React.ElementType; pill: string; accent: string; iconCls: string }> = {
    jobcard: { icon: Briefcase, pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', accent: 'border-l-blue-500', iconCls: 'text-blue-500' },
    subcontractor: { icon: HardHat, pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', accent: 'border-l-amber-500', iconCls: 'text-amber-500' },
    salary: { icon: Wallet, pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', accent: 'border-l-violet-500', iconCls: 'text-violet-500' },
    cogs: { icon: Package, pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', accent: 'border-l-orange-500', iconCls: 'text-orange-500' },
  }



  const handleApprove = async (id: string, role: 'accountant' | 'manager') => {
    try {
      const activeUser = {
        name: authUser?.displayName || authUser?.email || 'System User',
        email: authUser?.email || 'user@incaptta.com'
      }
      if (role === 'accountant') {
        await approveExpenseByAccountant(id, activeUser)
        toast.success('Approved by accountant')
      } else {
        await approveExpenseByManager(id, activeUser)
        toast.success('Approved by manager')
      }
    } catch (err: any) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectionDialog || !rejectionReason) return
    try {
      const activeUser = {
        name: authUser?.displayName || authUser?.email || 'System User',
        email: authUser?.email || 'user@incaptta.com'
      }
      if (rejectionDialog.type === 'accountant') {
        await rejectExpenseByAccountant(rejectionDialog.id, activeUser, rejectionReason)
      } else {
        await rejectExpenseByManager(rejectionDialog.id, activeUser, rejectionReason)
      }
      toast.success('Expense rejected')
      setRejectionDialog(null)
      setRejectionReason('')
    } catch (err: any) { toast.error(err.message) }
  }

  const handlePdf = async (expense: any) => {
    if (!expense) return
    setIsDownloading(expense.id)
    try {
      let currentSettings = adminStore.appSettings
      if (!currentSettings || Object.keys(currentSettings).length === 0) {
        const snap = await getDoc(doc(db, 'appSettings', 'general'))
        if (snap.exists()) {
          currentSettings = { id: snap.id, ...snap.data() }
        }
      }
      const token = await verificationStore.ensureVerificationToken(
        expense.id,
        'OPEX',
        expense.id ? `OPEX-${String(expense.id).substring(0, 8).toUpperCase()}` : 'OPEX',
        expense.title || expense.description || 'Internal Requisition'
      )
      const generated = await generateOpexPdf(
        expense,
        currentSettings as any,
        currentSettings as any,
        authUser?.displayName || authUser?.email || 'System User',
        token
      )
      const bypassExistingLock = isSuperAdmin && expense.pdfGenerated === true
      let claimedDownload = false
      if (!bypassExistingLock) {
        await lockExpensePdf(expense.id, {
          uid: authUser?.uid,
          name: authUser?.displayName || authUser?.email || 'System User',
          email: authUser?.email || undefined,
        })
        claimedDownload = true
      }
      try {
        downloadBlob(generated)
      } catch (downloadError) {
        if (claimedDownload) {
          try { await unlockExpensePdf(expense.id) } catch { /* best-effort rollback */ }
        }
        throw downloadError
      }
      if (selectedExpense && selectedExpense.id === expense.id) {
        setSelectedExpense((prev: any) => (prev ? { ...prev, pdfGenerated: true } : null))
      }
      toast.success('PDF Downloaded!')
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Failed to generate PDF')
    } finally {
      setIsDownloading(null)
    }
  }

  const handleUnlockPdf = async (expense: any) => {
    if (!isSuperAdmin || !expense?.id) return
    setIsUnlockingPdf(expense.id)
    try {
      await unlockExpensePdf(expense.id)
      if (selectedExpense?.id === expense.id) {
        setSelectedExpense((prev: any) => prev ? { ...prev, pdfGenerated: false } : null)
      }
      toast.success('PDF download re-enabled')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlock PDF')
    } finally {
      setIsUnlockingPdf(null)
    }
  }

  const canDownloadExpensePdf = (expense: any) => {
    const approved = ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(expense?.status)
    const ownerEmail = String(expense?.createdByEmail || '').trim().toLowerCase()
    const currentEmail = String(authUser?.email || '').trim().toLowerCase()
    const isCreator = !!ownerEmail && ownerEmail === currentEmail
    return approved && !expense?.sourceJobId && (isFinance || isCreator)
  }

  const resolveOpexSettings = async () => {
    let currentSettings = adminStore.appSettings
    if (!currentSettings || Object.keys(currentSettings).length === 0) {
      const snap = await getDoc(doc(db, 'appSettings', 'general'))
      if (snap.exists()) {
        currentSettings = { id: snap.id, ...snap.data() }
      }
    }
    return currentSettings
  }

  const exportGeneratedBy = () =>
    resolveStaffName({
      directoryUser: (adminStore.users || []).find((u: any) => u.id === authUser?.uid || u.uid === authUser?.uid),
      authDisplayName: authUser?.displayName,
    })

  const handleExportReport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (filteredExpenses.length === 0) {
      return toast.error('No expenses to export', { description: 'Adjust your filters and try again.' })
    }
    setIsDownloadingReport(format)
    try {
      const currentSettings = await resolveOpexSettings()
      const by = exportGeneratedBy()
      if (format === 'pdf') {
        await generateOpexReportPdf(filteredExpenses, null, currentSettings as any, currentSettings as any, by)
      } else if (format === 'excel') {
        await generateOpexReportExcel(filteredExpenses, null, currentSettings as any, by)
      } else {
        await generateOpexReportCsv(filteredExpenses, null, currentSettings as any, by)
      }
      toast.success(`OPEX ${format.toUpperCase()} downloaded`)
    } catch (err: any) {
      console.error(err)
      toast.error(`Failed to generate ${format.toUpperCase()}`)
    } finally {
      setIsDownloadingReport(null)
    }
  }

  const renderRowActions = (expense: any) => (
    <div className="flex justify-center gap-1">
      {expense.status === 'PENDING_ACCOUNTANT' && isAccountant && (
        <>
          <Button variant="ghost" size="sm" className="text-emerald-500 hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); handleApprove(expense.id, 'accountant'); }} title="Approve"><CheckCircle className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setRejectionDialog({ id: expense.id, type: 'accountant' }); }} title="Reject"><XCircle className="h-4 w-4" /></Button>
        </>
      )}
      {expense.status === 'APPROVED_ACCOUNTANT' && isManager && (
        <>
          <Button variant="ghost" size="sm" className="text-emerald-500 hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); handleApprove(expense.id, 'manager'); }} title="Approve"><CheckCircle className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setRejectionDialog({ id: expense.id, type: 'manager' }); }} title="Reject"><XCircle className="h-4 w-4" /></Button>
        </>
      )}
      {canDownloadExpensePdf(expense) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isDownloading === expense.id || (expense.pdfGenerated && !isSuperAdmin)}
          onClick={(e) => { e.stopPropagation(); handlePdf(expense) }}
          title={expense.pdfGenerated ? 'PDF locked (already downloaded)' : 'Download PDF'}
        >
          {isDownloading === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : expense.pdfGenerated ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Download className="h-4 w-4" />}
        </Button>
      )}
      {isSuperAdmin && expense.pdfGenerated && !expense.sourceJobId && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isUnlockingPdf === expense.id}
          onClick={(e) => { e.stopPropagation(); handleUnlockPdf(expense) }}
          title="Unlock PDF download"
        >
          {isUnlockingPdf === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4 text-amber-500" />}
        </Button>
      )}
      {isSuperAdmin && !expense.sourceJobId && (
        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setExpenseToDelete(expense) }} title="Delete Expense"><Trash2 className="h-4 w-4" /></Button>
      )}
    </div>
  )

  const renderExpenseRow = (expense: any, indented = false) => (
    <tr
      key={expense.id}
      className={cn('border-b hover:bg-muted/50 cursor-pointer transition-colors', indented && 'bg-muted/5 border-l-2 border-l-border')}
      onClick={() => setSelectedExpense(expense)}
    >
      <td className={cn('p-3 text-sm font-medium', indented && 'pl-8 text-muted-foreground font-normal')}>
        {expense.title || expense.description || 'Untitled Expense'}
      </td>
      <td className="p-3 text-sm"><CategoryPill category={expense.category} /></td>
      <td className="p-3 text-sm text-right font-mono font-semibold">${(expense.amount || 0).toFixed(2)}</td>
      <td className="p-3 text-sm text-muted-foreground">{expense.vendor || expense.recipientName || '—'}</td>
      <td className="p-3 text-center">{statusBadge(expense.status)}</td>
      <td className="p-3 text-center">{renderRowActions(expense)}</td>
    </tr>
  )

  const renderParentRow = (group: OpexGroup) => {
    const meta = GROUP_KIND_META[group.kind as Exclude<OpexGroupKind, 'standalone'>]
    const Icon = meta.icon
    const isExpanded = expandedParents[group.key] ?? false
    return (
      <React.Fragment key={group.key}>
        <tr
          className={cn('border-b bg-muted/10 hover:bg-muted/30 cursor-pointer font-medium border-l-4 transition-colors', meta.accent)}
          onClick={() => toggleParent(group.key)}
        >
          <td className="p-3 text-sm font-bold text-foreground">
            <span className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
              <Icon className={cn('size-4 shrink-0', meta.iconCls)} />
              {group.label}
              {group.sublabel && (
                <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.sublabel}
                </span>
              )}
            </span>
          </td>
          <td className="p-3">
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', meta.pill)}>
              {group.items.length} item{group.items.length !== 1 ? 's' : ''}
            </span>
          </td>
          <td className="p-3 text-sm text-right font-mono font-black">${group.total.toFixed(2)}</td>
          <td className="p-3 text-sm text-muted-foreground italic text-xs">Click to {isExpanded ? 'collapse' : 'expand'}</td>
          <td className="p-3">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {statusCounts(group.items).map(({ status, count }) => {
                const sm = statusMeta(status)
                return (
                  <span key={status} className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', sm.pill)} title={sm.label}>
                    <span className={cn('size-1.5 rounded-full', sm.dot)} />{count}
                  </span>
                )
              })}
            </div>
          </td>
          <td className="p-3" />
        </tr>
        {isExpanded && group.items.map((expense: any) => renderExpenseRow(expense, true))}
      </React.Fragment>
    )
  }

  const renderExpenseCard = (expense: any, nested = false) => (
    <Card
      key={expense.id}
      className={cn('p-4 space-y-3 shadow-sm hover:border-brand-primary/20 transition-colors cursor-pointer', nested && 'bg-muted/20 border-border/60')}
      onClick={() => setSelectedExpense(expense)}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="font-semibold text-sm line-clamp-1">
          {expense.title || expense.description || 'Untitled Expense'}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          {statusBadge(expense.status)}
        </div>
      </div>

      <div className="flex items-center justify-between border-y py-2 border-border/50 text-xs gap-2">
        <div className="space-y-1 min-w-0">
          <CategoryPill category={expense.category} />
          {(expense.vendor || expense.recipientName) && (
            <span className="text-muted-foreground block truncate max-w-[180px]">{expense.vendor || expense.recipientName}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-muted-foreground block font-medium">Amount</span>
          <span className="text-sm font-bold font-mono text-foreground block">
            ${(expense.amount || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {((expense.status === 'PENDING_ACCOUNTANT' && isAccountant) ||
        (expense.status === 'APPROVED_ACCOUNTANT' && isManager) ||
        (expense.status === 'APPROVED' || expense.status === 'APPROVED_FOR_PAYMENT' || expense.status === 'PAYMENT_PROCESSED') ||
        (isSuperAdmin && !expense.sourceJobId)) && (
        <div className="flex flex-wrap gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
          {expense.status === 'PENDING_ACCOUNTANT' && isAccountant && (
            <>
              <Button variant="outline" size="sm" className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 h-9" onClick={() => handleApprove(expense.id, 'accountant')}>Approve</Button>
              <Button variant="outline" size="sm" className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20 h-9" onClick={() => setRejectionDialog({ id: expense.id, type: 'accountant' })}>Reject</Button>
            </>
          )}
          {expense.status === 'APPROVED_ACCOUNTANT' && isManager && (
            <>
              <Button variant="outline" size="sm" className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 h-9" onClick={() => handleApprove(expense.id, 'manager')}>Approve</Button>
              <Button variant="outline" size="sm" className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20 h-9" onClick={() => setRejectionDialog({ id: expense.id, type: 'manager' })}>Reject</Button>
            </>
          )}
          {canDownloadExpensePdf(expense) && (
            <Button variant="outline" size="sm" className="w-full h-9 flex items-center justify-center gap-1.5" disabled={isDownloading === expense.id || (expense.pdfGenerated && !isSuperAdmin)} onClick={() => handlePdf(expense)}>
              {isDownloading === expense.id ? (<><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>) : expense.pdfGenerated ? (<><Lock className="h-4 w-4" /> {isSuperAdmin ? 'Redownload PDF (Locked)' : 'PDF Locked'}</>) : (<><Download className="h-4 w-4" /> Download PDF</>)}
            </Button>
          )}
          {isSuperAdmin && expense.pdfGenerated && !expense.sourceJobId && (
            <Button variant="outline" size="sm" className="w-full h-9" disabled={isUnlockingPdf === expense.id} onClick={() => handleUnlockPdf(expense)}>
              {isUnlockingPdf === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Lock className="h-4 w-4 mr-1.5" /> Unlock PDF</>}
            </Button>
          )}
          {isSuperAdmin && !expense.sourceJobId && (
            <Button variant="outline" size="sm" className="w-full h-9 flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20" onClick={() => setExpenseToDelete(expense)}>
              <Trash2 className="h-4 w-4" /> Delete Expense
            </Button>
          )}
        </div>
      )}
    </Card>
  )

  const renderParentCard = (group: OpexGroup) => {
    const meta = GROUP_KIND_META[group.kind as Exclude<OpexGroupKind, 'standalone'>]
    const Icon = meta.icon
    const isExpanded = expandedParents[group.key] ?? false
    return (
      <div key={group.key} className={cn('rounded-xl border-l-4 border bg-card shadow-sm overflow-hidden', meta.accent)}>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 p-4 text-left"
          onClick={() => toggleParent(group.key)}
        >
          <span className="flex items-center gap-2 min-w-0">
            {isExpanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
            <Icon className={cn('size-4 shrink-0', meta.iconCls)} />
            <span className="min-w-0">
              <span className="block font-bold text-sm truncate">{group.label}</span>
              <span className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold', meta.pill)}>
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </span>
                {group.sublabel && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {group.sublabel}
                  </span>
                )}
              </span>
            </span>
          </span>
          <span className="text-sm font-mono font-black shrink-0">${group.total.toFixed(2)}</span>
        </button>
        {isExpanded && (
          <div className="space-y-3 px-3 pb-3">
            {group.items.map((expense: any) => renderExpenseCard(expense, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operational Expenses</h2>
          <p className="text-muted-foreground">Submit and approve operational expense requests</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!!isDownloadingReport}
                />
              }
            >
              {isDownloadingReport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onClick={() => handleExportReport('pdf')} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" />
                <span>PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportReport('excel')} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span>Excel</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportReport('csv')} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span>CSV</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => router.push('/opex/new')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> New Request
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {([
          { key: 'total', label: 'Total', badge: 'ALL', value: stats.total, icon: FileText, iconCls: 'text-slate-500', chip: 'bg-slate-500/10', card: 'border-slate-500/20 bg-slate-500/5 dark:bg-slate-500/10', badgeCls: 'border-slate-400/40 text-slate-600 dark:text-slate-300', valueCls: 'text-foreground' },
          { key: 'pa', label: 'Pending Accountant', badge: 'STAGE 1', value: stats.pendingAccountant, icon: Clock, iconCls: 'text-amber-500', chip: 'bg-amber-500/10', card: 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10', badgeCls: 'border-amber-400/40 text-amber-600 dark:text-amber-400', valueCls: 'text-amber-600 dark:text-amber-400' },
          { key: 'pm', label: 'Pending Manager', badge: 'STAGE 2', value: stats.pendingManager, icon: Clock, iconCls: 'text-blue-500', chip: 'bg-blue-500/10', card: 'border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10', badgeCls: 'border-blue-400/40 text-blue-600 dark:text-blue-400', valueCls: 'text-blue-600 dark:text-blue-400' },
          { key: 'ap', label: 'Approved', badge: 'DONE', value: stats.approved, icon: CheckCircle, iconCls: 'text-emerald-500', chip: 'bg-emerald-500/10', card: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10', badgeCls: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400', valueCls: 'text-emerald-600 dark:text-emerald-400' },
        ] as const).map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.key} className={cn('relative overflow-hidden shadow-sm', s.card)}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', s.chip)}>
                    <Icon className={cn('size-4', s.iconCls)} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-bold bg-transparent', s.badgeCls)}>{s.badge}</Badge>
                </div>
                <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', s.valueCls)}>
                  {loading ? <Skeleton className="h-8 w-16" /> : s.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search expenses..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PENDING_ACCOUNTANT">Pending Accountant</SelectItem>
            <SelectItem value="APPROVED_ACCOUNTANT">Pending Manager</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block overflow-hidden">
        {!loading && groupedExpenses.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="size-3.5" />
              {groupedExpenses.length} {groupedExpenses.length === 1 ? 'group' : 'groups'} · {filteredExpenses.length} expenses
              {parentGroupCount > 0 && (
                <span className="text-muted-foreground/70">· {parentGroupCount} collapsible on this page</span>
              )}
            </span>
            {parentGroupCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={toggleAll}>
                {allExpanded ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Button>
            )}
          </div>
        )}
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b bg-muted/20">
              <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Title</th>
              <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Amount</th>
              <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Vendor</th>
              <th className="text-center p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-center p-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b">{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>))}</tr>))
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No expenses found</td></tr>
              ) : (
                paginatedGroups.map((group) =>
                  group.kind === 'standalone'
                    ? renderExpenseRow(group.items[0])
                    : renderParentRow(group)
                )
              )}
            </tbody>
          </table>
          {paginationControls}
        </CardContent>
      </Card>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-4">
        {loading ? (
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
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-card text-muted-foreground">
            No expenses found
          </div>
        ) : (
          <>
            {paginatedGroups.map((group) =>
              group.kind === 'standalone'
                ? renderExpenseCard(group.items[0])
                : renderParentCard(group)
            )}
            <div className="rounded-lg border bg-card overflow-hidden">
              {paginationControls}
            </div>
          </>
        )}
      </div>



      <Dialog open={!!rejectionDialog} onOpenChange={() => setRejectionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejection Reason</DialogTitle></DialogHeader>
          <Textarea placeholder="Enter rejection reason..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectionDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectionReason}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedExpense} onOpenChange={() => setSelectedExpense(null)}>
        <DialogContent className="flex flex-col gap-0 w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[90dvh] sm:max-h-[85vh] overflow-hidden overflow-x-hidden touch-pan-y overscroll-x-none p-4 sm:p-6">
          <DialogHeader className="shrink-0 pb-3 border-b">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle className="text-lg sm:text-xl font-bold">Expense Details</DialogTitle>
              {selectedExpense && statusBadge(selectedExpense.status)}
            </div>
          </DialogHeader>
          
          {selectedExpense && (
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain space-y-5 sm:space-y-6 py-2">
              {/* Primary Info */}
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-semibold text-foreground break-words">
                  {selectedExpense.title || selectedExpense.description || 'Untitled Expense'}
                </h3>
                {selectedExpense.title && selectedExpense.description && (
                  <p className="text-muted-foreground text-sm break-words">{selectedExpense.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y py-4 my-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block uppercase font-medium tracking-wider">Amount</span>
                  <span className="text-xl font-mono font-bold text-foreground">
                    ${(selectedExpense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block uppercase font-medium tracking-wider">Category</span>
                  <span className="text-sm font-medium capitalize block mt-1">
                    {selectedExpense.category ? selectedExpense.category.replace(/-/g, ' ') : '-'}
                  </span>
                  {selectedExpense.subCategory && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {selectedExpense.subCategory}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Parties & Methods */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block uppercase font-medium">Vendor / Recipient</span>
                  <span className="text-sm font-medium block mt-1 break-words">
                    {selectedExpense.vendor || selectedExpense.recipientName || '-'}
                  </span>
                  {selectedExpense.recipientPhone && (
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Phone: {selectedExpense.recipientPhone}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground block uppercase font-medium">Payment Details</span>
                  <span className="text-sm font-medium block mt-1">
                    Method: <Badge variant="outline" className="ml-1 uppercase text-xs">{selectedExpense.paymentMethod || 'CASH'}</Badge>
                  </span>
                  {(selectedExpense.paymentRef || selectedExpense.reference) && (
                    <span className="text-xs text-muted-foreground block mt-1 break-all">
                      Ref: {selectedExpense.paymentRef || selectedExpense.reference}
                    </span>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              {selectedExpense.notes && (
                <div className="space-y-1.5 p-3 bg-muted/40 rounded-lg border border-border">
                  <span className="text-xs text-muted-foreground block uppercase font-medium">Notes</span>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedExpense.notes}</p>
                </div>
              )}

              {selectedExpense.status === 'REJECTED' && selectedExpense.rejectionReason && (
                <div className="space-y-1.5 p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-red-600 dark:text-red-400">
                  <span className="text-xs uppercase font-medium flex items-center gap-1">Rejection Reason</span>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedExpense.rejectionReason}</p>
                </div>
              )}

              {/* Source link */}
              {selectedExpense.subcontractorId && (
                <div className="space-y-2 p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                  <span className="text-xs text-amber-700 dark:text-amber-400 block uppercase font-semibold">Linked Subcontractor</span>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      {selectedExpense.subcontractorName || 'Subcontractor expense'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/20 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      onClick={() => {
                        setSelectedExpense(null)
                        router.push(`/subcontractors/${selectedExpense.subcontractorId}`)
                      }}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View Statement
                    </Button>
                  </div>
                </div>
              )}

              {selectedExpense.sourceJobId && (
                <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <span className="text-xs text-primary block uppercase font-semibold">Linked Job Card</span>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">This expense is generated from a job card.</span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="border-primary/20 hover:bg-primary/10 text-primary"
                      onClick={() => {
                        setSelectedExpense(null)
                        router.push(`/job-cards/${selectedExpense.sourceJobId}`)
                      }}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View Job Card
                    </Button>
                  </div>
                </div>
              )}

              {/* Audit logs */}
              <div className="space-y-2.5">
                <span className="text-xs text-muted-foreground block uppercase font-medium">Audit Trail</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-muted/20 p-3 rounded-lg border border-border/50">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium block">Accountant Approval</span>
                    {selectedExpense.accountantApprovedBy ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>{typeof selectedExpense.accountantApprovedBy === 'object' ? selectedExpense.accountantApprovedBy.displayName : selectedExpense.accountantApprovedBy}</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedExpense.accountantApprovedAt ? (selectedExpense.accountantApprovedAt.toDate ? selectedExpense.accountantApprovedAt.toDate().toLocaleString() : new Date(selectedExpense.accountantApprovedAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(selectedExpense.status) ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>System / Approved</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedExpense.createdAt ? (selectedExpense.createdAt.toDate ? selectedExpense.createdAt.toDate().toLocaleString() : new Date(selectedExpense.createdAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic block mt-1">Pending</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium block">Manager Approval</span>
                    {selectedExpense.managerApprovedBy ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>{typeof selectedExpense.managerApprovedBy === 'object' ? selectedExpense.managerApprovedBy.displayName : selectedExpense.managerApprovedBy}</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedExpense.managerApprovedAt ? (selectedExpense.managerApprovedAt.toDate ? selectedExpense.managerApprovedAt.toDate().toLocaleString() : new Date(selectedExpense.managerApprovedAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(selectedExpense.status) ? (
                      <span className="text-foreground block mt-1">
                        By: <strong>System / Approved</strong>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">
                          {selectedExpense.createdAt ? (selectedExpense.createdAt.toDate ? selectedExpense.createdAt.toDate().toLocaleString() : new Date(selectedExpense.createdAt).toLocaleString()) : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic block mt-1">Pending</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Attachments — view always; upload/remove for accountant/manager/admin */}
              {(() => {
                const urls = getExpenseAttachmentUrls(selectedExpense)
                return (
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground block uppercase font-medium">
                        Receipts & Attachments ({urls.length})
                      </span>
                      {canManageAttachments && (
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id="opex-detail-attachment-input"
                            className="hidden"
                            accept="image/*,.pdf"
                            multiple
                            onChange={handleOpexAttachmentUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-full sm:w-auto"
                            disabled={isUploadingAttachment}
                            onClick={() => document.getElementById('opex-detail-attachment-input')?.click()}
                          >
                            {isUploadingAttachment ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Uploading...</>
                            ) : (
                              <><Plus className="h-3.5 w-3.5 mr-1" /> Add Proof</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    {urls.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        {canManageAttachments
                          ? 'No attachments yet. Add proof of payment after approval if needed.'
                          : 'No attachments.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {urls.map((url: string, idx: number) => {
                          const isImage = url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.gif') || url.includes('alt=media')
                          return (
                            <div key={idx} className="flex flex-col border rounded-lg overflow-hidden bg-background">
                              {isImage && (
                                <div className="h-24 bg-muted flex items-center justify-center overflow-hidden border-b">
                                  <img src={url} alt={`Attachment ${idx + 1}`} className="object-cover w-full h-full hover:scale-105 transition-transform duration-200" />
                                </div>
                              )}
                              <div className="p-2 flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  Attachment {idx + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button size="sm" variant="ghost" className="text-primary hover:underline h-8 px-2" onClick={() => setViewerFile({ url, title: `Attachment ${idx + 1}` })}>
                                    <ExternalLink className="h-3 w-3 mr-1" /> View
                                  </Button>
                                  {canManageAttachments && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => handleOpexAttachmentRemove(idx)}
                                      title="Remove attachment"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          <DialogFooter className="mt-0 mx-0 mb-0 shrink-0 border-t pt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
            {selectedExpense && canDownloadExpensePdf(selectedExpense) && (
              <Button
                variant="outline"
                className="w-full sm:w-auto flex items-center justify-center gap-1.5"
                disabled={isDownloading === selectedExpense.id || (selectedExpense.pdfGenerated && !isSuperAdmin)}
                onClick={() => handlePdf(selectedExpense)}
              >
                {isDownloading === selectedExpense.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                  </>
                ) : selectedExpense.pdfGenerated ? (
                  <>
                    <Lock className="h-4 w-4" /> {isSuperAdmin ? 'Redownload PDF (Locked)' : 'PDF Locked'}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Download PDF
                  </>
                )}
              </Button>
            )}
            {selectedExpense && isSuperAdmin && selectedExpense.pdfGenerated && !selectedExpense.sourceJobId && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isUnlockingPdf === selectedExpense.id}
                onClick={() => handleUnlockPdf(selectedExpense)}
              >
                {isUnlockingPdf === selectedExpense.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                Unlock PDF
              </Button>
            )}
            {selectedExpense && isSuperAdmin && !selectedExpense.sourceJobId && (
              <Button
                variant="destructive"
                className="w-full sm:w-auto flex items-center justify-center gap-1.5"
                onClick={() => setExpenseToDelete(selectedExpense)}
              >
                <Trash2 className="h-4 w-4" /> Delete Expense
              </Button>
            )}
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedExpense(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!expenseToDelete} onOpenChange={() => setExpenseToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" /> Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              Are you sure you want to permanently delete this operational expense? This action is destructive and cannot be undone.
            </p>
            {expenseToDelete && (
              <div className="p-3 bg-muted rounded-lg border border-border space-y-1 text-foreground">
                <div><strong>Title:</strong> {expenseToDelete.title || expenseToDelete.description || 'Untitled Expense'}</div>
                <div><strong>Category:</strong> <span className="capitalize">{expenseToDelete.category ? expenseToDelete.category.replace(/-/g, ' ') : '-'}</span></div>
                <div><strong>Amount:</strong> <span className="font-mono font-bold">${(expenseToDelete.amount || 0).toFixed(2)}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} className="gap-1">
              <Trash2 className="h-4 w-4" /> Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FileViewerModal 
        isOpen={!!viewerFile} 
        onClose={() => setViewerFile(null)} 
        url={viewerFile?.url || ''} 
        title={viewerFile?.title} 
      />
    </div>
  )
}
