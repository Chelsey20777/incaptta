'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
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
  Truck,
  Loader2,
  ArrowRight,
  User,
  Clock,
  ShoppingCart,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info
} from 'lucide-react'
import type { GoodsReceiptNote } from '@/features/procurement/types/procurement'

export default function GrnsPage() {
  const router = useRouter()
  const {
    grns,
    loadingGrns,
    fetchGrns,
    updateGrn,
    purchaseOrders,
    fetchPurchaseOrders
  } = useProcurementStore()

  // State
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedGrns, setSelectedGrns] = useState<string[]>([])
  const [selectedGrnForAudit, setSelectedGrnForAudit] = useState<GoodsReceiptNote | null>(null)
  const [isActioning, setIsActioning] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchGrns()
    fetchPurchaseOrders()
  }, [])

  const stats = useMemo(() => {
    return {
      all: grns.length,
      DRAFT: grns.filter(g => g.status === 'DRAFT' || !g.status).length,
      CONFIRMED: grns.filter(g => g.status === 'CONFIRMED').length,
      DISPUTED: grns.filter(g => g.status === 'DISPUTED').length,
    }
  }, [grns])

  const filtered = useMemo(() => {
    let list = [...grns]
    if (filter !== 'all') {
      list = list.filter(g => g.status === filter || (filter === 'DRAFT' && !g.status))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        g.grnNumber?.toLowerCase().includes(q) ||
        g.poNumber?.toLowerCase().includes(q) ||
        g.supplierName?.toLowerCase().includes(q)
      )
    }
    return list
  }, [grns, search, filter])

  // Paginated GRNs
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filtered.slice(startIndex, startIndex + itemsPerPage)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

  const formatDate = (d: any) => {
    if (!d) return '—'
    const date = d?.toDate ? d.toDate() : new Date(d)
    return date.toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedGrns(paginated.map(g => g.id))
    } else {
      setSelectedGrns([])
    }
  }

  const handleSelectGrn = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedGrns(prev => [...prev, id])
    } else {
      setSelectedGrns(prev => prev.filter(item => item !== id))
    }
  }

  // Modal Actions
  const handleConfirmGrn = async (id: string) => {
    setIsActioning(true)
    try {
      await updateGrn(id, { status: 'CONFIRMED' })
      toast.success('GRN Confirmed & Stock inventory posted')
      setSelectedGrnForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Verification failed')
    } finally {
      setIsActioning(false)
    }
  }

  const handleDisputeGrn = async (id: string) => {
    if (!confirm('Mark this delivery as disputed?')) return
    setIsActioning(true)
    try {
      await updateGrn(id, { status: 'DISPUTED' })
      toast.success('GRN status set to DISPUTED')
      setSelectedGrnForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setIsActioning(false)
    }
  }

  // Look up source PO details for comparative pane
  const poSourceDetails = useMemo(() => {
    if (!selectedGrnForAudit) return null
    return purchaseOrders.find(p => p.poNumber === selectedGrnForAudit.poNumber || p.id === selectedGrnForAudit.poId)
  }, [selectedGrnForAudit, purchaseOrders])

  // Left Panel component
  const LeftPanel = (
    <div className="space-y-4">
      {/* Stats Summary */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">Receiving Stats</h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setFilter('all')}>
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer" onClick={() => setFilter('CONFIRMED')}>
            <p className="text-lg font-black text-green-500">{stats.CONFIRMED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Confirmed</p>
          </div>
          <div className="bg-red-500/5 p-2 rounded-xl border border-red-500/10 cursor-pointer" onClick={() => setFilter('DISPUTED')}>
            <p className="text-lg font-black text-red-500">{stats.DISPUTED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Disputed</p>
          </div>
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setFilter('DRAFT')}>
            <p className="text-lg font-black text-muted-foreground">{stats.DRAFT}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Draft</p>
          </div>
        </div>
      </GlassCard>

      {/* Filter Buttons */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">Status Filtering</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Receipts', count: stats.all },
            { key: 'DRAFT', label: 'Draft Receptions', count: stats.DRAFT },
            { key: 'CONFIRMED', label: 'Confirmed (Stock Updated)', count: stats.CONFIRMED },
            { key: 'DISPUTED', label: 'Disputed Deliveries', count: stats.DISPUTED },
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

      {/* Guideline */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Info className="size-3.5" /> GRN Stock Policy</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          On setting status to **Confirmed**, the stock ledger is automatically updated, adding physical quantities to respective active inventory items.
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
            placeholder="Search by GRN#, PO#, supplier..."
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
            onClick={() => router.push('/procurement/grns/new')}
          >
            <Plus className="size-4" /> Create GRN
          </Button>
        </div>
      </div>

      {/* GRN Sticky Table Grid */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        {loadingGrns ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Loading receipts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <Truck className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No GRNs Found</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse border-0">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                <th className="p-3 w-10 text-center">
                  <Checkbox
                    checked={paginated.length > 0 && selectedGrns.length === paginated.length}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3">GRN Number</th>
                <th className="p-3">PO Number</th>
                <th className="p-3">Supplier Name</th>
                <th className="p-3">Posting Status</th>
                <th className="p-3">Received At</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(grn => {
                const isSelected = selectedGrns.includes(grn.id)
                const inventoryStatusColors: Record<string, string> = {
                  PENDING: 'bg-gray-500/10 text-gray-600',
                  PROCESSING: 'bg-blue-500/10 text-blue-600',
                  COMPLETE: 'bg-green-500/10 text-green-600 border-green-500/20',
                  FAILED: 'bg-red-500/10 text-red-600 border-red-500/20',
                }
                return (
                  <tr
                    key={grn.id}
                    onClick={() => setSelectedGrnForAudit(grn)}
                    className={cn(
                      'border-b border-border/10 hover:bg-muted/40 transition-colors cursor-pointer h-11',
                      isSelected && 'bg-[#ff8903]/5'
                    )}
                  >
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked => handleSelectGrn(grn.id, !!checked)}
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-500">{grn.grnNumber}</td>
                    <td className="p-3 font-mono text-muted-foreground">{grn.poNumber}</td>
                    <td className="p-3 font-semibold truncate max-w-44">{grn.supplierName}</td>
                    <td className="p-3">
                      {grn.inventoryPostingStatus ? (
                        <span className={cn('text-[9px] px-2 py-0.5 rounded font-bold border uppercase', inventoryStatusColors[grn.inventoryPostingStatus] || 'bg-muted')}>
                          STOCK: {grn.inventoryPostingStatus}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">Pending Action</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(grn.createdAt || grn.receivedAt)}</td>
                    <td className="p-3 text-center">
                      <TrafficLightBadge status={grn.status || 'DRAFT'} />
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

  // Audit modal Left Pane (GRN info details)
  const auditModalLeftPanel = selectedGrnForAudit && (
    <div className="space-y-4">
      {/* Details Box */}
      <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border text-xs">
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">GRN Number</span><p className="font-bold text-sm text-emerald-500">{selectedGrnForAudit.grnNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Status</span><TrafficLightBadge status={selectedGrnForAudit.status || 'DRAFT'} className="mt-0.5" /></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Linked PO</span><p className="font-mono text-foreground font-bold">{selectedGrnForAudit.poNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Supplier</span><p className="font-medium">{selectedGrnForAudit.supplierName}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Received By</span><p className="font-medium flex items-center gap-1"><User className="size-3 text-muted-foreground" /> {selectedGrnForAudit.receivedBy || 'PMO'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Delivery Date</span><p className="font-medium flex items-center gap-1"><Clock className="size-3 text-muted-foreground" /> {formatDate(selectedGrnForAudit.createdAt || selectedGrnForAudit.receivedAt)}</p></div>
      </div>

      {selectedGrnForAudit.notes && (
        <div className="bg-muted/10 p-3.5 rounded-2xl border text-xs">
          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block mb-1">Receiving Remarks / Notes</span>
          <p className="text-muted-foreground whitespace-pre-wrap">{selectedGrnForAudit.notes}</p>
        </div>
      )}

      {/* GRN Items Grid */}
      <div className="border border-border/20 rounded-2xl overflow-hidden bg-card">
        <div className="p-3 border-b bg-muted/30 font-black text-xs uppercase tracking-wider">Received Goods</div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b text-[9px] font-black uppercase text-muted-foreground tracking-wider bg-muted/10 h-8">
              <th className="p-2.5">Item Description</th>
              <th className="p-2.5 text-center">Ordered</th>
              <th className="p-2.5 text-center">Received</th>
              <th className="p-2.5 text-center">Variance</th>
              <th className="p-2.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {selectedGrnForAudit.items.map((item, idx) => {
              const hasVariance = item.qtyVariance !== 0
              const varianceColor = item.qtyVariance < 0 ? 'text-red-500 font-bold' : item.qtyVariance > 0 ? 'text-blue-500 font-bold' : 'text-muted-foreground'
              return (
                <tr key={item.lineItemId || idx} className="border-b border-border/10 last:border-0 h-9">
                  <td className="p-2.5 font-medium">{item.description}</td>
                  <td className="p-2.5 text-center text-muted-foreground">{item.qtyOrdered}</td>
                  <td className="p-2.5 text-center font-bold">{item.qtyReceived}</td>
                  <td className={cn('p-2.5 text-center', varianceColor)}>
                    {item.qtyVariance > 0 ? '+' : ''}{item.qtyVariance}
                  </td>
                  <td className="p-2.5 text-muted-foreground truncate max-w-36">{item.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {(selectedGrnForAudit.status === 'DRAFT' || !selectedGrnForAudit.status) && (
        <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> Verify Delivery Reception
          </h4>
          <div className="flex gap-2">
            <Button
              onClick={() => handleConfirmGrn(selectedGrnForAudit.id)}
              disabled={isActioning}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-10 rounded-xl"
            >
              Confirm Delivery & Update Inventory
            </Button>
            <Button
              onClick={() => handleDisputeGrn(selectedGrnForAudit.id)}
              disabled={isActioning}
              variant="outline"
              className="text-red-500 hover:bg-red-500/10 border-red-500/20 font-bold text-xs h-10 rounded-xl flex-1"
            >
              Flag Dispute
            </Button>
          </div>
        </div>
      )}

      {selectedGrnForAudit.status === 'CONFIRMED' && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center gap-2 text-xs text-green-600 font-bold">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Delivery received, verified, and stock levels have been successfully updated in inventory.</span>
        </div>
      )}
    </div>
  )

  // Audit modal Right Pane (Source PO variance details)
  const auditModalRightPanel = selectedGrnForAudit && poSourceDetails && (
    <div className="space-y-4">
      {/* Source PO Info */}
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/10">
        <ShoppingCart className="size-4 text-[#ff8903]" /> Source Purchase Order
      </div>

      <div className="bg-muted/10 p-3.5 rounded-2xl border text-xs space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-mono font-black text-[#ff8903]">{poSourceDetails.poNumber}</span>
          <TrafficLightBadge status={poSourceDetails.status} />
        </div>
        <p className="font-bold">{poSourceDetails.supplierName}</p>
        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          <span>Terms: {poSourceDetails.paymentTerms}</span>
          <span>Delivery: {poSourceDetails.deliveryAddress}</span>
        </div>
      </div>

      {/* Comparative Delivery checks */}
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pt-2">
        <Truck className="size-4 text-emerald-500" /> Variance Analysis
      </div>

      <div className="space-y-3">
        {selectedGrnForAudit.items.map((grnItem, idx) => {
          const matchingPoItem = poSourceDetails.items.find((poi: any) => poi.id === grnItem.lineItemId)
          const variance = grnItem.qtyReceived - grnItem.qtyOrdered
          const isShort = variance < 0

          return (
            <div key={idx} className={cn('p-3 rounded-2xl border text-xs space-y-1.5', isShort ? 'border-red-500/20 bg-red-500/5' : 'border-border/20 bg-card')}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-foreground">{grnItem.description}</span>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', isShort ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20')}>
                  {isShort ? 'Shortage' : 'Matched'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center bg-muted/20 p-1.5 rounded-xl border">
                <div>
                  <span className="text-[8px] text-muted-foreground block font-bold uppercase">Ordered</span>
                  <strong>{grnItem.qtyOrdered}</strong>
                </div>
                <div>
                  <span className="text-[8px] text-muted-foreground block font-bold uppercase">Received</span>
                  <strong className="text-foreground">{grnItem.qtyReceived}</strong>
                </div>
                <div>
                  <span className="text-[8px] text-muted-foreground block font-bold uppercase">Variance</span>
                  <strong className={variance < 0 ? 'text-red-500' : 'text-green-600'}>{variance > 0 ? '+' : ''}{variance}</strong>
                </div>
              </div>
              {matchingPoItem && (
                <div className="text-[9px] text-muted-foreground flex justify-between">
                  <span>Unit cost price: <strong>${matchingPoItem.unitCostPrice}</strong></span>
                  <span>Est. line total: <strong>${(matchingPoItem.unitCostPrice * grnItem.qtyReceived).toFixed(2)}</strong></span>
                </div>
              )}
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
            <h1 className="text-lg font-black tracking-tight">Goods Received Notes (GRN)</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {grns.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Warehouse delivery verification</p>
        </div>
      </header>

      {/* Master Detail Layout */}
      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout leftPanel={LeftPanel} rightPanel={RightPanel} />
      </div>

      {/* Side-by-Side Wide Audit Modal */}
      {selectedGrnForAudit && (
        <AuditModal
          isOpen={!!selectedGrnForAudit}
          onClose={() => setSelectedGrnForAudit(null)}
          title={`Audit Review: Goods Receipt ${selectedGrnForAudit.grnNumber}`}
          description={`Verify delivery items reception matching PO quantities, check variances and post to stock.`}
          leftPanel={auditModalLeftPanel}
          rightPanel={selectedGrnForAudit && poSourceDetails ? auditModalRightPanel : <div className="p-4 text-xs text-muted-foreground text-center">Comparative PO details not found.</div>}
        />
      )}
    </div>
  )
}