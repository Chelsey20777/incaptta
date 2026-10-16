'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useJobCardsStore, type JobCard, type JobCardsState } from '@/stores/job-cards-store'
import { useAuthStore } from '@/stores/auth-store'
import { computeFinancials } from '@/lib/financial-engine'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Briefcase,
  Search,
  Loader2,
  Calendar,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  XCircle,
  Info,
  Package,
  Receipt,
  PieChart,
  Wrench,
  Clock,
  Trash2
} from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)

const formatDate = (val: any) => {
  if (!val) return ''
  if (typeof val.toDate === 'function') return val.toDate().toLocaleString()
  return new Date(val).toLocaleString()
}

export default function JobCardsPage() {
  const store = useJobCardsStore()
  const auth = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const isManager = auth.hasRole('MANAGER') || auth.hasRole('ADMIN') || auth.hasRole('SUPER_ADMIN')
  const isAccountant = auth.hasRole('ACCOUNTANT') || auth.hasRole('ADMIN') || auth.hasRole('SUPER_ADMIN')

  useEffect(() => {
    const unsubItems = store.fetchItems()
    const unsubCats = store.fetchCategories()
    const unsubTools = store.fetchToolsRegistry()
    const unsubEmps = store.fetchEmployees()
    return () => {
      unsubItems()
      unsubCats()
      unsubTools()
      unsubEmps()
      store.cleanup()
    }
  }, [])

  const getJobNum = (jc: JobCard) => store.getJobNum(jc)
  const getJobTitle = (jc: JobCard) => store.getJobTitle(jc)
  const getRecipient = (jc: JobCard) => store.getRecipient(jc)
  const getStartDate = (jc: JobCard) => store.getStartDate(jc)
  const getLocation = (jc: JobCard) => store.getLocation(jc)
  const getPriority = (jc: JobCard) => store.getPriority(jc)
  const getInvoiceValue = (jc: JobCard) => store.getInvoiceValue(jc)
  const getAmountDue = (jc: JobCard) => store.getAmountDue(jc)
  const getStatusLabel = (status: string) => store.getStatusLabel(status)
  const statusBadgeStyle = (status: string) => store.statusBadgeStyle(status)
  const getPriorityStyle = (priority: string) => store.getPriorityStyle(priority)

  const stats = useMemo(() => {
    const items = store.items
    const activeList = items.filter(j => ['IN_PROGRESS', 'APPROVED_MANAGER', 'APPROVED'].includes(j.status))
    const pendingList = items.filter(j => ['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(j.status))
    const completedList = items.filter(j => j.status === 'COMPLETED')
    return { total: items.length, active: activeList.length, pending: pendingList.length, completed: completedList.length }
  }, [store.items])

  const filteredJobCards = useMemo(() => {
    let list = [...store.items]
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') list = list.filter(j => ['SUBMITTED', 'APPROVAL_PENDING_MANAGER', 'APPROVAL_PENDING_ACCOUNTANT'].includes(j.status))
      else if (statusFilter === 'active') list = list.filter(j => ['IN_PROGRESS', 'APPROVED_MANAGER', 'APPROVED'].includes(j.status))
      else if (statusFilter === 'completed') list = list.filter(j => j.status === 'COMPLETED')
      else if (statusFilter === 'draft') list = list.filter(j => j.status === 'DRAFT')
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(j => {
        const num = getJobNum(j).toLowerCase()
        const title = getJobTitle(j).toLowerCase()
        const recipient = getRecipient(j).toLowerCase()
        const location = getLocation(j).toLowerCase()
        return num.includes(q) || title.includes(q) || recipient.includes(q) || location.includes(q)
      })
    }
    return list.sort((a, b) => getJobNum(b).localeCompare(getJobNum(a)))
  }, [store.items, searchQuery, statusFilter])

  const cumulativeTotals = useMemo(() => {
    let invoiceTotal = 0
    let amountDueTotal = 0
    filteredJobCards.forEach(jc => {
      if (jc.status && jc.status.toUpperCase() === 'SUBMITTED') return
      invoiceTotal += getInvoiceValue(jc)
      amountDueTotal += getAmountDue(jc)
    })
    const collectedTotal = Math.max(0, invoiceTotal - amountDueTotal)
    return { invoiceTotal, amountDueTotal, collectedTotal }
  }, [filteredJobCards])

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">Job Cards</h1>
          <p className="text-xs text-muted-foreground">Manage & authorize job activities</p>
        </div>
        <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">
          {stats.total} TOTAL
        </Badge>
      </header>

      {/* Overview Stats */}
      <section className="p-4 grid grid-cols-3 gap-2">
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-3 space-y-0.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Active Jobs</p>
            <p className="text-lg font-black text-[#79c21b]">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-3 space-y-0.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Pending Appr.</p>
            <p className="text-lg font-black text-[#ff8903]">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border shadow-sm">
          <CardContent className="p-3 space-y-0.5 text-center">
            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Completed</p>
            <p className="text-lg font-black text-blue-500">{stats.completed}</p>
          </CardContent>
        </Card>
      </section>

      {/* Financial Summary */}
      {!store.loading && filteredJobCards.length > 0 && (
        <section className="px-4 pb-2">
          <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
            <Card className="min-w-[220px] flex-1 snap-start bg-[#79c21b]/5 border-[#79c21b]/20 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Invoice Value</p>
                  <h3 className="text-lg font-black tracking-tight text-[#79c21b]">{fmt(cumulativeTotals.invoiceTotal)}</h3>
                </div>
                <div className="p-2 bg-[#79c21b]/10 rounded-full"><FileText className="size-4 text-[#79c21b]" /></div>
              </CardContent>
            </Card>
            <Card className="min-w-[220px] flex-1 snap-start bg-emerald-500/5 border-emerald-500/20 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Payments Collected</p>
                  <h3 className="text-lg font-black text-emerald-500 tracking-tight">{fmt(cumulativeTotals.collectedTotal)}</h3>
                </div>
                <div className="p-2 bg-emerald-500/10 rounded-full"><CheckCircle2 className="size-4 text-emerald-500" /></div>
              </CardContent>
            </Card>
            <Card className="min-w-[220px] flex-1 snap-start bg-amber-500/5 border-amber-500/20 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Total Outstanding Balance</p>
                  <h3 className="text-lg font-black text-amber-500 tracking-tight">{fmt(cumulativeTotals.amountDueTotal)}</h3>
                </div>
                <div className="p-2 bg-amber-500/10 rounded-full"><AlertCircle className="size-4 text-amber-500" /></div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="px-4 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Job #, client, title..."
            className="pl-9 h-10 border bg-muted/20"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['all', 'pending', 'active', 'completed', 'draft'].map((s) => (
            <Button
              key={s}
              variant="secondary"
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={`capitalize text-[10px] font-black px-3 rounded-full shrink-0 ${statusFilter === s ? 'bg-[#ff8903] text-white' : ''}`}
            >
              {s === 'all' ? 'All Jobs' : s}
            </Button>
          ))}
        </div>
      </section>

      {/* Listing */}
      <main className="p-4 flex-1 space-y-3">
        {store.loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}

        {!store.loading && filteredJobCards.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No job cards match this criteria.</p>
          </div>
        )}

        {!store.loading && filteredJobCards.map((jc) => (
          <Card
            key={jc.id}
            className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => store.openDetails(jc)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <Briefcase className="size-5 text-[#ff8903]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black text-[#ff8903] tracking-tight">{getJobNum(jc)}</span>
                      <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase rounded ${getPriorityStyle(getPriority(jc))}`}>
                        {getPriority(jc)}
                      </Badge>
                    </div>
                    <h3 className="font-black text-sm tracking-tight text-foreground truncate max-w-[170px] mt-0.5">{getJobTitle(jc)}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[170px]">Client: {getRecipient(jc)}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] font-bold h-4 px-1.5 rounded shrink-0 ${statusBadgeStyle(jc.status)}`}>
                  {getStatusLabel(jc.status)}
                </Badge>
              </div>
              <div className="flex items-center justify-between border-t border-dashed pt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="size-3.5" /> Start: {getStartDate(jc)}</span>
                <div className="flex gap-4 text-right">
                  <div>
                    <span className="text-[8px] block uppercase text-muted-foreground">Invoice Value</span>
                    <span className="font-black text-xs text-[#79c21b]">{fmt(getInvoiceValue(jc))}</span>
                  </div>
                  <div>
                    <span className="text-[8px] block uppercase text-muted-foreground">Amount Due</span>
                    {getAmountDue(jc) <= 0 ? (
                      <span className="text-[8px] font-black text-green-500 bg-green-500/10 px-1 py-0.25 rounded uppercase">Paid</span>
                    ) : (
                      <span className="font-black text-xs text-[#ff8903]">{fmt(getAmountDue(jc))}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </main>

      {/* Details Modal */}
      {store.showModal && store.selectedItem && (
        <JobCardDetailModal
          store={store}
          isManager={isManager}
          isAccountant={isAccountant}
        />
      )}
    </div>
  )
}

function JobCardDetailModal({
  store,
  isManager,
  isAccountant
}: {
  store: JobCardsState
  isManager: boolean
  isAccountant: boolean
}) {
  const jc = store.selectedItem!
  const [activeTab, setActiveTab] = useState(store.activeTab)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedToolId, setSelectedToolId] = useState('')

  const getFileName = (url: string) => {
    if (!url) return 'Document'
    try {
      const decoded = decodeURIComponent(url)
      const pathPart = decoded.split('?')[0] || ''
      const parts = pathPart.split('/')
      const fullName = parts[parts.length - 1] || ''
      return fullName.replace(/^\d+_/g, '')
    } catch { return 'Document' }
  }

  const selectedTotalPaid = useMemo(() =>
    store.selectedPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
    [store.selectedPayments]
  )

  const selectedFinancials = useMemo(() => {
    if (!jc) return null

    let sections: any[] = []
    if (store.selectedRequisitionItems.length > 0) sections = store.selectedRequisitionItems
    else if (Array.isArray(jc.requisitionSections) && jc.requisitionSections.length > 0) sections = jc.requisitionSections

    const normalizedSections = sections.map((section: any) => ({
      ...section,
      items: (section.items || []).map((item: any) => ({
        ...item,
        itemName: item.itemName || item.inventoryItemName || 'Unnamed Item',
        qty: Number(item.qty || item.qtyRequired || 0),
        irdSellingPrice: Number(item.irdSellingPrice || item.irdSellingPriceSnapshot || 0),
        costSnapshot: Number(item.costSnapshot || item.purchaseCostSnapshot || item.totalCostSnapshot || 0),
        twidMarkupPercent: Number(item.twidMarkupPercent || item.markupPercent || 0),
        rowIRDTot: Number(item.rowIRDTot || item.rowIRDTotal || 0),
        rowMUTot: Number(item.rowMUTot || item.rowMUTotal || 0),
        rowGrandTot: Number(item.rowGrandTot || item.rowGrandTotal || 0)
      }))
    }))

    const baseFinancials = computeFinancials(
      normalizedSections,
      store.selectedAdHocExpenses,
      store.selectedInventoryReturns,
      store.selectedStaffRates,
      store.selectedReferrers,
      jc.status
    )

    const getLockedValue = () => {
      const crmTotal = jc.generalInfo?.linkedCrmTotal
      if (crmTotal != null && crmTotal > 0) return crmTotal
      const locked = jc.lockedTotalInvoiceValue
      if (locked != null && locked > 0) return locked
      return baseFinancials.totalInvoiceValue ?? 0
    }

    const initialInvoiceValue = getLockedValue()
    const revenue = initialInvoiceValue
    const baseCost = baseFinancials.totalCost || 0
    const referrerCommission = baseFinancials.referrerCommission || 0
    const totalCost = baseCost
    const netProfit = revenue - totalCost
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
    const totalOperationalGross = (baseFinancials.irdGrossRevenue || 0) + (baseFinancials.implementationCost || 0) + referrerCommission
    const twidNetAfterAdjustments = revenue - totalOperationalGross
    const twidRevenuePercentage = initialInvoiceValue > 0 ? (twidNetAfterAdjustments / initialInvoiceValue) * 100 : 0
    const irdCumulativeNetRevenue = (baseFinancials.irdGrossRevenue || 0) - (baseFinancials.irdBaseCost || 0)
    const irdRevenuePercentage = (baseFinancials.irdGrossRevenue || 0) > 0
      ? (irdCumulativeNetRevenue / (baseFinancials.irdGrossRevenue || 0)) * 100 : 0

    return {
      ...baseFinancials,
      initialInvoiceValue,
      totalRevenue: revenue,
      totalCost,
      totalOperationalGross,
      twidNetAfterAdjustments,
      twidRevenuePercentage,
      netProfit,
      profitMargin,
      referrerCommission,
      commissionPercentage: baseFinancials.commissionPercentage || 0,
      irdNetRevenue: baseFinancials.irdGrossRevenue || 0,
      irdCumulativeNetRevenue,
      irdRevenuePercentage
    }
  }, [jc, store.selectedRequisitionItems, store.selectedAdHocExpenses, store.selectedInventoryReturns, store.selectedStaffRates, store.selectedReferrers])

  const selectedBalanceDue = useMemo(() => {
    const total = selectedFinancials?.totalRevenue ?? 0
    return Math.max(0, total - selectedTotalPaid)
  }, [selectedFinancials, selectedTotalPaid])

  const selectedPaymentProgress = useMemo(() => {
    const total = selectedFinancials?.totalRevenue ?? 0
    if (total <= 0) return 0
    return Math.min(100, (selectedTotalPaid / total) * 100)
  }, [selectedFinancials, selectedTotalPaid])

  const selectedIsFullyPaid = selectedBalanceDue <= 0

  const handleItemApproval = async (
    arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates',
    itemId: string,
    newStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
  ) => {
    setIsSubmitting(true)
    await store.handleItemApproval(arrayField, itemId, newStatus)
    setIsSubmitting(false)
  }

  const handleCommissionApproval = async (commissionId: string, targetStatus: 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER') => {
    setIsSubmitting(true)
    await store.handleCommissionApproval(commissionId, targetStatus)
    setIsSubmitting(false)
  }

  const handleRejectCommission = async (commissionId: string) => {
    setIsSubmitting(true)
    await store.handleRejectCommission(commissionId)
    setIsSubmitting(false)
  }

  const handleUpdateToolState = async (toolId: string, newState: 'Allocated' | 'Returned' | 'Damaged') => {
    setIsSubmitting(true)
    await store.handleUpdateToolState(toolId, newState)
    setIsSubmitting(false)
  }

  const handleDeallocateTool = async (toolId: string) => {
    setIsSubmitting(true)
    await store.handleDeallocateTool(toolId)
    setIsSubmitting(false)
  }

  const handleAllocateTool = async () => {
    if (!selectedToolId) return
    setIsSubmitting(true)
    await store.handleAllocateTool(selectedToolId)
    setSelectedToolId('')
    setIsSubmitting(false)
  }

  const tabs = [
    { id: 'info' as const, label: 'Info', icon: Info },
    { id: 'materials' as const, label: 'IRD Inventory', icon: Package },
    { id: 'expenses' as const, label: 'Expenses', icon: Receipt },
    { id: 'labor' as const, label: 'Labor', icon: Briefcase },
    { id: 'tools' as const, label: 'Tools', icon: Wrench },
    { id: 'financials' as const, label: 'Financials', icon: PieChart }
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-card border shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center shrink-0 bg-muted/20">
          <div>
            <h2 className="text-base font-black tracking-tight">Job Card Details</h2>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="text-[10px] font-black text-[#ff8903]">{store.getJobNum(jc)}</span>
              <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase rounded ${store.getPriorityStyle(store.getPriority(jc))}`}>
                {store.getPriority(jc)}
              </Badge>
              <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase rounded ${store.statusBadgeStyle(jc.status)}`}>
                {store.getStatusLabel(jc.status)}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => store.closeDetails()}>
            <X className="size-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="px-4 py-2 border-b flex gap-1 overflow-x-auto bg-muted/10 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight shrink-0 transition-all border ${
                activeTab === tab.id
                  ? 'bg-[#ff8903] text-white border-[#ff8903] shadow-sm'
                  : 'bg-card text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <tab.icon className="size-3" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* TAB 1: Info */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 border-b pb-1">
                  <Info className="size-4 text-[#ff8903]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">General Information</span>
                </div>
                <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border">
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Job Number</span>
                    <span className="font-bold text-foreground">{store.getJobNum(jc)}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Category</span>
                    <span className="font-bold text-foreground capitalize">{store.resolveJobCategoryName(jc.generalInfo?.jobCategoryId)}</span>
                  </div>
                  {jc.generalInfo?.linkedCrmNumber && (
                    <div>
                      <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Linked CRM Document</span>
                      <span className="font-black text-[#ff8903] flex items-center gap-1">
                        {jc.generalInfo.linkedCrmNumber}
                        <Badge variant="outline" className="text-[7px] h-3.5 px-1 uppercase font-black bg-[#ff8903]/10 border-[#ff8903]/20 text-[#ff8903]">
                          {jc.generalInfo.linkedCrmType || 'QUOTE'}
                        </Badge>
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Start Date</span>
                    <span className="font-bold text-foreground">{store.getStartDate(jc)}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Project Location</span>
                    <span className="font-bold text-foreground flex items-center gap-0.5">
                      <MapPin className="size-3 text-[#ff8903] shrink-0" /> {store.getLocation(jc)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Structure Dimensions</span>
                    <span className="font-bold text-foreground">{jc.generalInfo?.dimensionsOfStructure || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Recipient Name</span>
                    <span className="font-bold text-foreground">{store.getRecipient(jc)}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Recipient Phone</span>
                    <span className="font-bold text-foreground">{jc.generalInfo?.recipientPhone || '—'}</span>
                  </div>
                  {jc.generalInfo?.ecocashOrBankAccount && (
                    <div className="col-span-2">
                      <span className="block text-[8px] uppercase font-black text-muted-foreground/75">Ecocash / Bank Account</span>
                      <span className="font-bold text-foreground">{jc.generalInfo.ecocashOrBankAccount}</span>
                    </div>
                  )}
                </div>
                {jc.generalInfo?.projectDescription && (
                  <div className="bg-muted/10 p-3 rounded-2xl border border-dashed">
                    <span className="block text-[8px] uppercase font-black text-muted-foreground/75 mb-1">Scope Description</span>
                    <p className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{jc.generalInfo.projectDescription}</p>
                  </div>
                )}
              </div>
              {jc.approvalTimeline && jc.approvalTimeline.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 border-b pb-1">
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Timeline Log</span>
                  </div>
                  <div className="space-y-2 border-l border-dashed border-muted-foreground/35 pl-3 ml-1">
                    {jc.approvalTimeline.map((log, idx) => (
                      <div key={idx} className="relative text-[10px] space-y-0.5">
                        <span className="absolute -left-[17px] top-1 size-2 rounded-full bg-[#ff8903]" />
                        <div className="flex justify-between font-black">
                          <span>{log.user} <span className="text-[8px] font-normal text-muted-foreground">({log.role})</span></span>
                          <span className="text-[8px] text-muted-foreground">{log.date ? new Date(log.date).toLocaleDateString() : ''}</span>
                        </div>
                        <p className="text-muted-foreground text-[9px]">{log.status}</p>
                        {log.comment && <p className="italic text-[9px] text-[#ff8903] bg-muted/20 p-1.5 rounded mt-0.5">&ldquo;{log.comment}&rdquo;</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Materials */}
          {activeTab === 'materials' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b pb-1">
                <Package className="size-4 text-[#ff8903]" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">IRD Inventory Requisitions</span>
              </div>
              {store.selectedRequisitionItems.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No IRD inventory requisitions listed.</div>
              ) : (
                <div className="space-y-3">
                  {store.selectedRequisitionItems.map((section, idx) => (
                    <div key={idx} className="border rounded-xl p-2.5 space-y-1.5 bg-muted/5">
                      <p className="font-black text-[10px] uppercase text-[#ff8903] border-b pb-1 flex justify-between items-center">
                        <span>{store.resolveJobCategoryName(section.jobCategoryId)}</span>
                        {section.description && <span className="text-[8px] font-normal text-muted-foreground normal-case">{section.description}</span>}
                      </p>
                      {(!section.items || section.items.length === 0) ? (
                        <div className="text-muted-foreground text-[9px] italic">No items.</div>
                      ) : (
                        <div className="space-y-2">
                          {section.items.map((item, iIdx) => (
                            <div key={iIdx} className="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                              <div className="flex justify-between items-start">
                                <div className="min-w-0">
                                  <h4 className="font-black text-[10px] text-foreground leading-tight">{item.itemName}</h4>
                                  <p className="text-[8px] text-muted-foreground mt-0.5">
                                    Qty: <span className="font-bold text-foreground">{item.qty}</span> ea · Cost: {fmt(item.costSnapshot ?? 0)}
                                  </p>
                                  {item.createdAt && <span className="block text-[8px] text-yellow-500 italic mt-0.5">Added: {formatDate(item.createdAt)}</span>}
                                </div>
                                <div className="text-right">
                                  <span className="block font-black text-[10px] text-[#79c21b]">{fmt(item.rowGrandTot || item.qty * (item.irdSellingPrice ?? 0))}</span>
                                  <Badge variant="outline" className={`text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent ${
                                    item.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' :
                                    item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'bg-yellow-500/10 text-yellow-500' :
                                    item.approvalStatus === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {item.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'Appr (Acct)' : item.approvalStatus || 'Pending'}
                                  </Badge>
                                </div>
                              </div>
                              {(!item.approvalStatus || (item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)) && (
                                <div className="flex gap-2 justify-end pt-1 border-t border-dashed">
                                  <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-rose-600 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('requisitionItems', item.id!, 'REJECTED')}>Reject</Button>
                                  {isAccountant && !item.approvalStatus && (
                                    <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-amber-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('requisitionItems', item.id!, 'APPROVED_ACCOUNTANT')}>Appr (Acct)</Button>
                                  )}
                                  {isManager && (
                                    <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-green-600 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('requisitionItems', item.id!, 'APPROVED_MANAGER')}>Approve</Button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Returns Sub-section */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-1.5 border-b pb-1">
                  <Package className="size-4 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Inventory Returns</span>
                </div>
                {store.selectedInventoryReturns.length === 0 ? (
                  <div className="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No returns registered.</div>
                ) : (
                  <div className="space-y-2">
                    {store.selectedInventoryReturns.map((ret) => (
                      <div key={ret.id} className="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-[10px] text-foreground leading-tight">{ret.itemName}</h4>
                            <p className="text-[8px] text-muted-foreground">Qty: {ret.qtyReturned}</p>
                          </div>
                          <div className="text-right">
                            <span className="block font-bold text-[10px] text-foreground">{fmt(ret.purchaseCostSnapshot * ret.qtyReturned)}</span>
                            <Badge variant="outline" className={`text-[6px] h-3.5 px-1 mt-0.5 border-transparent uppercase font-black ${ret.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>{ret.approvalStatus || 'Pending'}</Badge>
                          </div>
                        </div>
                        {(!ret.approvalStatus || (ret.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)) && (
                          <div className="flex gap-2 justify-end pt-1 border-t border-dashed">
                            <Button variant="outline" size="sm" className="h-6 text-[8px] text-rose-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('inventoryReturns', ret.id, 'REJECTED')}>Reject</Button>
                            {isAccountant && !ret.approvalStatus && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-amber-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('inventoryReturns', ret.id, 'APPROVED_ACCOUNTANT')}>Appr (Acct)</Button>
                            )}
                            {isManager && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-green-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('inventoryReturns', ret.id, 'APPROVED_MANAGER')}>Appr (Mgr)</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Expenses */}
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b pb-1">
                <Receipt className="size-4 text-[#ff8903]" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Ad-hoc Expenses</span>
              </div>
              {store.selectedAdHocExpenses.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">No ad-hoc expenses logged.</div>
              ) : (
                <div className="space-y-2">
                  {store.selectedAdHocExpenses.map((exp) => (
                    <div key={exp.id} className="bg-card border rounded-xl p-3 shadow-sm space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h4 className="font-black text-[10px] text-foreground leading-tight">{exp.description || 'Ad-hoc Expense'}</h4>
                          <p className="text-[8px] text-muted-foreground mt-0.5">Pay: <span className="font-bold">{exp.paymentMethod || 'cash'}</span> · Ref: {exp.paymentReference || 'N/A'}</p>
                          {exp.createdAt && <span className="block text-[8px] text-yellow-500 italic mt-0.5">Added: {formatDate(exp.createdAt)}</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block font-black text-[10px] text-foreground">{fmt(exp.totalAmount)}</span>
                          <Badge variant="outline" className={`text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent ${
                            exp.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' :
                            exp.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'bg-yellow-500/10 text-yellow-500' :
                            exp.approvalStatus === 'REJECTED' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                          }`}>
                            {exp.approvalStatus === 'APPROVED_MANAGER' ? 'Approved' : exp.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'Appr (Acct)' : exp.approvalStatus || 'Pending'}
                          </Badge>
                        </div>
                      </div>
                      {(exp.attachmentUrls?.length || exp.attachmentUrl) && (
                        <div className="bg-muted/10 p-1.5 rounded-lg border border-dashed flex flex-col gap-1 text-[8px]">
                          <span className="text-muted-foreground font-semibold">Receipt Attachment(s)</span>
                          <div className="flex flex-wrap gap-1.5">
                            {exp.attachmentUrls?.map((url: string, idx: number) => (
                              <a key={idx} href={url} target="_blank" rel="noreferrer" className="font-black text-[#ff8903] hover:underline bg-[#ff8903]/10 px-1.5 py-0.5 rounded border border-[#ff8903]/20">
                                Doc {idx + 1}
                              </a>
                            ))}
                            {!exp.attachmentUrls && exp.attachmentUrl && (
                              <a href={exp.attachmentUrl} target="_blank" rel="noreferrer" className="font-black text-[#ff8903] hover:underline bg-[#ff8903]/10 px-1.5 py-0.5 rounded border border-[#ff8903]/20">View Receipt</a>
                            )}
                          </div>
                        </div>
                      )}
                      {(!exp.approvalStatus || (exp.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)) && (
                        <div className="flex gap-2 justify-end pt-1 border-t border-dashed">
                          <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-rose-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('adHocExpenses', exp.id, 'REJECTED')}>Reject</Button>
                          {isAccountant && !exp.approvalStatus && (
                            <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-amber-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('adHocExpenses', exp.id, 'APPROVED_ACCOUNTANT')}>Appr (Acct)</Button>
                          )}
                          {isManager && (
                            <Button variant="outline" size="sm" className="h-6 text-[8px] font-bold text-green-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('adHocExpenses', exp.id, 'APPROVED_MANAGER')}>Appr (Mgr)</Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Labor */}
          {activeTab === 'labor' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 border-b pb-1">
                  <Briefcase className="size-4 text-[#ff8903]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Staff Rates</span>
                </div>
                {store.selectedStaffRates.length === 0 ? (
                  <div className="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No staff rates allocated.</div>
                ) : (
                  <div className="space-y-2">
                    {store.selectedStaffRates.map((rate) => (
                      <div key={rate.id} className="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-[9px] text-foreground">Employee: {store.getEmployeeName(rate.employeeId)}</h4>
                            <p className="text-[8px] text-muted-foreground">Pay Method: {rate.paymentMethod || 'CASH'}</p>
                            {rate.createdAt && <span className="block text-[8px] text-yellow-500 italic mt-0.5">Added: {formatDate(rate.createdAt)}</span>}
                          </div>
                          <div className="text-right">
                            <span className="block font-black text-[10px] text-foreground">{fmt(rate.jobRateAmount)}</span>
                            <Badge variant="outline" className={`text-[6px] h-3.5 px-1 mt-0.5 rounded font-black uppercase border-transparent ${
                              rate.approvalStatus === 'APPROVED' || rate.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                            }`}>{rate.approvalStatus || 'Pending'}</Badge>
                          </div>
                        </div>
                        {(!rate.approvalStatus || (rate.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)) && (
                          <div className="flex gap-2 justify-end pt-1 border-t border-dashed">
                            <Button variant="outline" size="sm" className="h-6 text-[8px] text-rose-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('staffRates', rate.id, 'REJECTED')}>Reject</Button>
                            {isAccountant && !rate.approvalStatus && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-amber-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('staffRates', rate.id, 'APPROVED_ACCOUNTANT')}>Appr (Acct)</Button>
                            )}
                            {isManager && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-green-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleItemApproval('staffRates', rate.id, 'APPROVED_MANAGER')}>Approve</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Referrers */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-1.5 border-b pb-1">
                  <Briefcase className="size-4 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Referrer Commissions</span>
                </div>
                {store.selectedReferrers.length === 0 ? (
                  <div className="text-center py-4 text-[9px] text-muted-foreground bg-muted/5 rounded-xl border">No referrer commissions.</div>
                ) : (
                  <div className="space-y-2">
                    {store.selectedReferrers.map((comm) => (
                      <div key={comm.id} className="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-[9px] text-foreground">{comm.name || 'Anonymous'}</h4>
                            <p className="text-[8px] text-muted-foreground">Pay: {comm.paymentMethod || 'cash'}</p>
                          </div>
                          <div className="text-right">
                            <span className="block font-black text-[10px] text-foreground">{fmt(comm.amount)}</span>
                            <Badge variant="outline" className={`text-[6px] h-3.5 px-1 mt-0.5 border-transparent font-black uppercase ${comm.approvalStatus === 'APPROVED_MANAGER' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>{comm.approvalStatus || 'Pending'}</Badge>
                          </div>
                        </div>
                        {(!comm.approvalStatus || (comm.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager)) && (
                          <div className="flex gap-2 justify-end pt-1 border-t border-dashed">
                            <Button variant="outline" size="sm" className="h-6 text-[8px] text-rose-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleRejectCommission(comm.id)}>Reject</Button>
                            {isAccountant && !comm.approvalStatus && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-amber-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleCommissionApproval(comm.id, 'APPROVED_ACCOUNTANT')}>Appr (Acct)</Button>
                            )}
                            {isManager && (
                              <Button variant="outline" size="sm" className="h-6 text-[8px] text-green-500 px-2 rounded-lg" disabled={isSubmitting} onClick={() => handleCommissionApproval(comm.id, 'APPROVED_MANAGER')}>Approve</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Tools */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b pb-1">
                <Wrench className="size-4 text-[#ff8903]" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Allocated Tools</span>
              </div>
              {isManager && (
                <div className="bg-muted/10 p-2.5 rounded-xl border border-dashed space-y-2">
                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Quick Tool Allocation</span>
                  <div className="flex gap-1.5">
                    <select
                      value={selectedToolId}
                      onChange={(e) => setSelectedToolId(e.target.value)}
                      className="flex-1 h-7 rounded-lg border bg-card text-[9px] px-1 outline-none"
                    >
                      <option value="" disabled>Select tool to allocate...</option>
                      {store.toolsRegistry.filter(x => !(jc.allocatedTools || []).some((a: any) => a.toolId === x.id)).map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.serialNumber})</option>
                      ))}
                    </select>
                    <Button size="sm" className="h-7 text-[8px] px-2.5 bg-[#ff8903] text-white" disabled={!selectedToolId || isSubmitting} onClick={handleAllocateTool}>Allocate</Button>
                  </div>
                </div>
              )}
              {(!jc.allocatedTools || jc.allocatedTools.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground italic">No tools allocated to this Job Card.</div>
              ) : (
                <div className="space-y-2">
                  {jc.allocatedTools.map((tool) => (
                    <div key={tool.id} className="bg-card border rounded-xl p-2.5 shadow-sm space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-[10px] leading-tight text-foreground">{tool.name}</h4>
                          <p className="text-[8px] text-muted-foreground">S/N: {tool.serialNumber || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={`text-[6px] h-3.5 px-1 border-transparent uppercase font-black ${
                            tool.state === 'Returned' ? 'bg-green-500/10 text-green-500' :
                            tool.state === 'Damaged' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                          }`}>{tool.state || 'Allocated'}</Badge>
                          {isManager && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-rose-500" disabled={isSubmitting} onClick={() => handleDeallocateTool(tool.id)}><Trash2 className="size-3" /></Button>
                          )}
                        </div>
                      </div>
                      {isManager && (
                        <div className="flex justify-between items-center gap-1 pt-1.5 border-t border-dashed text-[8px]">
                          <span className="text-muted-foreground">Toggle State:</span>
                          <div className="flex gap-1">
                            {['Allocated', 'Returned', 'Damaged'].map(s => (
                              <button
                                key={s}
                                className={`px-1.5 py-0.5 rounded border text-[7px] ${tool.state === s ? 'bg-primary text-white font-bold' : 'bg-card text-muted-foreground'}`}
                                disabled={isSubmitting}
                                onClick={() => handleUpdateToolState(tool.id, s as any)}
                              >{s}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: Financials */}
          {activeTab === 'financials' && selectedFinancials && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b pb-1">
                <PieChart className="size-4 text-[#79c21b]" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Financial Performance</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Card className="bg-card border p-2 flex flex-col justify-between">
                  <div>
                    <p className="text-[8px] font-black uppercase text-muted-foreground/80">Invoice Value</p>
                    <p className="text-xs font-black text-foreground">{fmt(selectedFinancials.totalRevenue)}</p>
                  </div>
                </Card>
                <Card className="bg-card border p-2 flex flex-col justify-between">
                  <div>
                    <p className="text-[8px] font-black uppercase text-rose-500">Direct Costs</p>
                    <p className="text-xs font-black text-rose-500">{fmt(selectedFinancials.totalCost)}</p>
                  </div>
                </Card>
                <Card className={`border p-2 flex flex-col justify-between ${selectedFinancials.netProfit >= 0 ? 'bg-[#79c21b]/5 border-[#79c21b]/20' : 'bg-rose-500/5 border-rose-500/10'}`}>
                  <div>
                    <p className={`text-[8px] font-black uppercase ${selectedFinancials.netProfit >= 0 ? 'text-[#79c21b]' : 'text-rose-500'}`}>Net Profit</p>
                    <p className={`text-xs font-black ${selectedFinancials.netProfit >= 0 ? 'text-[#79c21b]' : 'text-rose-500'}`}>{fmt(selectedFinancials.netProfit)}</p>
                  </div>
                </Card>
                <Card className="bg-card border p-2 flex flex-col justify-between">
                  <div>
                    <p className="text-[8px] font-black uppercase text-muted-foreground/80">Profit Margin</p>
                    <p className="text-xs font-black text-foreground">{selectedFinancials.profitMargin.toFixed(1)}%</p>
                  </div>
                </Card>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9px] bg-muted/20 p-2.5 rounded-xl border">
                <div className="flex justify-between"><span className="text-muted-foreground">Initial Invoice:</span><span className="font-bold">{fmt(selectedFinancials.initialInvoiceValue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Gross Oper.:</span><span className="font-bold text-rose-500">{fmt(selectedFinancials.totalOperationalGross)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">TWID Net:</span><span className="font-bold text-[#79c21b]">{fmt(selectedFinancials.twidNetAfterAdjustments)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">TWID Rev %:</span><span className="font-bold">{selectedFinancials.twidRevenuePercentage.toFixed(1)}%</span></div>
              </div>
              <div className="border rounded-xl p-2.5 bg-muted/10 border-dashed space-y-1.5">
                <span className="block text-[8px] font-black text-muted-foreground uppercase">IRD Remittance Inventory Formula</span>
                <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">IRD Inventory Gross:</span><span className="font-bold text-rose-600">{fmt(selectedFinancials.irdGrossRevenue)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IRD Purchasing Cost:</span><span className="font-bold">{fmt(selectedFinancials.irdBaseCost)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IRD Net Profit:</span><span className="font-bold">{fmt(selectedFinancials.irdCumulativeNetRevenue)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IRD Margin %:</span><span className="font-bold">{selectedFinancials.irdRevenuePercentage.toFixed(1)}%</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[9px] pt-1">
                <div className="space-y-1">
                  <h5 className="font-black border-b pb-0.5 text-muted-foreground">REVENUE</h5>
                  <div className="flex justify-between"><span>Inventory Sales</span><span className="font-bold">{fmt(selectedFinancials.irdGrossRevenue)}</span></div>
                  <div className="flex justify-between"><span>Labor & Exp Billed</span><span className="font-bold">{fmt(selectedFinancials.implementationCost)}</span></div>
                  <div className="mt-1 bg-blue-500/5 p-1 rounded border text-[8px] flex justify-between">
                    <span className="text-blue-600 font-bold">IRD Remit</span><span className="font-black text-blue-600">{fmt(selectedFinancials.irdNetRevenue)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <h5 className="font-black border-b pb-0.5 text-muted-foreground">COSTS</h5>
                  <div className="flex justify-between"><span>Inventory Base</span><span className="font-bold">{fmt(selectedFinancials.irdBaseCost)}</span></div>
                  <div className="flex justify-between"><span>Staff & Labor</span><span className="font-bold">{fmt(store.selectedStaffRates.reduce((s, r) => s + (r.jobRateAmount || 0), 0))}</span></div>
                  <div className="flex justify-between"><span>Ad-hoc Expenses</span><span className="font-bold">{fmt((selectedFinancials as any).operationalExpenses + (selectedFinancials as any).adjustmentAdhoc || 0)}</span></div>
                  {selectedFinancials.referrerCommission > 0 && (
                    <div className="flex justify-between"><span>Referrer Commission</span><span className="font-bold text-amber-600">{fmt(selectedFinancials.referrerCommission)}</span></div>
                  )}
                </div>
              </div>
              <div className="border-t border-dashed pt-2.5 grid grid-cols-3 gap-1.5 text-[8px]">
                <div className="bg-blue-500/5 p-1.5 rounded-lg border text-center">
                  <span className="text-muted-foreground uppercase block text-[7px]">Collected</span>
                  <span className="font-black text-blue-600 block mt-0.5 text-[9px]">{fmt(selectedTotalPaid)}</span>
                </div>
                <div className={`p-1.5 rounded-lg border text-center ${selectedIsFullyPaid ? 'bg-green-500/5' : 'bg-amber-500/5'}`}>
                  <span className="text-muted-foreground uppercase block text-[7px]">Outstanding</span>
                  <span className={`font-black block mt-0.5 text-[9px] ${selectedIsFullyPaid ? 'text-green-500' : 'text-amber-500'}`}>{fmt(selectedBalanceDue)}</span>
                </div>
                <div className="p-1.5 rounded-lg border flex flex-col justify-center">
                  <span className="text-muted-foreground uppercase block text-[7px] text-center">Paid Rate</span>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-1">
                    <div className="h-full bg-blue-500" style={{ width: `${selectedPaymentProgress.toFixed(1)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t flex gap-3 shrink-0 bg-muted/10">
          <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => store.closeDetails()}>Close</Button>
          {(jc.status === 'APPROVAL_PENDING_MANAGER' || jc.status === 'SUBMITTED') && isManager && (
            <>
              <Button variant="destructive" className="flex-1 rounded-xl h-10 font-bold bg-red-600 hover:bg-red-700 text-white" onClick={() => store.rejectJobCard()}>
                <XCircle className="size-4 mr-1.5 shrink-0" /> Reject
              </Button>
              <Button className="flex-1 rounded-xl h-10 font-bold bg-green-600 hover:bg-green-700 text-white" onClick={() => store.approveJobCard()}>
                <CheckCircle2 className="size-4 mr-1.5 shrink-0" /> Approve
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}