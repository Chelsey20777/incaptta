'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { MasterDetailLayout } from '@/components/ui/MasterDetailLayout'
import { AuditModal } from '@/components/ui/AuditModal'
import { TrafficLightBadge, BadgeColorType } from '@/components/ui/TrafficLightBadge'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Building2,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  XCircle,
  Trash2,
  AlertTriangle,
  FileText,
  Clock,
  User,
  ShoppingBag,
  Info
} from 'lucide-react'
import type { ProcurementRequisition } from '@/features/procurement/types'

export default function RequisitionsPage() {
  const router = useRouter()
  const { user, hasAnyRole } = useAuthStore()
  const {
    requisitions,
    loadingRequisitions,
    fetchRequisitions,
    updateRequisition,
    deleteRequisition
  } = useProcurementStore()

  const {
    items: inventoryItems,
    fetchItems: fetchInventoryItems
  } = useInventoryStore()

  // State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedPrs, setSelectedPrs] = useState<string[]>([])
  const [selectedPrForAudit, setSelectedPrForAudit] = useState<ProcurementRequisition | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isActioning, setIsActioning] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchRequisitions()
    fetchInventoryItems()
  }, [])

  const stats = useMemo(() => {
    return {
      all: requisitions.length,
      DRAFT: requisitions.filter(r => r.status === 'DRAFT').length,
      SUBMITTED: requisitions.filter(r => r.status === 'SUBMITTED').length,
      APPROVED: requisitions.filter(r => r.status === 'APPROVED').length,
      REJECTED: requisitions.filter(r => r.status === 'REJECTED').length,
    }
  }, [requisitions])

  const filtered = useMemo(() => {
    let list = [...requisitions]
    if (statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.prNumber?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.supplierName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [requisitions, search, statusFilter])

  // Paginated Requisitions
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filtered.slice(startIndex, startIndex + itemsPerPage)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

  const fmt = (n: number) => '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatDate = (d: any) => {
    if (!d) return '—'
    const date = d?.toDate ? d.toDate() : new Date(d)
    return date.toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  // Bulk actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPrs(paginated.map(p => p.id))
    } else {
      setSelectedPrs([])
    }
  }

  const handleSelectPr = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedPrs(prev => [...prev, id])
    } else {
      setSelectedPrs(prev => prev.filter(item => item !== id))
    }
  }

  const handleBulkApprove = async () => {
    if (selectedPrs.length === 0 || !user) return
    setIsActioning(true)
    try {
      for (const id of selectedPrs) {
        const pr = requisitions.find(r => r.id === id)
        if (pr && pr.status === 'SUBMITTED') {
          await updateRequisition(id, {
            status: 'APPROVED',
            approvedBy: user.uid,
            approvedAt: new Date() as any
          })
        }
      }
      toast.success('Selected requisitions approved')
      setSelectedPrs([])
    } catch (err: any) {
      toast.error(err.message || 'Error executing action')
    } finally {
      setIsActioning(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedPrs.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedPrs.length} requisitions?`)) return
    setIsActioning(true)
    try {
      for (const id of selectedPrs) {
        await deleteRequisition(id)
      }
      toast.success('Selected requisitions deleted')
      setSelectedPrs([])
    } catch (err: any) {
      toast.error(err.message || 'Error deleting requisitions')
    } finally {
      setIsActioning(false)
    }
  }

  // Approval / Rejection in Modal
  const handleApprove = async (id: string) => {
    if (!user) return
    setIsActioning(true)
    try {
      await updateRequisition(id, {
        status: 'APPROVED',
        approvedBy: user.uid,
        approvedAt: new Date() as any
      })
      toast.success('Requisition approved')
      setSelectedPrForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Approve failed')
    } finally {
      setIsActioning(false)
    }
  }

  const handleReject = async (id: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    setIsActioning(true)
    try {
      await updateRequisition(id, {
        status: 'REJECTED',
        rejectionReason
      })
      toast.success('Requisition rejected')
      setRejectionReason('')
      setSelectedPrForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Reject failed')
    } finally {
      setIsActioning(false)
    }
  }

  // Stock comparative analysis lookup per PR line item
  const prItemStockDetails = useMemo(() => {
    if (!selectedPrForAudit) return []
    return selectedPrForAudit.items.map(item => {
      // Try to find matching inventory item by sku or name
      const matchedInv = inventoryItems.find(inv =>
        (item.sku && inv.sku === item.sku) ||
        inv.name.toLowerCase() === item.description.toLowerCase()
      )
      return {
        item,
        matchedInv
      }
    })
  }, [selectedPrForAudit, inventoryItems])

  // Left Panel component
  const LeftPanel = (
    <div className="space-y-4">
      {/* Stats Summary */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">Requisition Stats</h3>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setStatusFilter('all')}>
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10 cursor-pointer" onClick={() => setStatusFilter('SUBMITTED')}>
            <p className="text-lg font-black text-blue-500">{stats.SUBMITTED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Submitted</p>
          </div>
          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer" onClick={() => setStatusFilter('APPROVED')}>
            <p className="text-lg font-black text-green-500">{stats.APPROVED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Approved</p>
          </div>
          <div className="bg-red-500/5 p-2 rounded-xl border border-red-500/10 cursor-pointer" onClick={() => setStatusFilter('REJECTED')}>
            <p className="text-lg font-black text-red-500">{stats.REJECTED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Rejected</p>
          </div>
        </div>
      </GlassCard>

      {/* Filter Buttons */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">Status Filtering</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Requisitions', count: stats.all },
            { key: 'DRAFT', label: 'Drafts', count: stats.DRAFT },
            { key: 'SUBMITTED', label: 'Pending Review', count: stats.SUBMITTED },
            { key: 'APPROVED', label: 'Approved PRs', count: stats.APPROVED },
            { key: 'REJECTED', label: 'Rejected PRs', count: stats.REJECTED },
          ].map(tab => (
            <Button
              key={tab.key}
              variant={statusFilter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'justify-between h-9 rounded-xl font-bold text-xs px-3',
                statusFilter === tab.key ? 'bg-[#ff8903] text-white hover:bg-[#ff8903]/90' : 'text-muted-foreground hover:bg-muted/40'
              )}
              onClick={() => {
                setStatusFilter(tab.key)
                setCurrentPage(1)
              }}
            >
              <span>{tab.label}</span>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', statusFilter === tab.key ? 'bg-white/20 border-white/10 text-white' : 'bg-muted border-border/40 text-muted-foreground')}>{tab.count}</span>
            </Button>
          ))}
        </div>
      </GlassCard>

      {/* Bulk Actions Panel */}
      {selectedPrs.length > 0 && (
        <GlassCard className="p-4 border-amber-500/20 bg-amber-500/5 animate-pulse" hoverable={false}>
          <h3 className="text-xs font-black uppercase text-amber-500 tracking-wider flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="size-4" /> Bulk Actions ({selectedPrs.length})
          </h3>
          <div className="flex flex-col gap-2">
            {hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && statusFilter === 'SUBMITTED' && (
              <Button
                size="sm"
                onClick={handleBulkApprove}
                disabled={isActioning}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-9 rounded-xl gap-1.5"
              >
                <ShieldCheck className="size-4" /> Approve Selected
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDelete}
              disabled={isActioning}
              className="text-red-500 hover:bg-red-500/10 border-red-500/20 font-bold text-xs h-9 rounded-xl gap-1.5"
            >
              <Trash2 className="size-4" /> Delete Selected
            </Button>
          </div>
        </GlassCard>
      )}

      {/* Guideline */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Info className="size-3.5" /> PR Standard</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Requisitions require Manager/Admin approval if materials exceed stock limits. Approved PRs can be immediately converted to Purchase Orders.
        </p>
      </GlassCard>
    </div>
  )

  // Right Panel component
  const RightPanel = (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sticky Table Header Section */}
      <div className="p-4 border-b border-border/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/60 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search by PR#, title, department..."
            className="pl-9 h-10 border bg-muted/20 w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-[10px] text-muted-foreground font-bold uppercase mr-1">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
          </span>
          <Button
            size="sm"
            className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold text-xs gap-1.5 h-10 rounded-xl"
            onClick={() => router.push('/procurement/requisitions/new')}
          >
            <Plus className="size-4" /> Create Requisition
          </Button>
        </div>
      </div>

      {/* Requisitions Sticky Table Grid */}
      <div className="flex-1 overflow-auto relative min-h-0 scrollbar-thin">
        {loadingRequisitions ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Loading requisitions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <ClipboardList className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No Requisitions Found</p>
            <p className="text-xs mt-1 text-muted-foreground">Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                <th className="p-3 w-10 text-center">
                  <Checkbox
                    checked={paginated.length > 0 && selectedPrs.length === paginated.length}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3">PR Number</th>
                <th className="p-3">Title</th>
                <th className="p-3">Department</th>
                <th className="p-3 text-right">Est. Cost</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(req => {
                const isSelected = selectedPrs.includes(req.id)
                return (
                  <tr
                    key={req.id}
                    onClick={() => setSelectedPrForAudit(req)}
                    className={cn(
                      'border-b border-border/10 hover:bg-muted/40 transition-colors cursor-pointer h-11',
                      isSelected && 'bg-[#ff8903]/5'
                    )}
                  >
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked => handleSelectPr(req.id, !!checked)}
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-[#ff8903]">{req.prNumber}</td>
                    <td className="p-3 font-semibold truncate max-w-44">{req.title}</td>
                    <td className="p-3 text-muted-foreground">{req.department}</td>
                    <td className="p-3 text-right font-black text-foreground">{fmt(req.totalEstimatedCost)}</td>
                    <td className="p-3 text-muted-foreground truncate max-w-32">{req.supplierName || '—'}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(req.createdAt)}</td>
                    <td className="p-3 text-center">
                      <TrafficLightBadge status={req.status} />
                    </td>
                    <td className="p-3 text-center">
                      <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-border/20 bg-card/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="rounded-xl h-8 text-xs font-bold"
          >
            Previous
          </Button>
          <span className="text-[10px] text-muted-foreground font-black">
            PAGE {currentPage} OF {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="rounded-xl h-8 text-xs font-bold"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )

  // Audit modal Left Pane (PR info details)
  const auditModalLeftPanel = selectedPrForAudit && (
    <div className="space-y-4">
      {/* Details Box */}
      <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border text-xs">
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">PR Number</span><p className="font-bold text-sm text-[#ff8903]">{selectedPrForAudit.prNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Status</span><TrafficLightBadge status={selectedPrForAudit.status} className="mt-0.5" /></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Title</span><p className="font-semibold text-foreground">{selectedPrForAudit.title}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Category Type</span><p className="font-medium">{selectedPrForAudit.procurementType?.replace('_', ' ')}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Department</span><p className="font-medium">{selectedPrForAudit.department || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Preferred Supplier</span><p className="font-medium">{selectedPrForAudit.supplierName || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Requested By</span><p className="font-medium flex items-center gap-1"><User className="size-3 text-muted-foreground" /> {selectedPrForAudit.requestedByName || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Created Date</span><p className="font-medium flex items-center gap-1"><Clock className="size-3 text-muted-foreground" /> {formatDate(selectedPrForAudit.createdAt)}</p></div>
      </div>

      {selectedPrForAudit.description && (
        <div className="bg-muted/10 p-3.5 rounded-2xl border text-xs">
          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block mb-1">Description / Notes</span>
          <p className="text-muted-foreground whitespace-pre-wrap">{selectedPrForAudit.description}</p>
        </div>
      )}

      {/* PR Items Table */}
      <div className="border border-border/20 rounded-2xl overflow-hidden bg-card">
        <div className="p-3 border-b bg-muted/30 font-black text-xs uppercase tracking-wider">Requested Line Items</div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b text-[9px] font-black uppercase text-muted-foreground tracking-wider bg-muted/10 h-8">
                <th className="p-2.5">Item Description</th>
                <th className="p-2.5 text-center">UOM</th>
                <th className="p-2.5 text-center">Qty</th>
                <th className="p-2.5 text-right">Unit cost</th>
                <th className="p-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedPrForAudit.items.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-border/10 last:border-0 h-9">
                  <td className="p-2.5 font-medium">{item.description}</td>
                  <td className="p-2.5 text-center text-muted-foreground">{item.uom}</td>
                  <td className="p-2.5 text-center font-semibold">{item.qty}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{fmt(item.unitCostPrice)}</td>
                  <td className="p-2.5 text-right font-bold text-foreground">{fmt(item.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-muted/20 border-t flex justify-between items-center text-xs">
          <span className="font-black uppercase text-muted-foreground">Total Estimated Cost</span>
          <span className="text-base font-black text-[#ff8903]">{fmt(selectedPrForAudit.totalEstimatedCost)}</span>
        </div>
      </div>

      {/* PR Actions Panel */}
      {selectedPrForAudit.status === 'SUBMITTED' && hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && (
        <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <ShieldCheck className="size-4" /> Approval Actions
          </h4>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                onClick={() => handleApprove(selectedPrForAudit.id)}
                disabled={isActioning}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-9 rounded-xl"
              >
                Approve Requisition
              </Button>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-border/20">
              <span className="text-[10px] font-black uppercase text-muted-foreground">Rejection Reason (required for reject)</span>
              <div className="flex gap-2">
                <Input
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Provide rejection feedback..."
                  className="h-9 text-xs bg-background"
                />
                <Button
                  onClick={() => handleReject(selectedPrForAudit.id)}
                  disabled={isActioning || !rejectionReason.trim()}
                  variant="outline"
                  className="text-red-500 hover:bg-red-500/10 border-red-500/20 font-bold text-xs h-9 rounded-xl shrink-0"
                >
                  <XCircle className="size-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPrForAudit.status === 'APPROVED' && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center justify-between text-xs">
          <span className="text-green-600 font-bold flex items-center gap-1.5">
            <ShieldCheck className="size-4" /> Approved & Ready for Purchase Order
          </span>
          <Button
            size="sm"
            className="bg-[#ff8903] text-white font-bold text-xs h-8 rounded-lg"
            onClick={() => {
              setSelectedPrForAudit(null)
              router.push(`/procurement/purchase-orders/new?prId=${selectedPrForAudit.id}`)
            }}
          >
            Create PO &rarr;
          </Button>
        </div>
      )}
    </div>
  )

  // Audit modal Right Pane (Inventory comparison stock levels check)
  const auditModalRightPanel = selectedPrForAudit && (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/10">
        <ShoppingBag className="size-4 text-[#ff8903]" /> Stock & Par Level Verification
      </div>

      <div className="space-y-3">
        {prItemStockDetails.map(({ item, matchedInv }, idx) => {
          // Determine Traffic light for item stock level
          let colorStyle = 'border-gray-500/10 bg-gray-500/5'
          let indicatorText = 'Unlinked / Adhoc Item'
          let statusBadgeColor: BadgeColorType = 'gray'

          if (item.inventoryItemStatus === 'ADHOC') {
            colorStyle = 'border-slate-500/20 bg-slate-500/5 dark:bg-slate-900/10'
            indicatorText = 'One-off Ad-hoc Expense (Bypasses stock)'
            statusBadgeColor = 'gray'
          } else if (matchedInv) {
            const hasLowStock = matchedInv.onHand < (matchedInv.reorderLevel || 10)
            if (matchedInv.onHand === 0) {
              colorStyle = 'border-red-500/20 bg-red-500/5 dark:bg-red-950/5'
              indicatorText = 'Critical: Out of Stock!'
              statusBadgeColor = 'red'
            } else if (hasLowStock) {
              colorStyle = 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/5'
              indicatorText = 'Warning: Below Reorder Threshold'
              statusBadgeColor = 'amber'
            } else {
              colorStyle = 'border-green-500/20 bg-green-500/5 dark:bg-green-950/5'
              indicatorText = 'Healthy Stock Levels'
              statusBadgeColor = 'green'
            }
          } else {
            colorStyle = 'border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/5'
            indicatorText = 'Path B: Registering New Pending Item'
            statusBadgeColor = 'amber'
          }

          return (
            <div key={item.id || idx} className={cn('p-3 rounded-2xl border text-xs space-y-2', colorStyle)}>
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="font-bold text-foreground">{item.description}</h5>
                  <p className="text-[10px] text-muted-foreground">SKU: {item.sku || 'N/A'} | UOM: {item.uom}</p>
                </div>
                <TrafficLightBadge status={statusBadgeColor} />
              </div>

              {matchedInv ? (
                <div className="grid grid-cols-3 gap-2 bg-background/50 p-2 rounded-xl text-[11px] border border-border/10">
                  <div>
                    <span className="text-[9px] text-muted-foreground block uppercase font-bold">On Hand</span>
                    <span className="font-black text-foreground">{matchedInv.onHand} {matchedInv.uom}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block uppercase font-bold">Reorder Level</span>
                    <span className="font-bold text-foreground">{matchedInv.reorderLevel || 0} {matchedInv.uom}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block uppercase font-bold">Pricing</span>
                    <span className="font-semibold text-foreground">{fmt(matchedInv.purchasePrice)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-background/50 rounded-xl text-[10px] text-muted-foreground flex gap-1.5 items-center">
                  <Info className="size-3.5 text-blue-400 shrink-0" />
                  <span>
                    {item.inventoryItemStatus === 'ADHOC'
                      ? 'This item will post directly to Job Card expenses as project-materials and will not register in warehouse inventories.'
                      : 'This SKU does not exist in inventory. Upon GRN confirmation, a new inventory document will be created with status ACTIVE.'}
                  </span>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground flex justify-between font-medium">
                <span>Requested Order Qty: <strong className="text-foreground">{item.qty}</strong></span>
                <span className="text-amber-500 font-bold">{indicatorText}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
      {/* Sticky Main Header */}
      <header className="sticky top-0 z-10 bg-card/60 backdrop-blur-md border-b border-border/20 px-4 py-3.5 flex items-center gap-4 shadow-sm shrink-0">
        <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => router.push('/procurement')}>
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight">Requisitions Dashboard</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {requisitions.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Audit & approve purchase requests</p>
        </div>
      </header>

      {/* Master Detail Layout */}
      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout leftPanel={LeftPanel} rightPanel={RightPanel} />
      </div>

      {/* Side-by-Side Wide Audit Modal */}
      {selectedPrForAudit && (
        <AuditModal
          isOpen={!!selectedPrForAudit}
          onClose={() => setSelectedPrForAudit(null)}
          title={`Audit Review: Requisition ${selectedPrForAudit.prNumber}`}
          description={`Verify inventory stock levels, prices, and approve/reject the requisition.`}
          leftPanel={auditModalLeftPanel}
          rightPanel={auditModalRightPanel}
        />
      )}
    </div>
  )
}