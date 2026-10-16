'use client'

import React, { useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ShoppingCart, Truck, Building2, Calendar, MapPin, DollarSign, Loader2 } from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  SENT: { label: 'Sent', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
  PARTIALLY_FULFILLED: { label: 'Partial', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  COMPLETE: { label: 'Complete', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
}

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { purchaseOrders, loadingPurchaseOrders, fetchPurchaseOrders } = useProcurementStore()

  useEffect(() => { if (purchaseOrders.length === 0) fetchPurchaseOrders() }, [])

  const po = useMemo(() => purchaseOrders.find(p => p.id === id), [purchaseOrders, id])

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })
  const formatDate = (d: any) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  if (loadingPurchaseOrders && !po) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-[#ff8903]" /></div>
  }
  if (!po) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground"><p>Purchase order not found</p></div>
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black tracking-tight">{po.poNumber}</h1>
            <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase ${statusConfig[po.status]?.color || ''}`}>
              {statusConfig[po.status]?.label || po.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">From PR: {po.prNumber}</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1 bg-[#ff8903] text-white font-bold" onClick={() => router.push(`/procurement/grns/new?poId=${id}`)}>
          <Truck className="size-3" /> Create GRN
        </Button>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Supplier Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Supplier</span><p className="font-medium flex items-center gap-1"><Building2 className="size-3 text-[#ff8903]" />{po.supplierName}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Email</span><p className="font-medium">{po.supplierEmail || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Phone</span><p className="font-medium">{po.supplierPhone || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Payment Terms</span><p className="font-medium">{po.paymentTerms}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Delivery Address</span><p className="font-medium flex items-center gap-1"><MapPin className="size-3" />{po.deliveryAddress || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Expected Delivery</span><p className="font-medium flex items-center gap-1"><Calendar className="size-3" />{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Created</span><p className="font-medium">{formatDate(po.createdAt)}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Updated</span><p className="font-medium">{formatDate(po.updatedAt)}</p></div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Line Items ({po.items.length})</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="text-left p-2">Description</th>
                  <th className="text-center p-2">UOM</th>
                  <th className="text-center p-2">Qty</th>
                  <th className="text-right p-2">Unit Price</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((item: any, idx: number) => (
                  <tr key={item.id || idx} className="border-b border-muted/20">
                    <td className="p-2 font-medium">{item.description}</td>
                    <td className="p-2 text-center text-muted-foreground">{item.uom}</td>
                    <td className="p-2 text-center">{item.qty}</td>
                    <td className="p-2 text-right">{fmt(item.unitCostPrice)}</td>
                    <td className="p-2 text-right font-bold">{fmt(item.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center pt-3 mt-2 border-t">
              <span className="text-xs font-black uppercase text-muted-foreground">Total Order Value</span>
              <span className="text-lg font-black text-[#ff8903]">{fmt(po.totalOrderValue)}</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}