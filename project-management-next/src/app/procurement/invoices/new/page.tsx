'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, Save, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import type { InvoiceLineItem } from '@/features/procurement/types/procurement'

export default function NewInvoicePage() {
  const router = useRouter()
  const { suppliers, purchaseOrders, addSupplierInvoice, computeInvoiceMatch } = useProcurementStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [poId, setPoId] = useState('')
  const [tax, setTax] = useState(0)
  const [currency, setCurrency] = useState<'USD' | 'ZWL' | 'ZAR'>('USD')

  const selectedPo = poId ? purchaseOrders.find(p => p.id === poId) : null
  const selectedSupplier = supplierId ? suppliers.find(s => s.id === supplierId) : null
  const filteredPOs = purchaseOrders.filter(p => !supplierId || p.supplierId === supplierId)

  const lineItems: InvoiceLineItem[] = selectedPo
    ? selectedPo.items.map((item: any) => ({
        description: item.description,
        qty: item.qty,
        unitCost: item.unitCostPrice,
        totalCost: item.totalCost,
      }))
    : []

  const subtotal = lineItems.reduce((s, i) => s + i.totalCost, 0)
  const totalAmount = subtotal + Number(tax)
  const expectedAmount = selectedPo?.totalOrderValue || 0
  const matchResult = selectedPo && totalAmount > 0 && expectedAmount > 0
    ? computeInvoiceMatch(totalAmount, expectedAmount)
    : null

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })

  const handleSubmit = async () => {
    if (!supplierId) { toast.error('Select a supplier'); return }
    if (!invoiceNumber.trim()) { toast.error('Enter invoice number'); return }
    if (!poId) { toast.error('Select a purchase order'); return }
    setIsSubmitting(true)
    try {
      await addSupplierInvoice({
        invoiceNumber: invoiceNumber.trim(),
        poId: selectedPo!.id,
        poNumber: selectedPo!.poNumber,
        grnId: '',
        grnNumber: '',
        prId: selectedPo!.prId,
        prNumber: selectedPo!.prNumber,
        supplierId,
        supplierName: selectedSupplier?.name || '',
        supplierEmail: selectedSupplier?.email || '',
        department: selectedPo!.department || '',
        currency,
        invoiceDate,
        dueDate,
        items: lineItems,
        subtotal,
        tax: Number(tax),
        totalAmount,
        expectedAmount,
        matchVariance: matchResult?.matchVariance || 0,
        matchVariancePercent: matchResult?.matchVariancePercent || 0,
        matchStatus: matchResult?.matchStatus || 'PENDING',
        matchOverrideReason: null,
        matchOverrideBy: null,
        matchOverrideAt: null,
        status: 'DRAFT',
        notes: '',
        attachmentUrl: null,
        operationalExpenseId: null,
        paymentMethod: null,
        paymentReference: null,
        paymentProcessedAt: null,
        createdBy: '',
      })
      toast.success('Invoice recorded')
      router.push('/procurement/invoices')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">New Invoice</h1>
          <p className="text-xs text-muted-foreground">Record supplier bill with 3-way matching</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Supplier *</Label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select supplier</option>
                  {suppliers.filter(s => s.status === 'ACTIVE').map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Currency</Label>
                <select value={currency} onChange={e => setCurrency(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="USD">USD</option>
                  <option value="ZWL">ZWL</option>
                  <option value="ZAR">ZAR</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Invoice Number *</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-001" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Due Date</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Purchase Order</Label>
              <select value={poId} onChange={e => setPoId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                <option value="">Select PO</option>
                {filteredPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.poNumber} — {po.supplierName} ({fmt(po.totalOrderValue)})</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {selectedPo && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Line Items from {selectedPo.poNumber}</CardTitle></CardHeader>
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
                  {lineItems.map((item, idx) => (
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
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-bold">{fmt(subtotal)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tax</span>
                  <Input type="number" value={tax} onChange={e => setTax(Number(e.target.value))} className="h-7 w-24 text-xs text-right" min="0" step="0.01" />
                </div>
                <div className="flex justify-between text-sm font-black text-[#ff8903] pt-1 border-t">
                  <span>Total</span>
                  <span>{fmt(totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Match Result Preview */}
        {matchResult && (
          <Card className={`border shadow-sm ${matchResult.matchStatus === 'MATCHED' ? 'bg-green-500/5 border-green-500/20' : matchResult.matchStatus === 'VARIANCE_EXCEEDED' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">3-Way Match Result</p>
                <p className="text-xs font-black mt-0.5">
                  Variance: {fmt(matchResult.matchVariance)} ({matchResult.matchVariancePercent.toFixed(1)}%)
                </p>
              </div>
              <Badge className={`text-[10px] font-bold ${
                matchResult.matchStatus === 'MATCHED' ? 'bg-green-500/20 text-green-600' :
                matchResult.matchStatus === 'VARIANCE_EXCEEDED' ? 'bg-red-500/20 text-red-600' :
                'bg-amber-500/20 text-amber-600'
              }`}>
                {matchResult.matchStatus.replace(/_/g, ' ')}
              </Badge>
            </CardContent>
          </Card>
        )}

        <Button className="w-full h-12 rounded-2xl bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-black text-sm gap-2"
          disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          Record Invoice
        </Button>
      </main>
    </div>
  )
}