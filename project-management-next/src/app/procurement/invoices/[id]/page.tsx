'use client'

import React, { useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Receipt, Loader2, Building2, DollarSign, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react'

const matchColors: Record<string, string> = {
  PENDING: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  MATCHED: 'bg-green-500/10 text-green-600 border-green-500/20',
  VARIANCE_WITHIN_THRESHOLD: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  VARIANCE_EXCEEDED: 'bg-red-500/10 text-red-600 border-red-500/20',
  OVERRIDE_APPROVED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
}

const invStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-500/10 text-gray-600',
  PENDING_MATCH: 'bg-blue-500/10 text-blue-600',
  MATCHED: 'bg-green-500/10 text-green-600',
  VARIANCE_FLAGGED: 'bg-red-500/10 text-red-600',
  APPROVED: 'bg-emerald-500/10 text-emerald-600',
  PAYMENT_PENDING: 'bg-amber-500/10 text-amber-600',
  PAYMENT_PROCESSED: 'bg-purple-500/10 text-purple-600',
  DISPUTED: 'bg-red-500/10 text-red-600',
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { supplierInvoices, loadingInvoices, fetchSupplierInvoices, updateSupplierInvoice } = useProcurementStore()

  useEffect(() => { if (supplierInvoices.length === 0) fetchSupplierInvoices() }, [])

  const inv = useMemo(() => supplierInvoices.find(i => i.id === id), [supplierInvoices, id])

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })
  const formatDate = (d: any) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  if (loadingInvoices && !inv) return <div className="flex-1 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-[#ff8903]" /></div>
  if (!inv) return <div className="flex-1 flex items-center justify-center text-muted-foreground"><p>Invoice not found</p></div>

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black tracking-tight">{inv.invoiceNumber}</h1>
            <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase ${matchColors[inv.matchStatus] || ''}`}>
              {inv.matchStatus?.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className={`text-[7px] h-3.5 px-1 font-bold ${invStatusColors[inv.status] || ''}`}>
              {inv.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{inv.supplierName}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        {/* Match Summary */}
        <Card className={`border shadow-sm ${inv.matchStatus === 'MATCHED' ? 'bg-green-500/5 border-green-500/20' : inv.matchStatus === 'VARIANCE_EXCEEDED' ? 'bg-red-500/5 border-red-500/20' : 'bg-card'}`}>
          <CardContent className="p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">3-Way Match Analysis</p>
            <div className="flex items-center gap-3">
              {inv.matchStatus === 'MATCHED' ? <CheckCircle2 className="size-8 text-green-500" /> : <AlertTriangle className="size-8 text-amber-500" />}
              <div>
                <p className="text-lg font-black">
                  Variance: {inv.matchVariance >= 0 ? '+' : ''}{fmt(inv.matchVariance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {inv.matchVariancePercent.toFixed(2)}% variance from expected {fmt(inv.expectedAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Invoice Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Supplier</span><p className="font-medium">{inv.supplierName}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Purchase Order</span><p className="font-medium">{inv.poNumber}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Invoice Date</span><p className="font-medium">{formatDate(inv.invoiceDate)}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Due Date</span><p className="font-medium">{formatDate(inv.dueDate)}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Currency</span><p className="font-medium">{inv.currency}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Created</span><p className="font-medium">{formatDate(inv.createdAt)}</p></div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Line Items ({inv.items.length})</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="text-left p-2">Description</th>
                  <th className="text-center p-2">Qty</th>
                  <th className="text-right p-2">Unit Cost</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b border-muted/20">
                    <td className="p-2 font-medium">{item.description}</td>
                    <td className="p-2 text-center">{item.qty}</td>
                    <td className="p-2 text-right">{fmt(item.unitCost)}</td>
                    <td className="p-2 text-right font-bold">{fmt(item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 mt-3 pt-3 border-t text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-bold">{fmt(inv.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-bold">{fmt(inv.tax)}</span></div>
              <div className="flex justify-between text-base font-black text-[#ff8903] pt-1 border-t">
                <span>Total</span>
                <span>{fmt(inv.totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}