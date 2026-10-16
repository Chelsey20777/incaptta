'use client'

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminStore } from '@/stores/admin-store'
import { useCrmStore } from '@/stores/crm-store'
import BomTemplateSelector from '@/features/jobCards/components/BomTemplateSelector'
import { STRUCTURE_SIZES } from '@/features/jobCards/constants/bomTemplates'
import QuoteRequisitionGrid from './QuoteRequisitionGrid'
import OtherServicesGrid from './OtherServicesGrid'
import type {
  CrmQuoteFormData,
  QuoteRequisitionSection,
  OtherService,
  QuoteSummary,
  QuoteInternalCosting,
} from '../types'
import { calculateQuoteCommercials } from '@/lib/crm/quotation-commercial'
import { BILLING_ARRANGEMENTS, DEFAULT_BILLING_TERMS, resolveBillingTerms } from '@/lib/crm/billing-terms'
import type { BomRequisitionSection } from '@/features/jobCards/types'

interface CrmDocumentWorkspaceProps {
  initialData?: CrmQuoteFormData | null
  inventoryItems: any[]
  onSave: (data: CrmQuoteFormData) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

export default function CrmDocumentWorkspace({
  initialData,
  inventoryItems,
  onSave,
  onCancel,
  saving = false,
}: CrmDocumentWorkspaceProps) {
  const adminStore = useAdminStore()
  const crmStore = useCrmStore()

  // ── Draft State ──
  const [customerId, setCustomerId] = useState(initialData?.customerId || '')
  const [customerName, setCustomerName] = useState(initialData?.customerName || '')
  const [customerEmail, setCustomerEmail] = useState(initialData?.customerEmail || '')
  const [dimensionsOfStructure, setDimensionsOfStructure] = useState(
    initialData?.dimensionsOfStructure || '',
  )
  const [requisitionSections, setRequisitionSections] = useState<QuoteRequisitionSection[]>(
    initialData?.requisitionSections || [],
  )
  const [otherServices, setOtherServices] = useState<OtherService[]>(
    initialData?.otherServices || [],
  )
  const [notes, setNotes] = useState(initialData?.notes || '')
  const [validUntil, setValidUntil] = useState(initialData?.validUntil || '')
  const [quoteStatus, setQuoteStatus] = useState<'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'>(
    initialData?.status || 'DRAFT',
  )
  const [internalCosting, setInternalCosting] = useState<QuoteInternalCosting>(
    initialData?.internalCosting || {},
  )
  const [billingTerms, setBillingTerms] = useState(resolveBillingTerms(initialData?.billingTerms || (adminStore.appSettings as any)?.billingTerms || DEFAULT_BILLING_TERMS))
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FLAT'>(initialData?.discountType || 'NONE')
  const [discountValue, setDiscountValue] = useState(Number(initialData?.discountValue) || 0)

  const lastQuoteNumber = useRef<string | null>(null)

  useEffect(() => {
    if (initialData && initialData.quoteNumber !== lastQuoteNumber.current) {
      lastQuoteNumber.current = initialData.quoteNumber
      setCustomerId(initialData.customerId || '')
      setCustomerName(initialData.customerName || '')
      setCustomerEmail(initialData.customerEmail || '')
      setDimensionsOfStructure(initialData.dimensionsOfStructure || '')
      setRequisitionSections(initialData.requisitionSections || [])
      setOtherServices(initialData.otherServices || [])
      setNotes(initialData.notes || '')
      setValidUntil(initialData.validUntil || '')
      setQuoteStatus(initialData.status || 'DRAFT')
      setInternalCosting(initialData.internalCosting || {})
      setBillingTerms(resolveBillingTerms(initialData.billingTerms || (adminStore.appSettings as any)?.billingTerms || DEFAULT_BILLING_TERMS))
      setDiscountType(initialData.discountType || 'NONE')
      setDiscountValue(Number(initialData.discountValue) || 0)
    }
  }, [initialData])

  // ── Derived State ──
  const customers = useMemo(() => crmStore.customers || [], [crmStore.customers])
  const jobCategories = useMemo(() => adminStore.jobCategories || [], [adminStore.jobCategories])
  const appSettings = useMemo(() => adminStore.appSettings || {}, [adminStore.appSettings])

  const vatEnabled = Boolean(appSettings.vatEnabled ?? true)
  const vatRate = Number(appSettings.vatRate ?? 15)

  // ── Financial Calculation Engine ──
  const totals = useMemo((): QuoteSummary & { grandTotal: number; totalServices: number; deliveryCosts: number; missingCosts: string[]; purchaseCost: number } => {
    const materials = requisitionSections.flatMap(section => section.items || [])
    const calculated = calculateQuoteCommercials({
      materials,
      services: otherServices,
      vatEnabled,
      vatRate,
      internalCosting,
      discountType,
      discountValue,
    })
    return {
      totalIrdCost: calculated.irdCharge,
      totalMarkup: calculated.twidMarkup,
      purchaseCost: calculated.purchaseCost,
      totalOtherServices: calculated.services,
      subtotal: calculated.subtotal,
      discountType: calculated.discountType,
      discountValue: calculated.discountValue,
      discountAmount: calculated.discountAmount,
      netSubtotal: calculated.netSubtotal,
      vatRate: calculated.vatRate,
      vatAmount: calculated.vatAmount,
      grandTotal: calculated.customerTotal,
      totalServices: calculated.services,
      estimatedProfit: calculated.estimatedProfit,
      estimatedMargin: calculated.estimatedMargin,
      deliveryCosts: calculated.deliveryCosts,
      missingCosts: calculated.missingCosts,
    }
  }, [requisitionSections, otherServices, vatEnabled, vatRate, internalCosting, discountType, discountValue])

  // ── Customer Selection Handler ──
  const handleCustomerSelect = useCallback(
    (id: string) => {
      setCustomerId(id)
      const customer = customers.find((c: any) => c.id === id)
      if (customer) {
        setCustomerName(customer.name || customer.companyName || '')
        setCustomerEmail(customer.email || '')
      }
    },
    [customers],
  )

  // ── BOM Template Handler ──
  const handleBomApply = useCallback(
    (payload: { sections: BomRequisitionSection[]; mode: 'replace' | 'append' }) => {
      const mapped: QuoteRequisitionSection[] = payload.sections.map((s) => ({
        id: s.id,
        jobCategoryId: s.jobCategoryId,
        description: s.description,
        qty: s.qty ?? 1,
        unit: s.unit ?? 'Unit',
        items: (s.items || []).map((item) => ({
          id: item.id || crypto.randomUUID(),
          inventoryItemId: item.inventoryItemId,
          itemName: item.itemName,
          description: item.description,
          qtyRequired: item.qtyRequired,
          irdSellingPrice: item.irdSellingPrice,
          markupPercent: item.markupPercent,
          uom: item.uom || 'PCS',
          priceOverride: item.priceOverride || false,
          costSnapshot: item.costSnapshot || 0,
        })),
      }))

      if (payload.mode === 'replace') {
        setRequisitionSections(mapped)
      } else {
        setRequisitionSections((prev) => [...prev, ...mapped])
      }
    },
    [],
  )

  const handleBomUnmatched = useCallback((unmatched: any[]) => {
    if (unmatched.length > 0) {
      const names = unmatched.map((u) => `${u.templateName} (qty: ${u.qty})`).join(', ')
      toast.warning('Unmatched Items', {
        description: `Could not match: ${names}. You can fill these manually.`,
      })
    }
  }, [])

  // ── Assembled Form Data ──
  const buildFormData = useCallback((): CrmQuoteFormData => {
    const quoteNumber =
      initialData?.quoteNumber || ''
    return {
      quoteNumber,
      customerId,
      customerName,
      customerEmail,
      dimensionsOfStructure,
      status: quoteStatus,
      validUntil,
      notes,
      billingTerms,
      requisitionSections,
      otherServices,
      internalCosting,
      discountType,
      discountValue,
    }
  }, [
    initialData,
    customerId,
    customerName,
    customerEmail,
    dimensionsOfStructure,
    quoteStatus,
    validUntil,
    notes,
    billingTerms,
    requisitionSections,
    otherServices,
    internalCosting,
    discountType,
    discountValue,
  ])

  const handleSave = useCallback(async () => {
    if (!customerId && !customerName) {
      toast.error('Please select a customer')
      return
    }
    const data = buildFormData()
    await onSave(data)
  }, [buildFormData, customerId, customerName, onSave])

  // ── Format helper ──
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)

