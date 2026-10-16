'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, Save, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import type { ProcurementLineItem } from '@/features/procurement/types'
import type { GRNLineItem } from '@/features/procurement/types/procurement'

export default function NewGrnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get('poId')
  const { purchaseOrders, grns, addGrn } = useProcurementStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})

  const po = poId ? purchaseOrders.find(p => p.id === poId) : null

  useEffect(() => {
    if (po) {
      const initial: Record<string, number> = {}
      po.items.forEach((item: any) => {
        initial[item.id || item.description] = item.qty
      })
      setReceivedQtys(initial)
    }
  }, [po])

  const handleSubmit = async () => {
    if (!po) { toast.error('No PO linked'); return }
    setIsSubmitting(true)
    try {
      const items: GRNLineItem[] = po.items.map((item: any) => {
        const key = item.id || item.description
        const qtyReceived = Number(receivedQtys[key] || 0)
        return {
          lineItemId: item.id,
          sku: item.sku || null,
          description: item.description,
          uom: item.uom,
          inventoryItemId: item.inventoryItemId || null,
          inventoryItemStatus: item.inventoryItemStatus || 'ADHOC',
          qtyOrdered: item.qty,
          qtyReceived,
          qtyVariance: item.qty - qtyReceived,
          unitCostPrice: item.unitCostPrice,
          notes: '',
        }
      })
      const hasVariance = items.some(i => i.qtyVariance !== 0)

      await addGrn({
        poId: po.id,
        poNumber: po.poNumber,
        prId: po.prId,
        prNumber: po.prNumber,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        department: po.department,
        procurementType: po.procurementType,
        jobCardId: po.jobCardId,
        items,
        status: 'CONFIRMED',
        hasVariance,
        disputeReason: null,
        receivedBy: '',
        receivedAt: null,
        createdBy: '',
      })
      toast.success('GRN created successfully')
      router.push('/procurement/grns')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create GRN')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">New GRN</h1>
            {po && <Badge variant="outline" className="text-[9px] font-mono text-emerald-500">{po.poNumber}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{po ? `Receiving from ${po.supplierName}` : 'Select a PO first'}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        {!po && (
          <div className="text-center py-20 text-muted-foreground">
            <Truck className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No Purchase Order selected</p>
            <p className="text-xs mt-1">Navigate from a PO to create its GRN</p>
          </div>
        )}

        {po && (
          <>
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
                      <th className="text-right p-2">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((item: any, idx: number) => {
                      const key = item.id || item.description
                      const qtyReceived = Number(receivedQtys[key] || 0)
                      const variance = item.qty - qtyReceived
                      return (
                        <tr key={key} className="border-b border-muted/20">
                          <td className="p-2 font-medium">{item.description}</td>
                          <td className="p-2 text-center">{item.qty}</td>
                          <td className="p-2 text-center">
                            <Input type="number" value={qtyReceived} onChange={e => setReceivedQtys(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                              className="h-8 w-20 text-xs text-center" min="0" max={item.qty} />
                          </td>
                          <td className={`p-2 text-center font-bold ${variance !== 0 ? 'text-amber-500' : 'text-green-500'}`}>{variance}</td>
                          <td className="p-2 text-right">{fmt(item.unitCostPrice)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Button className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm gap-2"
              disabled={isSubmitting} onClick={handleSubmit}>
              {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
              {isSubmitting ? 'Processing...' : 'Confirm Goods Received'}
            </Button>
          </>
        )}
      </main>
    </div>
  )
}