'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft, Save, Loader2, Hash, ShoppingCart, Building2, Calendar, MapPin, DollarSign
} from 'lucide-react'
import { toast } from 'sonner'
import type { PaymentTerms, ProcurementLineItem } from '@/features/procurement/types'
import type { POStatus } from '@/features/procurement/types/procurement'

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prId = searchParams.get('prId')
  const { suppliers, requisitions, addPurchaseOrder, updateRequisition } = useProcurementStore()

  const [supplierId, setSupplierId] = useState('')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('NET30')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const linkedPr = prId ? requisitions.find(r => r.id === prId) : null

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  const totalOrderValue = (linkedPr?.items || []).reduce((sum: number, item: ProcurementLineItem) => sum + (item.totalCost || 0), 0)

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })

  const handleSubmit = async () => {
    if (!supplierId) { toast.error('Please select a supplier'); return }
    if (!linkedPr) { toast.error('No requisition linked'); return }

    setIsSubmitting(true)
    try {
      const poId = await addPurchaseOrder({
        status: 'DRAFT' as POStatus,
        prId: linkedPr.id,
        prNumber: linkedPr.prNumber,
        supplierId,
        supplierName: selectedSupplier?.name || '',
        supplierEmail: selectedSupplier?.email || '',
        supplierPhone: selectedSupplier?.phone || '',
        paymentTerms,
        items: linkedPr.items.map(item => ({
          ...item,
          inventoryItemStatus: item.inventoryItemStatus || 'ADHOC',
        })),
        totalOrderValue,
        procurementType: linkedPr.procurementType,
        department: linkedPr.department,
        jobCardId: linkedPr.jobCardId,
        jobCardTitle: linkedPr.jobCardTitle,
        deliveryAddress,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes,
        sentAt: null,
        acknowledgedAt: null,
        createdBy: '',
      })

      await updateRequisition(linkedPr.id, { linkedPoId: poId })
      toast.success('Purchase order created')
      router.push(`/procurement/purchase-orders/${poId}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create PO')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">New Purchase Order</h1>
            {linkedPr && <Badge variant="outline" className="text-[9px] font-mono text-blue-500">{linkedPr.prNumber}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{linkedPr ? `From ${linkedPr.title}` : 'Create from a requisition'}</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Supplier *</Label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                <option value="">Select supplier</option>
                {suppliers.filter(s => s.status === 'ACTIVE').map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.paymentTerms}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Payment Terms</Label>
                <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value as PaymentTerms)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="COD">COD</option>
                  <option value="NET30">NET 30</option>
                  <option value="NET60">NET 60</option>
                  <option value="NET90">NET 90</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Expected Delivery</Label>
                <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Delivery Address</Label>
              <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Physical delivery location" className="h-10" />
            </div>
          </CardContent>
        </Card>

        {linkedPr && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Line Items from {linkedPr.prNumber}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
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
                    {linkedPr.items.map((item: ProcurementLineItem, idx: number) => (
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
              </div>
              <div className="flex justify-between items-center pt-3 mt-2 border-t">
                <span className="text-xs font-black uppercase text-muted-foreground">Total Order Value</span>
                <span className="text-lg font-black text-[#ff8903]">{fmt(totalOrderValue)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Button className="w-full h-12 rounded-2xl bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-black text-sm gap-2"
          disabled={isSubmitting || !linkedPr} onClick={handleSubmit}>
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          {isSubmitting ? 'Creating...' : 'Create Purchase Order'}
        </Button>
      </main>
    </div>
  )
}