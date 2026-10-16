'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { 
  Filter, 
  Plus, 
  MoreHorizontal, 
  Eye, 
  Download, 
  Loader2, 
  Trash2, 
  Search, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react'
import AdminDeleteDialog from '@/components/AdminDeleteDialog'
import { exportDetailedJobCardsCsv } from '@/features/jobCards/utils/exportCsv'
import { generateJobCardsReportPdf } from '@/features/jobCards/utils/generateJobCardsReportPdf'

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVAL_PENDING_ACCOUNTANT', label: 'Pending Accountant' },
  { value: 'APPROVED_ACCOUNTANT', label: 'Approved by Accountant' },
  { value: 'APPROVAL_PENDING_MANAGER', label: 'Pending Manager' },
  { value: 'APPROVED_MANAGER', label: 'Approved' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

type SortKey = 'date' | 'jobNumber' | 'invoice' | 'due'

// Module-level cache so repeated sales reps across rows resolve to a single Firestore read
const userNameCache = new Map<string, Promise<string>>()

function fetchUserNameCached(uid: string): Promise<string> {
  const cached = userNameCache.get(uid)
  if (cached) return cached
  const promise = (async () => {
    try {
      const { getDoc, doc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (userSnap.exists()) {
        const data = userSnap.data()
        return data.displayName || data.email || uid
      }
      return 'Unknown User'
    } catch {
      userNameCache.delete(uid)
      return 'Unknown User'
    }
  })()
  userNameCache.set(uid, promise)
  return promise
}

function UserDisplay({ job }: { job: any }) {
  const [name, setName] = useState(job.submittedBy?.name || '')

  useEffect(() => {
    if (job.submittedBy?.name) return
    if (!job.submittedBy?.uid) return

    let active = true
    fetchUserNameCached(job.submittedBy.uid).then((resolved) => {
      if (active) setName(resolved)
    })
    return () => {
      active = false
    }
  }, [job])

  return <span>{name || '---'}</span>
}

export default function JobCardsPage() {
  const router = useRouter()
  const store = useJobCardsStore()
  const adminStore = useAdminStore()
  const authStore = useAuthStore()

  const { jobCards, loading } = store
  const { jobCategories, appSettings } = adminStore

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  // Delete Confirmation State
  const [jobPendingDelete, setJobPendingDelete] = useState<any>(null)

  // Admin Deletion State
  const isSuperAdmin = authStore.isSuperAdmin()
  const [isAdminDeleteOpen, setIsAdminDeleteOpen] = useState(false)
  const [selectedJobForAdminDelete, setSelectedJobForAdminDelete] = useState<any>(null)

  useEffect(() => {
    adminStore.fetchAll()
    store.fetchJobCards()
    return () => {
      store.cleanup()
    }
  }, [])

  const resolveJobCategoryName = (categoryId: string) => {
    if (!categoryId) return 'Unknown'
    const cat = jobCategories.find(c => c.id === categoryId)
    return cat ? cat.name : categoryId
  }

  const filteredJobs = useMemo(() => {
    let filtered = jobCards

    if (selectedCategoryId !== 'all') {
      filtered = filtered.filter(job => job.generalInfo?.jobCategoryId === selectedCategoryId)
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(job => (job.status || '').toUpperCase() === selectedStatus)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(job => {
        const jn = (job.generalInfo?.jobNumber || job.id).toLowerCase()
        const cust = (job.generalInfo?.recipientName || '').toLowerCase()
        const cat = resolveJobCategoryName(job.generalInfo?.jobCategoryId).toLowerCase()
        return jn.includes(q) || cust.includes(q) || cat.includes(q)
      })
    }

    return filtered
  }, [jobCards, selectedCategoryId, selectedStatus, searchQuery, jobCategories])

  const isAdmin = useMemo(() => {
    const roles = authStore.getRoles()
    return roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')
  }, [authStore])

  const getSafeGrandTotal = (job: any) => {
    if (job.generalInfo?.linkedCrmTotal != null && job.generalInfo.linkedCrmTotal > 0) {
      return job.generalInfo.linkedCrmTotal
    }
    if (job.generalInfo?.jobInvoiceValue != null && job.generalInfo.jobInvoiceValue > 0) {
      return job.generalInfo.jobInvoiceValue
    }

    const totals = job.totals || {}
    const summary = job.summary || {}
    const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(job.status)
    const lockedImplementationCost = job.lockedImplementationCost
    
    const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
    const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
    const implementationCost = isApproved && lockedImplementationCost != null 
      ? lockedImplementationCost 
      : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)

    const computedGrandTotal = inventoryIRDTotal + inventoryMUTotal + implementationCost
    return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? computedGrandTotal
  }

  const getAmountDue = (job: any) => {
    const invoiceValue = getSafeGrandTotal(job)
    const paid = job.totalPaid || 0
    return Math.max(0, invoiceValue - paid)
  }

  const getJobDate = (job: any): Date | null => {
    const raw = job.createdAt
    if (!raw) return null
    if (typeof raw.toDate === 'function') return raw.toDate()
    const parsed = new Date(raw)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  const sortedJobs = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filteredJobs].sort((a, b) => {
      switch (sortKey) {
        case 'jobNumber': {
          const an = a.generalInfo?.jobNumber || a.id
          const bn = b.generalInfo?.jobNumber || b.id
          return an.localeCompare(bn, undefined, { numeric: true }) * dir
        }
        case 'invoice':
          return (getSafeGrandTotal(a) - getSafeGrandTotal(b)) * dir
        case 'due':
          return (getAmountDue(a) - getAmountDue(b)) * dir
        case 'date':
        default:
          return ((getJobDate(a)?.getTime() || 0) - (getJobDate(b)?.getTime() || 0)) * dir
      }
    })
  }, [filteredJobs, sortKey, sortDir])

  const totalPages = Math.max(Math.ceil(sortedJobs.length / itemsPerPage), 1)
  const safePage = Math.min(currentPage, totalPages)

  const paginatedJobs = useMemo(() => {
    const startIndex = (safePage - 1) * itemsPerPage
    return sortedJobs.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedJobs, safePage, itemsPerPage])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'jobNumber' ? 'asc' : 'desc')
    }
    setCurrentPage(1)
  }

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="size-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
  }

  const cumulativeTotals = useMemo(() => {
    let invoiceTotal = 0
    let amountDueTotal = 0
    
    filteredJobs.forEach(job => {
      if (job.status && job.status.toUpperCase() === 'SUBMITTED') {
        return
      }
      invoiceTotal += getSafeGrandTotal(job)
      amountDueTotal += getAmountDue(job)
    })
    
    const collectedTotal = Math.max(0, invoiceTotal - amountDueTotal)
    
    return {
      invoiceTotal,
      amountDueTotal,
      collectedTotal
    }
  }, [filteredJobs])

  const handleExportCsv = async () => {
    setIsExporting(true)
    const toastId = toast.loading('Generating Detailed Report...')
    try {
      await exportDetailedJobCardsCsv(filteredJobs, resolveJobCategoryName, (id: string) => id)
      toast.success('Report Downloaded Successfully!', { id: toastId })
    } catch (err: any) {
      console.error('Export Error:', err)
      toast.error('Export Failed', { id: toastId, description: err.message })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    const toastId = toast.loading('Generating PDF Report...')
    try {
      const jobsWithCategoryNames = filteredJobs.map(job => ({
        ...job,
        generalInfo: {
          ...job.generalInfo,
          categoryName: resolveJobCategoryName(job.generalInfo?.jobCategoryId)
        }
      }))
      
      const selectedCategoryName = selectedCategoryId === 'all'
        ? 'All Categories'
        : resolveJobCategoryName(selectedCategoryId)

      const currentUser = authStore.user

      // AppSettings cast to any to satisfy signature constraint
      await generateJobCardsReportPdf(
        jobsWithCategoryNames,
        searchQuery,
        selectedCategoryName,
        appSettings as any,
        currentUser?.displayName || currentUser?.email || 'System User'
      )
      toast.success('PDF Report Downloaded Successfully!', { id: toastId })
    } catch (err: any) {
      console.error('PDF Export Error:', err)
      toast.error('PDF Export Failed', { id: toastId, description: err.message })
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteJob = (job: any) => {
    if (!['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status)) {
      toast.error('Deletion Blocked', { description: 'Approved Job Cards cannot be structurally deleted.' })
      return
    }
    setJobPendingDelete(job)
  }

  const confirmDeleteJob = async () => {
    const job = jobPendingDelete
    if (!job) return
    setJobPendingDelete(null)

    setIsDeleting(job.id)
    const toastId = toast.loading('Deleting Job Card & records...')
    try {
      await store.deleteJobCardCascade(job.id, job.status)
      toast.success('Job Card Deleted Successfully', { id: toastId })
    } catch (err: any) {
      toast.error('Deletion Failed', { id: toastId, description: err.message })
    } finally {
      setIsDeleting(null)
    }
  }

  const openAdminDelete = (job: any) => {
    setSelectedJobForAdminDelete(job)
    setIsAdminDeleteOpen(true)
  }

  const handleAdminDeleteConfirm = async () => {
    if (!selectedJobForAdminDelete) return
    
    const job = selectedJobForAdminDelete
    setIsAdminDeleteOpen(false)
    
    setIsDeleting(job.id)
    const toastId = toast.loading('ADMIN: Force deleting job card...')
    try {
      await store.deleteJobCardCascade(job.id, job.status, true)
      toast.success('Admin: Job Card Deleted Successfully', { id: toastId })
    } catch (err: any) {
      toast.error('Admin Delete Failed', { id: toastId, description: err.message })
    } finally {
      setIsDeleting(null)
      setSelectedJobForAdminDelete(null)
    }
  }

  const getStatusConfig = (status: string) => {
    const normalized = (status || '').toUpperCase()
    const configs: Record<string, { label: string; variant: string }> = {
      DRAFT: { label: 'Draft', variant: 'bg-muted text-muted-foreground' },
      SUBMITTED: { label: 'Submitted', variant: 'bg-blue-500 text-white hover:bg-blue-500/80' },
      APPROVAL_PENDING_ACCOUNTANT: { label: 'Pending Accountant', variant: 'bg-brand-secondary text-white' },
      APPROVED_ACCOUNTANT: { label: 'Approved by Accountant', variant: 'bg-blue-500 text-white' },
      APPROVAL_PENDING_MANAGER: { label: 'Pending Manager', variant: 'bg-brand-secondary text-white' },
      APPROVED_MANAGER: { label: 'Approved', variant: 'bg-brand-primary text-white' },
      COMPLETED: { label: 'Completed', variant: 'bg-brand-primary text-white' },
      CLOSED: { label: 'Closed', variant: 'bg-muted text-muted-foreground' },
      REJECTED: { label: 'Rejected', variant: 'bg-destructive text-destructive-foreground' },
      CANCELLED: { label: 'Cancelled', variant: 'bg-destructive text-destructive-foreground' },
    }
    return configs[normalized] || { label: status.replace(/_/g, ' '), variant: 'bg-muted text-muted-foreground' }
  }

  const brandPrimaryColor = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'
  const brandSecondaryColor = appSettings?.uiColors?.brandSecondaryColor || '#ff8903'

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="w-full lg:w-auto">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Job Cards</h2>
          <p className="text-sm md:text-base text-muted-foreground">Manage and track your service job cards.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-[250px] lg:w-[300px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input 
              value={searchQuery} 
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }} 
              placeholder="Search..."
              className="pl-9 h-10 lg:h-9 bg-card border-brand-primary/30 focus-visible:ring-brand-primary/50 text-sm" 
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedCategoryId} onValueChange={(val) => { setSelectedCategoryId(val || 'all'); setCurrentPage(1) }}>
              <SelectTrigger className="flex-1 sm:w-[160px] lg:w-[180px] h-10 lg:h-9 bg-card border-brand-primary/30 text-sm">
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="All Categories" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {jobCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={(val) => { setSelectedStatus(val || 'all'); setCurrentPage(1) }}>
              <SelectTrigger className="flex-1 sm:w-[150px] lg:w-[170px] h-10 lg:h-9 bg-card border-brand-primary/30 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-10 w-10 sm:w-auto lg:h-9 items-center gap-1.5 text-sm cursor-pointer"
                    disabled={isExporting}
                  />
                }
              >
                {!isExporting ? (
                  <>
                    <Download className="size-4" />
                    <span className="hidden sm:inline">Export</span>
                    <ChevronDown className="size-3.5 opacity-60 ml-0.5" />
                  </>
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span className="hidden sm:inline">...</span>
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-card border border-border">
                <DropdownMenuItem onClick={handleExportCsv} className="cursor-pointer hover:bg-brand-primary/10">
                  <FileText className="mr-2 size-4 text-muted-foreground" />
                  <span>Export as CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer hover:bg-brand-primary/10 font-medium">
                  <FileText className="mr-2 size-4 text-brand-primary" style={{ color: brandPrimaryColor }} />
                  <span>Export as PDF</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button 
            size="sm"
            style={{ backgroundColor: brandSecondaryColor, borderColor: brandSecondaryColor }}
            className="h-12 sm:h-10 lg:h-9 hover:opacity-90 text-white font-bold text-sm" 
            onClick={() => router.push('/job-cards/new')}
          >
            <Plus className="mr-2 size-5 sm:size-4" />
            Add Job Card
          </Button>
        </div>
      </div>

      {!loading && filteredJobs.length > 0 && (
        <div className="space-y-1.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-500/5 border-slate-500/20 shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Invoice Value</p>
                <h3 className="text-2xl font-black text-slate-700 dark:text-slate-300 tracking-tight">
                  ${cumulativeTotals.invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="p-3 bg-slate-500/10 rounded-full">
                <FileText className="size-6 text-slate-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/5 border-emerald-500/20 shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Payments Collected</p>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  ${cumulativeTotals.collectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-full">
                <CheckCircle2 className="size-6 text-emerald-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-500/5 border-amber-500/20 shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Outstanding Balance</p>
                <h3 className="text-2xl font-black text-amber-600 dark:text-amber-500 tracking-tight">
                  ${cumulativeTotals.amountDueTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-full">
                <AlertCircle className="size-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-[11px] text-muted-foreground pl-1">
          Totals reflect the current filters and exclude submitted (unapproved) job cards.
        </p>
        </div>
      )}

      {loading && filteredJobs.length === 0 && (
        <Card className="bg-card/90 border border-brand-primary/20 overflow-hidden">
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-[120px]" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-[100px]" />
                <Skeleton className="h-5 w-[80px]" />
                <Skeleton className="h-5 w-[90px]" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && filteredJobs.length === 0 && (
        <div className="text-center py-12 border rounded-lg bg-card text-muted-foreground">
          <Filter className="size-12 mx-auto mb-2 opacity-20" />
          <p className="mb-4">No job cards found matching the criteria.</p>
          {jobCards.length === 0 ? (
            <Button
              variant="outline"
              onClick={() => router.push('/job-cards/new')}
            >
              <Plus className="mr-2 size-4" />
              Add your first Job Card
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => { setSearchQuery(''); setSelectedCategoryId('all'); setSelectedStatus('all'); setCurrentPage(1) }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Desktop View (Table) */}
      {!loading && filteredJobs.length > 0 && (
        <Card className="hidden md:block bg-card/90 dark:bg-card/90 backdrop-blur-lg border border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-auto scrollbar-thin max-h-[65vh]">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0] shadow-brand-primary/20">
                  <TableRow className="border-b hover:bg-transparent border-brand-primary/20 dark:border-brand-primary/30">
                    <TableHead className="w-[130px] text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => handleSort('jobNumber')} className="flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-foreground">
                        Job Number {renderSortIcon('jobNumber')}
                      </button>
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Customer
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Category
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Sales Rep
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => handleSort('date')} className="flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-foreground">
                        Date {renderSortIcon('date')}
                      </button>
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => handleSort('invoice')} className="flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-foreground">
                        Invoice Value {renderSortIcon('invoice')}
                      </button>
                    </TableHead>
                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <button type="button" onClick={() => handleSort('due')} className="flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-foreground">
                        Amount Due {renderSortIcon('due')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedJobs.map((job) => (
                    <TableRow 
                      key={job.id}
                      onClick={() => router.push(`/job-cards/${job.id}`)}
                      className="cursor-pointer border-b text-[13px] transition-colors duration-200 border-brand-primary/10 hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10"
                    >
                      <TableCell className="py-3 px-4">
                        <span
                          style={{ color: brandPrimaryColor }}
                          className="font-bold tabular-nums"
                        >
                          {job.generalInfo?.jobNumber || job.id.substring(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell className="text-foreground/90 dark:text-white/90 font-medium">
                        {job.generalInfo?.recipientName || '---'}
                      </TableCell>
                      <TableCell className="text-foreground/90 dark:text-white/90">
                        <div>{resolveJobCategoryName(job.generalInfo?.jobCategoryId)}</div>
                        {job.generalInfo?.dimensionsOfStructure && (
                          <div className="text-[11px] text-muted-foreground">{job.generalInfo.dimensionsOfStructure}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground/90 dark:text-white/90">
                        <UserDisplay job={job} />
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusConfig(job.status).variant} font-bold text-[10px] px-2 py-0.5 border-none shadow-sm capitalize`}>
                          {getStatusConfig(job.status).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {getJobDate(job)?.toLocaleDateString('en-US') || '---'}
                      </TableCell>
                      <TableCell className="tabular-nums font-semibold whitespace-nowrap">
                        ${getSafeGrandTotal(job).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="tabular-nums font-semibold whitespace-nowrap">
                        {getAmountDue(job) <= 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-500/30">
                            Fully Paid
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-500 font-bold">
                            ${getAmountDue(job).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-foreground/70 dark:text-white/70 hover:text-foreground dark:hover:text-white hover:bg-brand-primary/10 cursor-pointer"
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border border-border">
                            <DropdownMenuItem onClick={() => router.push(`/job-cards/${job.id}`)}>
                              <Eye className="mr-2 size-4" />
                              View Details
                            </DropdownMenuItem>
                            {['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status) && (
                              <DropdownMenuItem
                                onClick={() => handleDeleteJob(job)} 
                                className="text-destructive font-medium"
                                disabled={isDeleting === job.id}
                              >
                                {isDeleting === job.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 size-4" />
                                )}
                                Delete Job Card
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <DropdownMenuItem className="text-orange-600 font-medium">
                                Cancel Job
                              </DropdownMenuItem>
                            )}
                            {isSuperAdmin && (
                              <DropdownMenuItem onClick={() => openAdminDelete(job)} className="text-destructive font-bold bg-destructive/5">
                                <Trash2 className="mr-2 size-4" />
                                Force Delete (Admin)
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile View (Cards) */}
      {!loading && filteredJobs.length > 0 && (
        <div className="md:hidden space-y-4">
          {paginatedJobs.map((job) => (
            <div 
              key={job.id} 
              onClick={() => router.push(`/job-cards/${job.id}`)}
              className="group relative bg-card/90 dark:bg-card/90 backdrop-blur-lg border border-brand-primary/10 rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Number</span>
                    <div className="text-base font-black text-brand-primary flex items-center gap-2" style={{ color: brandPrimaryColor }}>
                      {job.generalInfo?.jobNumber || job.id.substring(0, 8)}
                      {['APPROVED_MANAGER', 'COMPLETED'].includes(job.status) && (
                        <div className="size-1.5 rounded-full bg-brand-primary animate-pulse" style={{ backgroundColor: brandPrimaryColor }}></div>
                      )}
                    </div>
                  </div>
                  <Badge className={`${getStatusConfig(job.status).variant} font-black text-[9px] px-2 py-0.5 border-none uppercase tracking-tighter`}>
                    {getStatusConfig(job.status).label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer</span>
                    <p className="text-sm font-semibold truncate">{job.generalInfo?.recipientName || '---'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Category</span>
                    <p className="text-sm font-medium truncate">{resolveJobCategoryName(job.generalInfo?.jobCategoryId)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-brand-primary/5">
                  <div className="flex items-center gap-6">
                    <div className="space-y-0.5">
                       <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Invoice Value</span>
                       <p className="text-sm font-black text-brand-primary" style={{ color: brandPrimaryColor }}>
                          ${getSafeGrandTotal(job).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </p>
                    </div>
                    <div className="space-y-0.5">
                       <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount Due</span>
                       <p className="text-sm font-black">
                          {getAmountDue(job) <= 0 ? (
                            <span className="text-[9px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 dark:border-emerald-500/30">
                              Paid
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-500">
                              ${getAmountDue(job).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                       </p>
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="secondary"
                          size="icon"
                          className="rounded-full h-10 w-10 bg-brand-primary/5 border-none cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <MoreHorizontal className="size-5 text-brand-primary" style={{ color: brandPrimaryColor }} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-card border border-border">
                      <DropdownMenuItem onClick={() => router.push(`/job-cards/${job.id}`)}>
                        <Eye className="mr-2 size-4" /> View Details
                      </DropdownMenuItem>
                      {['DRAFT', 'SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'].includes(job.status) && (
                        <DropdownMenuItem
                          onClick={() => handleDeleteJob(job)} 
                          className="text-destructive font-bold"
                          disabled={isDeleting === job.id}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete Job Card
                        </DropdownMenuItem>
                      )}
                      {isSuperAdmin && (
                        <DropdownMenuItem onClick={() => openAdminDelete(job)} className="text-destructive font-bold bg-destructive/5">
                          <Trash2 className="mr-2 size-4" /> Force Delete (Admin)
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer */}
      {!loading && filteredJobs.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">{(safePage - 1) * itemsPerPage + 1}</span>
              {' '}to{' '}
              <span className="font-bold text-foreground">{Math.min(safePage * itemsPerPage, sortedJobs.length)}</span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{sortedJobs.length}</span>
              {' '}job cards
              {sortedJobs.length !== jobCards.length && (
                <span> (filtered from {jobCards.length})</span>
              )}
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
                  className="bg-background border border-muted rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-brand-primary focus:outline-none cursor-pointer text-foreground font-medium"
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
                  className="h-8 w-8 text-foreground"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={safePage === 1}
                  onClick={() => setCurrentPage(Math.max(safePage - 1, 1))}
                  title="Previous Page"
                >
                  &lsaquo;
                </Button>

                <span className="text-xs font-medium px-2 whitespace-nowrap">
                  Page {safePage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={safePage === totalPages}
                  onClick={() => setCurrentPage(Math.min(safePage + 1, totalPages))}
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={safePage === totalPages}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!jobPendingDelete} onOpenChange={(open) => { if (!open) setJobPendingDelete(null) }}>
        <DialogContent className="sm:max-w-[425px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Delete Job Card
            </DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground">
              You are about to permanently delete Job Card{' '}
              <span className="font-bold text-foreground">
                {jobPendingDelete?.generalInfo?.jobNumber || jobPendingDelete?.id?.substring(0, 8)}
              </span>{' '}
              and its linked records.
              <span className="block mt-2 font-bold text-foreground">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setJobPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" className="gap-2" onClick={confirmDeleteJob}>
              <Trash2 className="size-4" />
              Delete Job Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedJobForAdminDelete && (
        <AdminDeleteDialog
          open={isAdminDeleteOpen}
          onOpenChange={setIsAdminDeleteOpen}
          title="Admin Force Delete"
          description={`You are about to PERMANENTLY delete Job Card ${selectedJobForAdminDelete.generalInfo?.jobNumber || selectedJobForAdminDelete.id}. This will bypass all safety checks and clean up linked items.`}
          targetId={selectedJobForAdminDelete.generalInfo?.jobNumber || selectedJobForAdminDelete.id}
          loading={isDeleting === selectedJobForAdminDelete.id}
          onConfirm={handleAdminDeleteConfirm}
        />
      )}
    </div>
  )
}