  return (
    <div className="space-y-6 pb-10">
      {/* Top Bar */}
      <div className="flex items-center justify-between sticky top-0 z-20 bg-background/95 backdrop-blur py-3 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <h2 className="text-xl font-bold tracking-tight">
            {initialData?.quoteNumber
              ? `Edit ${initialData.quoteNumber}`
              : initialData
                ? 'Edit Quotation'
                : 'New Quotation'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-brand-primary text-white hover:bg-brand-primary/90">
            {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
            {initialData ? 'Update' : 'Save as Draft'}
          </Button>
        </div>
      </div>

      {/* Row 1: Customer + Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Select Customer *</Label>
              <Select value={customerId} onValueChange={(v) => v && handleCustomerSelect(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Search customers...">
                    {customerId
                      ? (customers.find((c: any) => c.id === customerId)?.name || customerName || customerId)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || c.companyName || c.email || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); setCustomerId('') }}
                  placeholder="Or type manually"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Structure Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dimensions of Structure</Label>
              <div className="flex gap-2">
                <Input
                  value={dimensionsOfStructure}
                  onChange={(e) => setDimensionsOfStructure(e.target.value)}
                  placeholder='e.g. 200x30m or select...'
                  className="h-8 text-xs font-mono flex-1"
                />
                <Select
                  value={dimensionsOfStructure}
                  onValueChange={(v) => v && setDimensionsOfStructure(v)}
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs shrink-0">
                    <SelectValue placeholder="Quick Pick" />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_SIZES.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Required for BOM template auto-population.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Quote Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                {quoteStatus === 'SENT' || quoteStatus === 'ACCEPTED' ? (
                  <div className="space-y-1">
                    <div className="h-8 flex items-center rounded-md border px-3 text-xs font-medium">
                      {quoteStatus.charAt(0) + quoteStatus.slice(1).toLowerCase()}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {quoteStatus === 'ACCEPTED'
                        ? 'Set by Accept (creates draft invoice + job). Cannot change here.'
                        : 'Set by Mark sent. Cannot change here.'}
                    </p>
                  </div>
                ) : (
                  <Select value={quoteStatus} onValueChange={(v) => v && setQuoteStatus(v as 'DRAFT' | 'REJECTED')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue>
                        {quoteStatus ? quoteStatus.charAt(0) + quoteStatus.slice(1).toLowerCase() : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valid Until</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Notes */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Notes / Terms
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, delivery conditions, validity period notes..."
              className="min-h-[60px] text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Billing arrangement
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Arrangement</Label>
            <Select
              value={billingTerms.arrangement}
              onValueChange={(value) => value && setBillingTerms(prev => ({ ...prev, arrangement: value as typeof prev.arrangement }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_ARRANGEMENTS.map(item => (
                  <SelectItem key={item} value={item}>{item.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Credit net days</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={billingTerms.netDays ?? 0}
              onChange={(e) => setBillingTerms(prev => ({ ...prev, netDays: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Deposit percent</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={billingTerms.depositPercent ?? 30}
              onChange={(e) => setBillingTerms(prev => ({ ...prev, depositPercent: Number(e.target.value) }))}
            />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            Acceptance creates a draft invoice only. Finance issues it separately from sending. Due dates come from these terms, not a hardcoded 30 days.
          </p>
        </CardContent>
      </Card>

      {/* Row 3: BOM Template Selector */}
      <BomTemplateSelector
        structureSize={dimensionsOfStructure}
        inventoryItems={inventoryItems}
        jobCategories={jobCategories}
        onApply={handleBomApply}
        onUnmatched={handleBomUnmatched}
      />

      {/* Row 4: Requisition Grid */}
      <div>
        <div className="mb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="size-4" />
            Inventory Requisition
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Add items by job category. Use the BOM template above for quick population, then adjust quantities and markups.
          </p>
        </div>
        <QuoteRequisitionGrid
          modelValue={requisitionSections}
          inventoryItems={inventoryItems}
          onUpdate={setRequisitionSections}
        />
      </div>

      {/* Row 5: Other Services Grid */}
      <div>
        <div className="mb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="size-4" />
            Other Services (Labor / Transport / Manual)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Non-inventory services. Totals are computed automatically from qty × unit price.
          </p>
        </div>
        <OtherServicesGrid
          modelValue={otherServices}
          onUpdate={setOtherServices}
        />
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Internal TWID costing — not shown to customers
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['labourEstimate', 'Labour'],
            ['transportEstimate', 'Transport'],
            ['subcontractorEstimate', 'Subcontractors'],
            ['otherDeliveryEstimate', 'Other delivery'],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                min="0"
                className="h-8 text-xs"
                value={internalCosting[key] ?? ''}
                onChange={(e) => setInternalCosting(prev => ({
                  ...prev,
                  [key]: e.target.value === '' ? undefined : Number(e.target.value),
                }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Row 6: Financial Summary */}
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardHeader className="pb-2 border-b bg-primary/5">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IRD charge to TWID</span>
              <span className="font-mono font-bold tabular-nums">${fmt(totals.totalIrdCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">TWID Markup</span>
              <span className="font-mono tabular-nums">${fmt(totals.totalMarkup)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Material purchase cost</span>
              <span className="font-mono tabular-nums">${fmt(totals.purchaseCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Other Services</span>
              <span className="font-mono tabular-nums">${fmt(totals.totalOtherServices)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">${fmt(totals.subtotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">Client discount</Label>
                <Select value={discountType} onValueChange={value => setDiscountType(value as 'NONE' | 'PERCENT' | 'FLAT')}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No discount</SelectItem>
                    <SelectItem value="PERCENT">Percentage</SelectItem>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{discountType === 'PERCENT' ? 'Percent' : 'Amount'}</Label>
                <Input
                  type="number"
                  min="0"
                  max={discountType === 'PERCENT' ? 100 : undefined}
                  className="h-8 text-xs"
                  disabled={discountType === 'NONE'}
                  value={discountType === 'NONE' ? '' : discountValue}
                  onChange={event => setDiscountValue(Number(event.target.value) || 0)}
                />
              </div>
            </div>
            {Number(totals.discountAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-mono tabular-nums">-${fmt(Number(totals.discountAmount))}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                VAT {vatEnabled ? `(${vatRate}%)` : '(Disabled)'}
              </span>
              <span className="font-mono tabular-nums">${fmt(totals.vatAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated TWID delivery costs</span>
              <span className="font-mono tabular-nums">${fmt(totals.deliveryCosts)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated TWID profit</span>
              <span className="font-mono tabular-nums">${fmt(Number(totals.estimatedProfit || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated TWID margin</span>
              <span className="font-mono tabular-nums">
                {totals.estimatedMargin == null ? 'n/a' : `${Math.round(Number(totals.estimatedMargin) * 100)}%`}
              </span>
            </div>
            {totals.missingCosts.length > 0 && (
              <p className="text-xs text-amber-700">Unknown delivery costs are not treated as zero.</p>
            )}
            <div className="border-t pt-3 flex justify-between text-lg font-black">
              <span>Grand Total</span>
              <span className="font-mono tabular-nums text-primary">${fmt(totals.grandTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
          {initialData ? 'Update Quotation' : 'Save Quotation'}
        </Button>
      </div>
    </div>
  )
}