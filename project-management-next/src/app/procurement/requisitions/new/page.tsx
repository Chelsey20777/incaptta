'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Hash
} from 'lucide-react'
import { toast } from 'sonner'
import type { ProcurementType } from '@/features/procurement/types'

interface LineItemForm {
  id: string
  description: string
  uom: string
  qty: number
  unitCostPrice: number
  freightDuty: number
  markupPercent: number
}

const emptyItem = (): LineItemForm => ({
  id: Date.now().toString(),
  description: '',
  uom: 'pcs',
  qty: 1,
  unitCostPrice: 0,
  freightDuty: 0,
  markupPercent: 0,
})

const procurementTypes: ProcurementType[] = [
  'PROJECT_MATERIAL', 'INVENTORY', 'CAPEX', 'SERVICE', 'ADHOC'
]

export default function NewRequisitionPage() {
  const router = useRouter()
  const { suppliers, addRequisition, generatePrNumber } = useProcurementStore()
  const [prNumber, setPrNumber] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [procurementType, setProcurementType] = useState<ProcurementType>('PROJECT_MATERIAL')
  const [department, setDepartment] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [jobCardId, setJobCardId] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([emptyItem()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingPr, setLoadingPr] = useState(true)

  useEffect(() => {
    generatePrNumber().then(num => {
      setPrNumber(num)
      setLoadingPr(false)
    }).catch(() => {
      setPrNumber('PR-ERROR')
      setLoadingPr(false)
    })
  }, [])

  const addItem = () => setLineItems(prev => [...prev, emptyItem()])
  const removeItem = (id: string) => setLineItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev)

  const updateItem = (id: string, field: keyof LineItemForm, value: any) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      if (field === 'qty' || field === 'unitCostPrice' || field === 'freightDuty') {
        // auto-calcs already done via computed
      }
      return updated
    }))
  }

  const calcTotalCost = (item: LineItemForm) => {
    return (item.qty * item.unitCostPrice) + item.freightDuty
  }

  const calcSellingPrice = (item: LineItemForm) => {
    const totalCost = calcTotalCost(item)
    return totalCost * (1 + (item.markupPercent / 100))
  }

  const calcMargin = (item: LineItemForm) => {
    return calcSellingPrice(item) - calcTotalCost(item)
  }

  const totalEstimatedCost = lineItems.reduce((sum, item) => sum + calcTotalCost(item), 0)

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (lineItems.some(i => !i.description.trim())) { toast.error('All line items need a description'); return }

    setIsSubmitting(true)
    try {
      const selectedSupplier = suppliers.find(s => s.id === supplierId)
      const docRef = await addRequisition({
        title: title.trim(),
        description: description.trim(),
        procurementType,
        department: department.trim(),
        jobCardId: jobCardId.trim() || null,
        jobCardTitle: null,
        supplierId: supplierId || null,
        supplierName: selectedSupplier?.name || null,
        items: lineItems.map(item => ({
          id: item.id,
          description: item.description,
          uom: item.uom,
          qty: item.qty,
          unitCostPrice: item.unitCostPrice,
          freightDuty: item.freightDuty,
          totalCost: calcTotalCost(item),
          markupPercent: item.markupPercent,
          sellingPrice: calcSellingPrice(item),
          marginAmount: calcMargin(item),
          inventoryItemId: null,
          sku: null,
          isAdHoc: true,
          inventoryItemStatus: 'ADHOC' as const,
          newItemData: null,
          notes: '',
        })),
        totalEstimatedCost,
        status: 'DRAFT',
        rejectionReason: null,
        requestedBy: '',
        requestedByName: '',
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
      })
      toast.success(`Requisition ${prNumber} created`)
      router.push(`/procurement/requisitions/${docRef}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create requisition')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="size-6" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">New Requisition</h1>
            {!loadingPr && prNumber && (
              <Badge variant="outline" className="text-[10px] font-mono font-bold text-[#ff8903] border-[#ff8903]/30">
                <Hash className="size-3 mr-0.5" />{prNumber}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Create a purchase request</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        {/* Basic Info */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Office supplies Q3" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase text-muted-foreground">Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Type</Label>
                <select value={procurementType} onChange={e => setProcurementType(e.target.value as ProcurementType)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  {procurementTypes.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Department</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Operations" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Supplier</Label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select supplier (optional)</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Job Card ID</Label>
                <Input value={jobCardId} onChange={e => setJobCardId(e.target.value)} placeholder="Optional" className="h-10" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-black">Line Items</CardTitle>
            <Button size="sm" variant="outline" onClick={addItem} className="h-8 text-xs gap-1">
              <Plus className="size-3" /> Add Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={item.id} className="border rounded-xl p-3 space-y-2 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-muted-foreground">Item {idx + 1}</span>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => removeItem(item.id)}>
                    <Trash2 className="size-3 text-red-400" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Item description" className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[8px] font-bold uppercase text-muted-foreground">UOM</Label>
                    <Input value={item.uom} onChange={e => updateItem(item.id, 'uom', e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] font-bold uppercase text-muted-foreground">Qty</Label>
                    <Input type="number" value={item.qty} onChange={e => updateItem(item.id, 'qty', Number(e.target.value))} className="h-9 text-xs" min="1" />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] font-bold uppercase text-muted-foreground">Unit Price</Label>
                    <Input type="number" value={item.unitCostPrice} onChange={e => updateItem(item.id, 'unitCostPrice', Number(e.target.value))} className="h-9 text-xs" min="0" step="0.01" />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[8px] font-bold uppercase text-muted-foreground">Freight</Label>
                    <Input type="number" value={item.freightDuty} onChange={e => updateItem(item.id, 'freightDuty', Number(e.target.value))} className="h-9 text-xs" min="0" step="0.01" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                  <span>Total: <span className="text-foreground">{fmt(calcTotalCost(item))}</span></span>
                  <span>Sell: <span className="text-foreground">{fmt(calcSellingPrice(item))}</span></span>
                </div>
              </div>
            ))}

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-xs font-black uppercase text-muted-foreground">Total Estimated Cost</span>
              <span className="text-lg font-black text-[#ff8903]">{fmt(totalEstimatedCost)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          className="w-full h-12 rounded-2xl bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-black text-sm gap-2"
          disabled={isSubmitting || loadingPr}
          onClick={handleSubmit}
        >
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
          {isSubmitting ? 'Creating...' : `Create ${prNumber}`}
        </Button>
      </main>
    </div>
  )
}