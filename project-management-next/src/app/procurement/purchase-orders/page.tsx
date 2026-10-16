'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { Card, CardContent } from '@/components/ui/card'
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
  ShoppingCart,
  Loader2,
  Building2,
  DollarSign,
  ArrowRight,
  Truck,
  Printer,
  XCircle,
  FileText,
  Clock,
  MapPin,
  Calendar,
  AlertTriangle,
  Info
} from 'lucide-react'
import type { PurchaseOrder } from '@/features/procurement/types/procurement'

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const {
    purchaseOrders,
    loadingPurchaseOrders,
    fetchPurchaseOrders,
    updatePurchaseOrder,
    requisitions,
    fetchRequisitions
  } = useProcurementStore()

  const {
    items: inventoryItems,
    fetchItems: fetchInventoryItems
  } = useInventoryStore()

  // State
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedPos, setSelectedPos] = useState<string[]>([])
  const [selectedPoForAudit, setSelectedPoForAudit] = useState<PurchaseOrder | null>(null)
  const [isActioning, setIsActioning] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchPurchaseOrders()
    fetchRequisitions()
    fetchInventoryItems()
  }, [])

  const stats = useMemo(() => {
    return {
      all: purchaseOrders.length,
      DRAFT: purchaseOrders.filter(p => p.status === 'DRAFT').length,
      SENT: purchaseOrders.filter(p => p.status === 'SENT').length,
      ACKNOWLEDGED: purchaseOrders.filter(p => p.status === 'ACKNOWLEDGED').length,
      PARTIALLY_FULFILLED: purchaseOrders.filter(p => p.status === 'PARTIALLY_FULFILLED').length,
      COMPLETE: purchaseOrders.filter(p => p.status === 'COMPLETE').length,
      CANCELLED: purchaseOrders.filter(p => p.status === 'CANCELLED').length,
    }
  }, [purchaseOrders])

  const filtered = useMemo(() => {
    let list = [...purchaseOrders]
    if (filter !== 'all') {
      list = list.filter(p => p.status === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.poNumber?.toLowerCase().includes(q) ||
        p.supplierName?.toLowerCase().includes(q) ||
        p.prNumber?.toLowerCase().includes(q)
      )
    }
    return list
  }, [purchaseOrders, search, filter])

  // Paginated POs
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
      setSelectedPos(paginated.map(p => p.id))
    } else {
      setSelectedPos([])
    }
  }

  const handleSelectPo = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedPos(prev => [...prev, id])
    } else {
      setSelectedPos(prev => prev.filter(item => item !== id))
    }
  }

  const handleBulkMarkSent = async () => {
    if (selectedPos.length === 0) return
    setIsActioning(true)
    try {
      for (const id of selectedPos) {
        const po = purchaseOrders.find(p => p.id === id)
        if (po && po.status === 'DRAFT') {
          await updatePurchaseOrder(id, {
            status: 'SENT',
            sentAt: new Date() as any
          })
        }
      }
      toast.success('Selected POs marked as sent')
      setSelectedPos([])
    } catch (err: any) {
      toast.error(err.message || 'Error executing action')
    } finally {
      setIsActioning(false)
    }
  }

  // Modal Actions
  const handleMarkSent = async (id: string) => {
    setIsActioning(true)
    try {
      await updatePurchaseOrder(id, {
        status: 'SENT',
        sentAt: new Date() as any
      })
      toast.success('Purchase Order marked as Sent')
      setSelectedPoForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setIsActioning(false)
    }
  }

  const handleCancelPo = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this Purchase Order?')) return
    setIsActioning(true)
    try {
      await updatePurchaseOrder(id, {
        status: 'CANCELLED'
      })
      toast.success('Purchase Order cancelled')
      setSelectedPoForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setIsActioning(false)
    }
  }

  // Look up source PR and item details for comparative pane
  const poSourceDetails = useMemo(() => {
    if (!selectedPoForAudit) return null
    const prDoc = requisitions.find(r => r.prNumber === selectedPoForAudit.prNumber || r.id === selectedPoForAudit.prId)
    const itemsWithInv = selectedPoForAudit.items.map(item => {
      const matchedInv = inventoryItems.find(inv =>
        (item.sku && inv.sku === item.sku) ||
        inv.name.toLowerCase() === item.description.toLowerCase()
      )
      return {
        item,
        matchedInv
      }
    })
    return {
      prDoc,
      itemsWithInv
    }
  }, [selectedPoForAudit, requisitions, inventoryItems])

  // Left Panel component
  const LeftPanel = (
    <div className="space-y-4">
      {/* Stats Summary */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">Order Statistics</h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setFilter('all')}>
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10 cursor-pointer" onClick={() => setFilter('SENT')}>
            <p className="text-lg font-black text-blue-500">{stats.SENT}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Sent</p>
          </div>
          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer" onClick={() => setFilter('COMPLETE')}>
            <p className="text-lg font-black text-green-500">{stats.COMPLETE}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Complete</p>
          </div>
          <div className="bg-red-500/5 p-2 rounded-xl border border-red-500/10 cursor-pointer" onClick={() => setFilter('CANCELLED')}>
            <p className="text-lg font-black text-red-500">{stats.CANCELLED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Cancelled</p>
          </div>
        </div>
      </GlassCard>

      {/* Filter Buttons */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">Status Filtering</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Purchase Orders', count: stats.all },
            { key: 'DRAFT', label: 'Drafts', count: stats.DRAFT },
            { key: 'SENT', label: 'Sent to Vendor', count: stats.SENT },
            { key: 'ACKNOWLEDGED', label: 'Vendor Acknowledged', count: stats.ACKNOWLEDGED },
            { key: 'PARTIALLY_FULFILLED', label: 'Partially Fulfilled', count: stats.PARTIALLY_FULFILLED },
            { key: 'COMPLETE', label: 'Completed POs', count: stats.COMPLETE },
            { key: 'CANCELLED', label: 'Cancelled POs', count: stats.CANCELLED },
          ].map(tab => (
            <Button
              key={tab.key}
              variant={filter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'justify-between h-9 rounded-xl font-bold text-xs px-3',
                filter === tab.key ? 'bg-[#ff8903] text-white hover:bg-[#ff8903]/90' : 'text-muted-foreground hover:bg-muted/40'
              )}
              onClick={() => {
                setFilter(tab.key)
                setCurrentPage(1)
              }}
            >
              <span>{tab.label}</span>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', filter === tab.key ? 'bg-white/20 border-white/10 text-white' : 'bg-muted border-border/40 text-muted-foreground')}>{tab.count}</span>
            </Button>
          ))}
        </div>
      </GlassCard>

      {/* Bulk Actions Panel */}
      {selectedPos.length > 0 && (
        <GlassCard className="p-4 border-amber-500/20 bg-amber-500/5 animate-pulse" hoverable={false}>
          <h3 className="text-xs font-black uppercase text-amber-500 tracking-wider flex items-center gap-1.5 mb-2.5">
            <AlertTriangle className="size-4" /> Bulk Actions ({selectedPos.length})
          </h3>
          <div className="flex flex-col gap-2">
            {filter === 'DRAFT' && (
              <Button
                size="sm"
                onClick={handleBulkMarkSent}
                disabled={isActioning}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 rounded-xl gap-1.5"
              >
                <ShoppingCart className="size-4" /> Mark Sent Selected
              </Button>
            )}
          </div>
        </GlassCard>
      )}

      {/* Guideline */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Info className="size-3.5" /> PO Guide</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Sent POs await physical warehouse delivery matching. On delivery, a Goods Received Note (GRN) should be recorded to update stock on hand.
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
            placeholder="Search by PO#, supplier..."
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
            onClick={() => router.push('/procurement/purchase-orders/new')}
          >
            <Plus className="size-4" /> Create Purchase Order
          </Button>
        </div>
      </div>

      {/* PO Sticky Table Grid */}
      <div className="flex-1 overflow-auto relative min-h-0 scrollbar-thin">
        {loadingPurchaseOrders ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <ShoppingCart className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No Purchase Orders Found</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse border-0 min-w-[800px]">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                <th className="p-3 w-10 text-center">
                  <Checkbox
                    checked={paginated.length > 0 && selectedPos.length === paginated.length}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3">PO Number</th>
                <th className="p-3">Supplier Name</th>
                <th className="p-3">Source Requisition</th>
                <th className="p-3 text-right">Order Value</th>
                <th className="p-3">Expected Date</th>
                <th className="p-3">Date Created</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(po => {
                const isSelected = selectedPos.includes(po.id)
                return (
                  <tr
                    key={po.id}
                    onClick={() => setSelectedPoForAudit(po)}
                    className={cn(
                      'border-b border-border/10 hover:bg-muted/40 transition-colors cursor-pointer h-11',
                      isSelected && 'bg-[#ff8903]/5'
                    )}
                  >
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked => handleSelectPo(po.id, !!checked)}
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-[#ff8903]">{po.poNumber}</td>
                    <td className="p-3 font-semibold truncate max-w-48">{po.supplierName}</td>
                    <td className="p-3 font-mono text-muted-foreground">{po.prNumber || '—'}</td>
                    <td className="p-3 text-right font-black text-foreground">{fmt(po.totalOrderValue)}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(po.expectedDeliveryDate)}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(po.createdAt)}</td>
                    <td className="p-3 text-center">
                      <TrafficLightBadge status={po.status} />
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

  // Audit modal Left Pane (PO info details)
  const auditModalLeftPanel = selectedPoForAudit && (
    <div className="space-y-4">
      {/* Details Box */}
      <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border text-xs">
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">PO Number</span><p className="font-bold text-sm text-[#ff8903]">{selectedPoForAudit.poNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Status</span><TrafficLightBadge status={selectedPoForAudit.status} className="mt-0.5" /></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Supplier</span><p className="font-semibold text-foreground flex items-center gap-1"><Building2 className="size-3 text-[#ff8903]" /> {selectedPoForAudit.supplierName}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Source PR</span><p className="font-mono text-muted-foreground">{selectedPoForAudit.prNumber || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Expected Delivery</span><p className="font-medium flex items-center gap-1"><Calendar className="size-3 text-muted-foreground" /> {formatDate(selectedPoForAudit.expectedDeliveryDate)}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Payment Terms</span><p className="font-medium">{selectedPoForAudit.paymentTerms || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Delivery Address</span><p className="font-medium flex items-center gap-1"><MapPin className="size-3 text-muted-foreground" /> {selectedPoForAudit.deliveryAddress || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Created Date</span><p className="font-medium flex items-center gap-1"><Clock className="size-3 text-muted-foreground" /> {formatDate(selectedPoForAudit.createdAt)}</p></div>
      </div>

      {selectedPoForAudit.notes && (
        <div className="bg-muted/10 p-3.5 rounded-2xl border text-xs">
          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block mb-1">Supplier / Delivery Notes</span>
          <p className="text-muted-foreground whitespace-pre-wrap">{selectedPoForAudit.notes}</p>
        </div>
      )}

      {/* Line Items */}
      <div className="border border-border/20 rounded-2xl overflow-hidden bg-card">
        <div className="p-3 border-b bg-muted/30 font-black text-xs uppercase tracking-wider">Ordered Line Items</div>
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
              {selectedPoForAudit.items.map((item, idx) => (
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
          <span className="font-black uppercase text-muted-foreground">Total Order Value</span>
          <span className="text-base font-black text-[#ff8903]">{fmt(selectedPoForAudit.totalOrderValue)}</span>
        </div>
      </div>

      {/* PO Actions Footer */}
      <div className="flex gap-2 pt-2">
        {selectedPoForAudit.status === 'DRAFT' && (
          <Button
            onClick={() => handleMarkSent(selectedPoForAudit.id)}
            disabled={isActioning}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 rounded-xl"
          >
            Mark Sent to Vendor
          </Button>
        )}
        {['DRAFT', 'SENT', 'ACKNOWLEDGED'].includes(selectedPoForAudit.status) && (
          <Button
            onClick={() => handleCancelPo(selectedPoForAudit.id)}
            disabled={isActioning}
            variant="outline"
            className="text-red-500 hover:bg-red-500/10 border-red-500/20 font-bold text-xs h-10 rounded-xl flex-1"
          >
            <XCircle className="size-4 mr-1.5" /> Cancel Purchase Order
          </Button>
        )}
        {['SENT', 'ACKNOWLEDGED', 'PARTIALLY_FULFILLED'].includes(selectedPoForAudit.status) && (
          <Button
            onClick={() => {
              setSelectedPoForAudit(null)
              router.push(`/procurement/grns/new?poId=${selectedPoForAudit.id}`)
            }}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-10 rounded-xl gap-1.5"
          >
            <Truck className="size-4" /> Create GRN Delivery
          </Button>
        )}
      </div>
    </div>
  )

  // Audit modal Right Pane (Source PR comparing stocks verification)
  const auditModalRightPanel = selectedPoForAudit && poSourceDetails && (
    <div className="space-y-4">
      {/* Source PR Card */}
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/10">
        <FileText className="size-4 text-[#ff8903]" /> Source Requisition Reference
      </div>

      {poSourceDetails.prDoc ? (
        <div className="bg-muted/10 p-3.5 rounded-2xl border text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-mono font-black text-[#ff8903]">{poSourceDetails.prDoc.prNumber}</span>
            <TrafficLightBadge status={poSourceDetails.prDoc.status} />
          </div>
          <p className="font-bold">{poSourceDetails.prDoc.title}</p>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
            <span>By: {poSourceDetails.prDoc.requestedByName}</span>
            <span>Department: {poSourceDetails.prDoc.department}</span>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-muted/10 rounded-2xl text-xs text-muted-foreground flex gap-1.5 items-center">
          <Info className="size-3.5 text-blue-400" />
          <span>No matching source requisition document was found in records.</span>
        </div>
      )}

      {/* Stock Levels Verification */}
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pt-2">
        <ShoppingCart className="size-4 text-[#ff8903]" /> Current Inventory Stock Checks
      </div>

      <div className="space-y-3">
        {poSourceDetails.itemsWithInv.map(({ item, matchedInv }, idx) => {
          let badgeColor: BadgeColorType = 'gray'
          let subText = 'Unlinked / Adhoc Item'

          if (item.inventoryItemStatus === 'ADHOC') {
            badgeColor = 'gray'
            subText = 'One-off Ad-hoc material cost (Job Card)'
          } else if (matchedInv) {
            const hasLowStock = matchedInv.onHand < (matchedInv.reorderLevel || 10)
            if (matchedInv.onHand === 0) {
              badgeColor = 'red'
              subText = 'Out of Stock'
            } else if (hasLowStock) {
              badgeColor = 'amber'
              subText = 'Below Target Reorder level'
            } else {
              badgeColor = 'green'
              subText = 'Healthy Level'
            }
          } else {
            badgeColor = 'amber'
            subText = 'Path B: New Inventory Item Registration'
          }

          return (
            <div key={item.id || idx} className="p-3 rounded-2xl border bg-card text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-foreground truncate max-w-44">{item.description}</span>
                <TrafficLightBadge status={badgeColor} />
              </div>

              {matchedInv ? (
                <div className="grid grid-cols-3 gap-2 bg-muted/20 p-2 rounded-xl text-[10px] border">
                  <div>
                    <span className="text-muted-foreground block text-[8px] font-bold uppercase">On Hand</span>
                    <strong className="text-foreground">{matchedInv.onHand} {matchedInv.uom}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[8px] font-bold uppercase">Reorder Level</span>
                    <strong className="text-foreground">{matchedInv.reorderLevel || 0} {matchedInv.uom}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[8px] font-bold uppercase">Selling Price</span>
                    <strong className="text-foreground">{fmt(matchedInv.sellingPrice)}</strong>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic font-medium bg-muted/10 p-2 rounded-xl">
                  {item.inventoryItemStatus === 'ADHOC' ? 'Bypasses warehouse inventory.' : 'Will activate in catalog automatically upon delivery.'}
                </p>
              )}

              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Ordered Qty: <strong className="text-foreground">{item.qty} {item.uom}</strong></span>
                <span className="font-bold text-foreground">{subText}</span>
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
            <h1 className="text-lg font-black tracking-tight">Purchase Orders</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {purchaseOrders.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Vendor purchasing tracker</p>
        </div>
      </header>

      {/* Master Detail Layout */}
      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout leftPanel={LeftPanel} rightPanel={RightPanel} />
      </div>

      {/* Side-by-Side Wide Audit Modal */}
      {selectedPoForAudit && (
        <AuditModal
          isOpen={!!selectedPoForAudit}
          onClose={() => setSelectedPoForAudit(null)}
          title={`Audit Review: Purchase Order ${selectedPoForAudit.poNumber}`}
          description={`Review supplier delivery info, expected items, and check source requisition context.`}
          leftPanel={auditModalLeftPanel}
          rightPanel={auditModalRightPanel}
        />
      )}
    </div>
  )
}