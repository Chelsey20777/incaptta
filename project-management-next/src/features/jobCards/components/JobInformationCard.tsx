'use client'

import React, { useEffect, useMemo } from 'react'
import { Loader2, RefreshCw, Link2, Receipt } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAdminStore } from '@/stores/admin-store'
import { useCrmStore } from '@/stores/crm-store'
import { STRUCTURE_SIZES } from '../constants/bomTemplates'
import type { JobInfo } from '../types'

function looksLikeFirestoreId(value: string) {
  const v = String(value || '').trim()
  return /^[A-Za-z0-9]{16,}$/.test(v) && !/\s/.test(v)
}

interface JobInformationCardProps {
  modelValue: JobInfo
  isGenerating?: boolean
  generationFailed?: boolean
  onUpdate: (info: JobInfo) => void
  onRetryJobNumber: () => void
}

export default function JobInformationCard({
  modelValue,
  isGenerating = false,
  generationFailed = false,
  onUpdate,
  onRetryJobNumber,
}: JobInformationCardProps) {
  const adminStore = useAdminStore()
  const crmStore = useCrmStore()

  useEffect(() => {
    adminStore.fetchAll()
    crmStore.fetchCustomers()
    crmStore.fetchInvoices()
  }, [])

  const updateField = (field: keyof JobInfo, value: any) => {
    onUpdate({ ...modelValue, [field]: value })
  }

  const handleCustomerSelect = (customerId: string) => {
    const customer = crmStore.customers.find((c: any) => c.id === customerId)
    if (customer) {
      onUpdate({
        ...modelValue,
        customerId: customer.id,
        recipientName: customer.name || customer.company || '',
        recipientAddress: customer.address || 'N/A',
        recipientPhone: customer.phone || 'N/A',
      })
    }
  }

  const crmDocuments = useMemo(() => {
    return (crmStore.invoices || []).map((i: any) => ({
      id: i.id,
      type: 'INVOICE' as const,
      ref: String(i.invoiceNumber || '').trim() || `INV-${String(i.id || '').slice(-6).toUpperCase()}`,
      customer: i.customerName || '',
      total: Number(i.grandTotal || i.amount || 0),
      customerId: i.customerId,
    }))
  }, [crmStore.invoices])

  const handleCrmSelect = (docId: string) => {
    const selectedDoc = crmDocuments.find(d => d.id === docId)
    if (selectedDoc) {
      const customer = crmStore.customers.find((c: any) => c.id === selectedDoc.customerId)
      onUpdate({
        ...modelValue,
        customerId: selectedDoc.customerId || modelValue.customerId || '',
        linkedCrmId: selectedDoc.id,
        linkedCrmType: 'INVOICE',
        linkedCrmNumber: selectedDoc.ref,
        linkedCrmTotal: selectedDoc.total,
        recipientName: customer?.name || customer?.company || selectedDoc.customer || modelValue.recipientName,
        recipientAddress: customer?.address || modelValue.recipientAddress || 'N/A',
        recipientPhone: customer?.phone || modelValue.recipientPhone || 'N/A',
      })
    }
  }

  const linkedIsQuote = modelValue.linkedCrmType === 'QUOTE'
  const currentCrmLink = useMemo(() => {
    if (!modelValue.linkedCrmId || linkedIsQuote) return null
    return crmDocuments.find(d => d.id === modelValue.linkedCrmId) || null
  }, [modelValue.linkedCrmId, crmDocuments, linkedIsQuote])

  const selectedCustomerName = useMemo(() => {
    if (modelValue.customerId) {
      const customer = (crmStore.customers || []).find((c: any) => c.id === modelValue.customerId)
      const fromStore = customer?.name || customer?.company
      if (fromStore) return fromStore
    }
    const legacy = String(modelValue.recipientName || '').trim()
    if (legacy && legacy !== 'N/A' && !looksLikeFirestoreId(legacy)) return legacy
    return null
  }, [modelValue.customerId, modelValue.recipientName, crmStore.customers])

  const selectedDeptName = useMemo(() => {
    if (!modelValue.requestingDepartmentId) return null
    const dept = (adminStore.departments || []).find((d: any) => d.id === modelValue.requestingDepartmentId)
    return dept?.name || modelValue.requestingDepartmentId
  }, [modelValue.requestingDepartmentId, adminStore.departments])

  const selectedCategoryName = useMemo(() => {
    if (!modelValue.jobCategoryId) return null
    const cat = (adminStore.jobCategories || []).find((c: any) => c.id === modelValue.jobCategoryId)
    const raw = cat?.name || modelValue.jobCategoryId
    return raw
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }, [modelValue.jobCategoryId, adminStore.jobCategories])

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Card className="bg-card/90 dark:bg-card/90 backdrop-blur-lg border border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
      <CardHeader className="bg-brand-primary/5 border-b border-brand-primary/10 py-6">
        <CardTitle className="text-2xl font-bold text-brand-primary dark:text-white">
          Job Information
        </CardTitle>
        <CardDescription className="text-foreground/60 dark:text-white/60">
          Enter the primary details for this job card assignment.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="md:col-span-2 lg:col-span-3 space-y-2">
            <Label htmlFor="jobCardTitle" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Job Card Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="jobCardTitle"
              value={modelValue.jobCardTitle}
              onChange={(e) => updateField('jobCardTitle', e.target.value)}
              placeholder="e.g. Server Room Aircon Installation"
              className="text-sm bg-background/50 border-brand-primary/20 focus:border-brand-primary focus:ring-brand-primary/20"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-1 space-y-2">
            <Label htmlFor="crmLink" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80 flex items-center gap-2">
              <Link2 className="size-3" />
              Link Invoice (Optional)
            </Label>
            <Select
              value={currentCrmLink?.id || ''}
              onValueChange={(v) => { if (v) handleCrmSelect(v) }}
            >
              <SelectTrigger id="crmLink" className="text-sm bg-background/50 border-brand-primary/20 dark:bg-white/[0.06] dark:border-white/10">
                {currentCrmLink ? (
                  <span className="flex flex-1 text-left items-center gap-2 truncate">
                    <Receipt className="size-3.5 text-emerald-500 shrink-0" />
                    <span className="font-semibold">{currentCrmLink.ref}</span>
                    <span className="text-brand-primary font-bold tabular-nums">{formatCurrency(currentCrmLink.total)}</span>
                  </span>
                ) : (
                  <SelectValue placeholder="Select Invoice..." />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {crmDocuments.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No invoices found
                  </div>
                )}
                {crmDocuments.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id} className="py-2.5 px-2">
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex items-center justify-center size-7 rounded-md shrink-0 bg-emerald-500/10 dark:bg-emerald-500/20">
                        <Receipt className="size-3.5 text-emerald-500" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs truncate">{doc.ref}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{doc.customer}</span>
                      </div>
                      <span className="text-xs font-bold text-brand-primary ml-auto tabular-nums shrink-0">
                        {formatCurrency(doc.total)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentCrmLink && (
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="text-[9px] uppercase font-bold bg-brand-primary/5 border-brand-primary/20 text-brand-primary">
                  INVOICE: {currentCrmLink.ref}
                </Badge>
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                  {formatCurrency(currentCrmLink.total)}
                </span>
              </div>
            )}
            {linkedIsQuote && (
              <p className="text-[10px] text-amber-600">
                This job was linked to a quote. Select an invoice to replace that link.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="department" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Requesting Department <span className="text-destructive">*</span>
            </Label>
            <Select value={modelValue.requestingDepartmentId} onValueChange={(v) => updateField('requestingDepartmentId', v)}>
              <SelectTrigger id="department" className="text-sm bg-background/50 border-brand-primary/20 dark:bg-white/[0.06] dark:border-white/10">
                {selectedDeptName ? (
                  <span className="flex flex-1 text-left truncate">{selectedDeptName}</span>
                ) : (
                  <SelectValue placeholder="Select Department" />
                )}
              </SelectTrigger>
              <SelectContent>
                {(adminStore.departments || []).map((dept: any) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobCategory" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Job Category <span className="text-destructive">*</span>
            </Label>
            <Select value={modelValue.jobCategoryId} onValueChange={(v) => updateField('jobCategoryId', v)}>
              <SelectTrigger id="jobCategory" className="text-sm bg-background/50 border-brand-primary/20 dark:bg-white/[0.06] dark:border-white/10">
                {selectedCategoryName ? (
                  <span className="flex flex-1 text-left truncate">{selectedCategoryName}</span>
                ) : (
                  <SelectValue placeholder="Select Category" />
                )}
              </SelectTrigger>
              <SelectContent>
                {(adminStore.jobCategories || []).map((cat: any) => {
                  const displayName = (cat.name || cat.id)
                    .replace(/_/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, (c: string) => c.toUpperCase())
                  return (
                    <SelectItem key={cat.id} value={cat.id}>
                      {displayName}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobNumber" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Job Number (Reference) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="jobNumber"
                value={modelValue.jobNumber}
                onChange={(e) => updateField('jobNumber', e.target.value)}
                placeholder={isGenerating ? 'Generating...' : 'Auto-generated or Manual Ref'}
                className={`text-sm pr-10 bg-background/50 border-brand-primary/20 ${
                  generationFailed && !modelValue.jobNumber ? 'border-destructive ring-1 ring-destructive/40' : ''
                }`}
                disabled={isGenerating}
              />
              {isGenerating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="size-4 animate-spin text-brand-primary" />
                </div>
              )}
              {!isGenerating && generationFailed && !modelValue.jobNumber && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-destructive hover:text-destructive/80"
                  type="button"
                  onClick={onRetryJobNumber}
                >
                  <RefreshCw className="size-3" /> Retry
                </button>
              )}
            </div>
            {generationFailed && !modelValue.jobNumber && (
              <p className="text-[10px] text-destructive">
                Auto-generation failed. Click Retry or type a reference manually.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Start Date
            </Label>
            <Input
              id="startDate"
              type="date"
              value={modelValue.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              className="text-sm bg-background/50 border-brand-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectLocation" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Project Location
            </Label>
            <Input
              id="projectLocation"
              value={modelValue.projectLocation}
              onChange={(e) => updateField('projectLocation', e.target.value)}
              placeholder="e.g. Site Name or Address"
              className="text-sm bg-background/50 border-brand-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dimensions" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Dimensions of Structure
            </Label>
            <Select value={modelValue.dimensionsOfStructure} onValueChange={(v) => updateField('dimensionsOfStructure', v)}>
              <SelectTrigger id="dimensions" className="text-sm bg-background/50 border-brand-primary/20 dark:bg-white/[0.06] dark:border-white/10">
                <SelectValue placeholder="Select structure size" />
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

          <div className="space-y-2">
            <Label htmlFor="recipientName" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Recipient Name
            </Label>
            <Select value={modelValue.customerId || ''} onValueChange={(v) => { if (v) handleCustomerSelect(v) }}>
              <SelectTrigger id="recipientName" className="text-sm bg-background/50 border-brand-primary/20 dark:bg-white/[0.06] dark:border-white/10">
                {selectedCustomerName ? (
                  <span className="flex flex-1 text-left truncate">{selectedCustomerName}</span>
                ) : (
                  <SelectValue placeholder="Select Recipient (Customer)" />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {(crmStore.customers || []).map((customer: any) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name || customer.company || customer.id}{customer.status && customer.status !== 'ACTIVE' ? ` (${customer.status})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!modelValue.customerId && modelValue.recipientName && modelValue.recipientName !== 'N/A' && !looksLikeFirestoreId(modelValue.recipientName) && (
              <p className="text-xs text-amber-600">Legacy name: {modelValue.recipientName}. Select a customer to link this job card by ID.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipientPhone" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Recipient Phone
            </Label>
            <Input
              id="recipientPhone"
              value={modelValue.recipientPhone ?? ''}
              readOnly
              placeholder="Auto-populated from CRM"
              className="text-sm bg-muted/20 border-dashed border-brand-primary/20"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3 space-y-2">
            <Label htmlFor="recipientAddress" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Recipient Address
            </Label>
            <Input
              id="recipientAddress"
              value={modelValue.recipientAddress ?? ''}
              readOnly
              placeholder="Auto-populated from CRM"
              className="text-sm bg-muted/20 border-dashed border-brand-primary/20"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3 space-y-2">
            <Label htmlFor="projectDescription" className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-primary/80">
              Detailed Project Description
            </Label>
            <Textarea
              id="projectDescription"
              value={modelValue.projectDescription}
              onChange={(e) => updateField('projectDescription', e.target.value)}
              placeholder="Provide a comprehensive overview of the job, requirements, or scope..."
              className="text-sm min-h-[120px] resize-y bg-background/50 border-brand-primary/20 focus:border-brand-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
