'use client'

import React, { useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Truck, Loader2, Building2, Package } from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  DISPUTED: { label: 'Disputed', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
}

const invStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-500/10 text-gray-600',
  PROCESSING: 'bg-blue-500/10 text-blue-600',
  COMPLETE: 'bg-green-500/10 text-green-600',
  FAILED: 'bg-red-500/10 text-red-600',
}

export default function GrnDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { grns, loadingGrns, fetchGrns } = useProcurementStore()

  useEffect(() => { if (grns.length === 0) fetchGrns() }, [])

  const grn = useMemo(() => grns.find(g => g.id === id), [grns, id])

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })
  const formatDate = (d: any) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  if (loadingGrns && !grn) return <div className="flex-1 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-[#ff8903]" /></div>
  if (!grn) return <div className="flex-1 flex items-center justify-center text-muted-foreground"><p>GRN not found</p></div>

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black tracking-tight">{grn.grnNumber}</h1>
            <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase ${statusConfig[grn.status]?.color || ''}`}>
              {statusConfig[grn.status]?.label || grn.status}
            </Badge>
            <Badge variant="outline" className={`text-[7px] h-3.5 px-1 font-bold ${invStatusColors[grn.inventoryPostingStatus] || ''}`}>
              INVENTORY: {grn.inventoryPostingStatus}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">PO: {grn.poNumber} — {grn.supplierName}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Items Received</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="text-left p-2">Description</th>
                  <th className="text-center p-2">Ordered</th>
                  <th className="text-center p-2">Received</th>
                  <th className="text-center p-2">Variance</th>
                  <th className="text-right p-2">Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                {(grn.items || []).map((item: any, idx: number) => (
                  <tr key={item.lineItemId || idx} className="border-b border-muted/20">
                    <td className="p-2 font-medium">{item.description}</td>
                    <td className="p-2 text-center">{item.qtyOrdered}</td>
                    <td className="p-2 text-center font-bold">{item.qtyReceived}</td>
                    <td className={`p-2 text-center font-bold ${item.qtyVariance !== 0 ? 'text-amber-500' : 'text-green-500'}`}>{item.qtyVariance}</td>
                    <td className="p-2 text-right">{fmt(item.unitCostPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {grn.inventoryPostingError && (
          <Card className="border border-red-500/20 bg-red-500/5">
            <CardContent className="p-3">
              <p className="text-xs font-bold text-red-500">Posting Error</p>
              <p className="text-[10px] text-red-400 mt-1">{grn.inventoryPostingError}</p>
            </CardContent>
          </Card>
        )}

        {grn.disputeReason && (
          <Card className="border border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-3">
              <p className="text-xs font-bold text-amber-500">Dispute Reason</p>
              <p className="text-[10px] text-amber-400 mt-1">{grn.disputeReason}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}