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
import { TrafficLightBadge } from '@/components/ui/TrafficLightBadge'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  ChevronLeft,
  Receipt,
  Loader2,
  ArrowRight,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ShoppingCart,
  Truck,
  Building2,
  Calendar,
  Clock,
  Info
} from 'lucide-react'
import type { SupplierInvoice, MatchStatus } from '@/features/procurement/types/procurement'

export default function InvoicesPage() {
  const router = useRouter()
  const {
    supplierInvoices,
    loadingInvoices,
    fetchSupplierInvoices,
    updateSupplierInvoice,
    purchaseOrders,
    fetchPurchaseOrders,
    grns,
    fetchGrns
  } = useProcurementStore()

  // State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [selectedInvoiceForAudit, setSelectedInvoiceForAudit] = useState<SupplierInvoice | null>(null)
  const [isActioning, setIsActioning] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchSupplierInvoices()
    fetchPurchaseOrders()
    fetchGrns()
  }, [])

  const stats = useMemo(() => {
    return {
      all: supplierInvoices.length,
      MATCHED: supplierInvoices.filter(i => i.matchStatus === 'MATCHED').length,
      PENDING_MATCH: supplierInvoices.filter(i => i.matchStatus === 'PENDING').length,
      DISPUTED: supplierInvoices.filter(i => i.status === 'DISPUTED').length,
    }
  }, [supplierInvoices])

  const filtered = useMemo(() => {
    let list = [...supplierInvoices]
    if (statusFilter !== 'all') {
      if (statusFilter === 'DISPUTED') {
        list = list.filter(i => i.status === 'DISPUTED')
      } else {
        list = list.filter(i => i.matchStatus === statusFilter)
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.invoiceNumber?.toLowerCase().includes(q) ||
        i.supplierName?.toLowerCase().includes(q) ||
        i.poNumber?.toLowerCase().includes(q)
      )
    }
    return list
  }, [supplierInvoices, search, statusFilter])

  // Paginated Invoices
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(paginated.map(i => i.id))
    } else {
      setSelectedInvoices([])
    }
  }

  const handleSelectInvoice = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedInvoices(prev => [...prev, id])
    } else {
      setSelectedInvoices(prev => prev.filter(item => item !== id))
    }
  }

  // Actions
  const handleApproveInvoice = async (id: string) => {
    setIsActioning(true)
    try {
      await updateSupplierInvoice(id, {
        status: 'PAYMENT_PENDING',
        matchStatus: 'MATCHED'
      })
      toast.success('Invoice approved for payment queue')
      setSelectedInvoiceForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setIsActioning(false)
    }
  }

  const handleDisputeInvoice = async (id: string) => {
    setIsActioning(true)
    try {
      await updateSupplierInvoice(id, {
        status: 'DISPUTED'
      })
      toast.success('Invoice marked as DISPUTED')
      setSelectedInvoiceForAudit(null)
    } catch (err: any) {
      toast.error(err.message || 'Action failed')
    } finally {
      setIsActioning(false)
    }
  }

  // Look up source PO and GRN matching rows for 3-way match
  const invoiceSourceDetails = useMemo(() => {
    if (!selectedInvoiceForAudit) return null
    const matchedPo = purchaseOrders.find(po => po.poNumber === selectedInvoiceForAudit.poNumber)
    const matchedGrn = grns.find(g => g.poNumber === selectedInvoiceForAudit.poNumber)
    return {
      po: matchedPo,
      grn: matchedGrn
    }
  }, [selectedInvoiceForAudit, purchaseOrders, grns])

  // Left Panel component
  const LeftPanel = (
    <div className="space-y-4">
      {/* Stats Summary */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">Matching Stats</h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setStatusFilter('all')}>
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer" onClick={() => setStatusFilter('MATCHED')}>
            <p className="text-lg font-black text-green-500">{stats.MATCHED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Matched</p>
          </div>
          <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10 cursor-pointer" onClick={() => setStatusFilter('PENDING')}>
            <p className="text-lg font-black text-blue-500">{stats.PENDING_MATCH}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Pending</p>
          </div>
          <div className="bg-red-500/5 p-2 rounded-xl border border-red-500/10 cursor-pointer" onClick={() => setStatusFilter('DISPUTED')}>
            <p className="text-lg font-black text-red-500">{stats.DISPUTED}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Disputed</p>
          </div>
        </div>
      </GlassCard>

      {/* Filter Buttons */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">Status Filtering</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Invoices', count: stats.all },
            { key: 'MATCHED', label: 'Matched (3-Way Match)', count: stats.MATCHED },
            { key: 'PENDING', label: 'Pending Match', count: stats.PENDING_MATCH },
            { key: 'DISPUTED', label: 'Disputed Invoices', count: stats.DISPUTED },
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

      {/* Guideline */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Info className="size-3.5" /> 3-Way Match Policy</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The system validates invoices by comparing PO quantities & prices, GRN receipt counts, and Invoice totals. Matched items go to accounts payable.
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
            placeholder="Search by invoice#, supplier..."
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
            onClick={() => router.push('/procurement/invoices/new')}
          >
            <Plus className="size-4" /> Record Invoice
          </Button>
        </div>
      </div>

      {/* Invoice Sticky Table Grid */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        {loadingInvoices ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Loading invoices...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <Receipt className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No Invoices Recorded</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse border-0">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                <th className="p-3 w-10 text-center">
                  <Checkbox
                    checked={paginated.length > 0 && selectedInvoices.length === paginated.length}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3">Invoice Number</th>
                <th className="p-3">Supplier Name</th>
                <th className="p-3">Linked PO</th>
                <th className="p-3 text-right">Tax Value</th>
                <th className="p-3 text-right">Total Invoice</th>
                <th className="p-3 text-center">Match Status</th>
                <th className="p-3 text-center">Payment</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(inv => {
                const isSelected = selectedInvoices.includes(inv.id)
                const matchColors: Record<string, string> = {
                  PENDING: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
                  MATCHED: 'bg-green-500/10 text-green-600 border-green-500/20',
                  VARIANCE_WITHIN_THRESHOLD: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                  VARIANCE_EXCEEDED: 'bg-red-500/10 text-red-600 border-red-500/20',
                  OVERRIDE_APPROVED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                }
                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedInvoiceForAudit(inv)}
                    className={cn(
                      'border-b border-border/10 hover:bg-muted/40 transition-colors cursor-pointer h-11',
                      isSelected && 'bg-[#ff8903]/5'
                    )}
                  >
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked => handleSelectInvoice(inv.id, !!checked)}
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-blue-500">{inv.invoiceNumber}</td>
                    <td className="p-3 font-semibold truncate max-w-44">{inv.supplierName}</td>
                    <td className="p-3 font-mono text-muted-foreground">{inv.poNumber}</td>
                    <td className="p-3 text-right text-muted-foreground">{fmt(inv.tax)}</td>
                    <td className="p-3 text-right font-black text-foreground">{fmt(inv.totalAmount)}</td>
                    <td className="p-3 text-center">
                      <span className={cn('text-[8px] font-bold px-2 py-0.5 rounded border uppercase', matchColors[inv.matchStatus || 'PENDING'])}>
                        {inv.matchStatus?.replace(/_/g, ' ') || 'PENDING'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <TrafficLightBadge status={inv.status || 'PENDING'} />
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

  // Audit modal Left Pane (Invoice info details)
  const auditModalLeftPanel = selectedInvoiceForAudit && (
    <div className="space-y-4">
      {/* Details Box */}
      <div className="grid grid-cols-2 gap-3 bg-muted/20 p-4 rounded-2xl border text-xs">
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Invoice Number</span><p className="font-bold text-sm text-blue-500">{selectedInvoiceForAudit.invoiceNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Match Status</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-card inline-block mt-0.5 uppercase">
            {selectedInvoiceForAudit.matchStatus?.replace(/_/g, ' ')}
          </span>
        </div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Supplier</span><p className="font-semibold text-foreground flex items-center gap-1"><Building2 className="size-3 text-[#ff8903]" /> {selectedInvoiceForAudit.supplierName}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Purchase Order Ref</span><p className="font-mono text-foreground font-bold">{selectedInvoiceForAudit.poNumber}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Invoice Date</span><p className="font-medium flex items-center gap-1"><Calendar className="size-3 text-muted-foreground" /> {formatDate(selectedInvoiceForAudit.invoiceDate)}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Payment Status</span><TrafficLightBadge status={selectedInvoiceForAudit.status || 'PENDING'} className="mt-0.5" /></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Payment Method Account</span><p className="font-semibold text-foreground">{selectedInvoiceForAudit.paymentMethod || '—'}</p></div>
        <div><span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider block">Recorded At</span><p className="font-medium flex items-center gap-1"><Clock className="size-3 text-muted-foreground" /> {formatDate(selectedInvoiceForAudit.createdAt)}</p></div>
      </div>

      {/* Invoice Items Grid */}
      <div className="border border-border/20 rounded-2xl overflow-hidden bg-card">
        <div className="p-3 border-b bg-muted/30 font-black text-xs uppercase tracking-wider">Invoice Line Items</div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b text-[9px] font-black uppercase text-muted-foreground tracking-wider bg-muted/10 h-8">
              <th className="p-2.5">Item Description</th>
              <th className="p-2.5 text-center">Qty</th>
              <th className="p-2.5 text-right">Unit cost</th>
              <th className="p-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedInvoiceForAudit.items.map((item, idx) => (
              <tr key={idx} className="border-b border-border/10 last:border-0 h-9">
                <td className="p-2.5 font-medium">{item.description}</td>
                <td className="p-2.5 text-center font-bold">{item.qty}</td>
                <td className="p-2.5 text-right text-muted-foreground">{fmt(item.unitCost)}</td>
                <td className="p-2.5 text-right font-bold text-foreground">{fmt(item.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3.5 bg-muted/20 border-t space-y-1 text-xs">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-bold">{fmt(selectedInvoiceForAudit.subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Tax Value</span><span className="font-bold">{fmt(selectedInvoiceForAudit.tax)}</span></div>
          <div className="flex justify-between items-center text-sm font-black text-[#ff8903] pt-1.5 border-t">
            <span>Invoice Total Amount</span>
            <span>{fmt(selectedInvoiceForAudit.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Invoice Actions */}
      {selectedInvoiceForAudit.matchStatus !== 'MATCHED' && selectedInvoiceForAudit.status !== 'PAYMENT_PROCESSED' && (
        <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-2xl space-y-2.5">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> Resolve Matching Variance
          </h4>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            The supplier invoice has a variance discrepancy. You can force-match (override) the invoice to approve it for payment.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handleApproveInvoice(selectedInvoiceForAudit.id)}
              disabled={isActioning}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-10 rounded-xl"
            >
              Force Approve Invoice
            </Button>
            <Button
              onClick={() => handleDisputeInvoice(selectedInvoiceForAudit.id)}
              disabled={isActioning}
              variant="outline"
              className="text-red-500 hover:bg-red-500/10 border-red-500/20 font-bold text-xs h-10 rounded-xl flex-1"
            >
              Mark Disputed
            </Button>
          </div>
        </div>
      )}

      {selectedInvoiceForAudit.matchStatus === 'MATCHED' && selectedInvoiceForAudit.status === 'PENDING_MATCH' && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center justify-between text-xs">
          <span className="text-green-600 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> 3-Way Match Verified
          </span>
          <Button
            size="sm"
            className="bg-[#ff8903] text-white font-bold text-xs h-8 rounded-lg"
            onClick={() => handleApproveInvoice(selectedInvoiceForAudit.id)}
          >
            Authorize Payment Queue
          </Button>
        </div>
      )}
    </div>
  )

  // Audit modal Right Pane (3-Way Match comparative statistics details)
  const auditModalRightPanel = selectedInvoiceForAudit && (
    <div className="space-y-4">
      {/* Match analysis */}
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/10">
        <Receipt className="size-4 text-[#ff8903]" /> 3-Way Match Comparison
      </div>

      <Card className={cn('border shadow-sm', selectedInvoiceForAudit.matchStatus === 'MATCHED' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20')}>
        <CardContent className="p-4 space-y-2 text-xs">
          <h5 className="font-black uppercase text-muted-foreground text-[9px] tracking-wider">Variance summary</h5>
          <div className="flex items-center gap-3">
            {selectedInvoiceForAudit.matchStatus === 'MATCHED' ? (
              <CheckCircle2 className="size-7 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="size-7 text-red-500 shrink-0" />
            )}
            <div>
              <p className="text-base font-black text-foreground">
                Difference: {selectedInvoiceForAudit.matchVariance >= 0 ? '+' : ''}{fmt(selectedInvoiceForAudit.matchVariance)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selectedInvoiceForAudit.matchVariancePercent?.toFixed(2) || '0.00'}% difference from estimated PO total ({fmt(selectedInvoiceForAudit.expectedAmount)})
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details of linked docs */}
      <div className="space-y-3">
        <div className="bg-card border p-3 rounded-2xl text-xs space-y-1.5">
          <h5 className="font-bold flex items-center gap-1.5 text-[#ff8903] text-[10px] uppercase font-black">
            <ShoppingCart className="size-3.5" /> Purchase Order Target
          </h5>
          {invoiceSourceDetails?.po ? (
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>PO Number: <strong className="text-foreground">{invoiceSourceDetails.po.poNumber}</strong></p>
              <p>Original Amount: <strong className="text-foreground">{fmt(invoiceSourceDetails.po.totalOrderValue)}</strong></p>
              <p>Delivery address: <strong>{invoiceSourceDetails.po.deliveryAddress}</strong></p>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-[10px]">No linked Purchase Order records loaded.</p>
          )}
        </div>

        <div className="bg-card border p-3 rounded-2xl text-xs space-y-1.5">
          <h5 className="font-bold flex items-center gap-1.5 text-emerald-600 text-[10px] uppercase font-black">
            <Truck className="size-3.5" /> Goods Received Log
          </h5>
          {invoiceSourceDetails?.grn ? (
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>GRN Receipt: <strong className="text-foreground">{invoiceSourceDetails.grn.grnNumber}</strong></p>
              <p>Received by: <strong>{invoiceSourceDetails.grn.receivedBy || 'PMO'}</strong></p>
              <p>Date received: <strong>{formatDate(invoiceSourceDetails.grn.createdAt)}</strong></p>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-[10px]">No matching GRN reception history recorded for this PO.</p>
          )}
        </div>
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
            <h1 className="text-lg font-black tracking-tight">Supplier Invoices</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {supplierInvoices.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">3-way matching and accounts payable</p>
        </div>
      </header>

      {/* Master Detail Layout */}
      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout leftPanel={LeftPanel} rightPanel={RightPanel} />
      </div>

      {/* Side-by-Side Wide Audit Modal */}
      {selectedInvoiceForAudit && (
        <AuditModal
          isOpen={!!selectedInvoiceForAudit}
          onClose={() => setSelectedInvoiceForAudit(null)}
          title={`3-Way Match Verification: Invoice ${selectedInvoiceForAudit.invoiceNumber}`}
          description={`Verify invoice amounts against PO expected values and GRN received counts.`}
          leftPanel={auditModalLeftPanel}
          rightPanel={auditModalRightPanel}
        />
      )}
    </div>
  )
}