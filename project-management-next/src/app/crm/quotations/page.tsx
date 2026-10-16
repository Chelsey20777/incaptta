'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCrmStore, isSequentialQuoteNumber } from '@/stores/crm-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { db } from '@/lib/firebase'
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, FileText, Download, Pencil, Trash, Hammer, Copy, Loader2, Send, CheckCircle, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import CrmDocumentWorkspace from '@/features/crm/components/CrmDocumentWorkspace'
import { generateCrmPdf } from '@/features/crm/utils/generateCrmPdf'
import type { CrmQuoteFormData, FirestoreQuote } from '@/features/crm/types'
import { calculateQuoteCommercials, customerFacingQuote, quoteCommercialFingerprint, reviewAfterCommercialEdit, stampRequisitionSections } from '@/lib/crm/quotation-commercial'
import { auth } from '@/lib/firebase'
import { resolveStaffName } from '@/lib/person-name'
import { resolvePdfSigner } from '@/lib/resolve-pdf-signer'

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T
  }
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue
      next[key] = stripUndefinedDeep(entry)
    }
    return next as T
  }
  return value
}

export default function QuotationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const crmStore = useCrmStore()
  const adminStore = useAdminStore()
  const { user } = useAuthStore()
  const inventoryStore = useInventoryStore()
  const jobCardsStore = useJobCardsStore()

  // ── View Mode State ──
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [editingQuote, setEditingQuote] = useState<FirestoreQuote | null>(null)
  const [saving, setSaving] = useState(false)
  const [creatingJobCard, setCreatingJobCard] = useState<string | null>(null)
  const [duplicatingQuote, setDuplicatingQuote] = useState<string | null>(null)
  // leadId context when navigated from Leads page
  const [leadContext, setLeadContext] = useState<any>(null)

  // ── List State ──
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const quotes = useMemo(() => crmStore.quotes || [], [crmStore.quotes])
  const loading = crmStore.loading

  // ── Data Initialisation ──
  useEffect(() => {
    const unsubCrm = crmStore.fetchAll()
    const unsubAdmin = adminStore.fetchAll()
    inventoryStore.fetchItems({ isActive: true })
    return () => {
      if (unsubCrm) unsubCrm()
      if (unsubAdmin) unsubAdmin()
    }
  }, [])

  // Assign QT-2000+ numbers to quotes that still use Firestore id prefixes / timestamps
  useEffect(() => {
    if (loading || quotes.length === 0) return
    const needsBackfill = quotes.some((q: any) => !isSequentialQuoteNumber(q.quoteNumber))
    if (!needsBackfill) return
    let cancelled = false
    ;(async () => {
      try {
        const count = await crmStore.backfillMissingQuoteNumbers()
        if (!cancelled && count > 0) {
          toast.success(`Assigned sequential quote numbers to ${count} quotation${count === 1 ? '' : 's'}`)
        }
      } catch (err) {
        console.error('Quote number backfill failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, quotes, crmStore])

  // ── Auto-open new quote form if redirected from Leads page ──
  useEffect(() => {
    const action = searchParams?.get('action')
    const from = searchParams?.get('from')
    if (action === 'new' && from === 'lead') {
      const ctx = sessionStorage.getItem('convertLeadToQuote')
      if (ctx) {
        try {
          const parsed = JSON.parse(ctx)
          setLeadContext(parsed)
          sessionStorage.removeItem('convertLeadToQuote')
          setEditingQuote(null)
          setIsCreateMode(true)
        } catch {}
      }
    }
  }, [searchParams])

  // ── Filtered Quotes ──
  const filteredQuotes = useMemo(() => {
    let result = quotes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (qt: any) =>
          qt.quoteNumber?.toLowerCase().includes(q) ||
          qt.customerName?.toLowerCase().includes(q) ||
          qt.customerEmail?.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'ALL') result = result.filter((qt: any) => qt.status === statusFilter)
    return result
  }, [quotes, searchQuery, statusFilter])

  const paginatedQuotes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredQuotes.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredQuotes, currentPage, itemsPerPage])

  const totalPages = Math.max(Math.ceil(filteredQuotes.length / itemsPerPage), 1)

  // ── Helpers ──
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
      SENT: 'border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      ACCEPTED: 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary',
      REJECTED: 'border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-400',
    }
    return (
      <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', styles[status] || styles.DRAFT)}>
        {status}
      </Badge>
    )
  }

  const quoteStats = useMemo(() => {
    const sent = quotes.filter((q: any) => q.status === 'SENT').length
    const accepted = quotes.filter((q: any) => q.status === 'ACCEPTED').length
    const conversion = quotes.length > 0 ? Math.round((accepted / quotes.length) * 100) : 0
    return { total: quotes.length, sent, accepted, conversion }
  }, [quotes])

  // ── Workspace Handlers ──
  const handleNewQuote = () => {
    setEditingQuote(null)
    setIsCreateMode(true)
  }

  const handleEditQuote = (quote: any) => {
    setEditingQuote(quote)
    setIsCreateMode(true)
  }

  const handleWorkspaceCancel = () => {
    setIsCreateMode(false)
    setEditingQuote(null)
  }

  const resolveCurrentUserName = useCallback(() => {
    const currentRow = (adminStore.users || []).find(
      (u: any) => u.id === user?.uid || u.uid === user?.uid,
    )
    return resolveStaffName({
      directoryUser: currentRow,
      authDisplayName: user?.displayName,
    })
  }, [adminStore.users, user?.displayName, user?.uid])

  /** Original quote creator only — never the current session user. */
  const resolveQuoteCreatorName = useCallback((quote?: FirestoreQuote | null) => {
    if (!quote?.createdBy && !quote?.createdByName) return ''
    const creatorRow = (adminStore.users || []).find(
      (u: any) => u.id === quote?.createdBy || u.uid === quote?.createdBy,
    )
    return resolveStaffName({
      directoryUser: creatorRow,
      storedName: quote?.createdByName,
    })
  }, [adminStore.users])

  const handleWorkspaceSave = async (formData: CrmQuoteFormData) => {
    setSaving(true)
    try {
      const requisitionSections = stampRequisitionSections(formData.requisitionSections || [])
      const vatEnabled = Boolean(adminStore.appSettings?.vatEnabled ?? true)
      const vatRate = Number(adminStore.appSettings?.vatRate ?? 15)
      const calculated = calculateQuoteCommercials({
        materials: requisitionSections.flatMap(section => section.items || []),
        services: formData.otherServices || [],
        vatEnabled,
        vatRate,
        internalCosting: formData.internalCosting,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
      })
      const flatItems = requisitionSections.flatMap(section =>
        (section.items || []).map(item => {
          const flatItem: Record<string, unknown> = {
            inventoryItemId: item.inventoryItemId || '',
            description: item.itemName,
            qty: item.qtyRequired,
            price: item.irdSellingPrice,
            markupPercent: item.markupPercent,
            costSnapshot: item.costSnapshot || 0,
            total: item.rowGrandTot,
            uom: item.uom || 'PCS',
          }
          if (item.id) flatItem.id = item.id
          if (item.priceOverride) flatItem.priceOverride = true
          return flatItem
        }),
      )
      const totalIrdCost = calculated.irdCharge
      const totalMarkup = calculated.twidMarkup
      const totalOtherServices = calculated.services
      const subtotal = calculated.subtotal
      const vatAmount = calculated.vatAmount
      const grandTotal = calculated.customerTotal

      const previousFingerprint = editingQuote
        ? quoteCommercialFingerprint(editingQuote)
        : ''
      const nextFingerprint = quoteCommercialFingerprint(formData)
      const wasApprovedOrSent = Boolean(
        editingQuote?.reviewStatus === 'APPROVED_TO_SEND' || editingQuote?.status === 'SENT' || editingQuote?.status === 'ACCEPTED'
      )
      const enrichedData: any = {
        ...stripUndefinedDeep({
          ...formData,
          requisitionSections,
          reviewStatus: reviewAfterCommercialEdit(editingQuote?.reviewStatus, wasApprovedOrSent && previousFingerprint !== nextFingerprint),
          commercialFingerprint: nextFingerprint,
          items: flatItems,
          summary: {
            totalIrdCost,
            totalMarkup,
            totalOtherServices,
            subtotal,
            discountType: calculated.discountType,
            discountValue: calculated.discountValue,
            discountAmount: calculated.discountAmount,
            netSubtotal: calculated.netSubtotal,
            vatRate,
            vatAmount,
          },
          grandTotal,
        }),
        updatedAt: serverTimestamp(),
      }

      // SENT / ACCEPTED must come from Mark sent / Accept APIs (invoice + job stub).
      if (enrichedData.status === 'SENT' || enrichedData.status === 'ACCEPTED') {
        const prior = editingQuote?.status || 'DRAFT'
        if (prior !== enrichedData.status) {
          enrichedData.status = prior === 'SENT' || prior === 'ACCEPTED' ? prior : 'DRAFT'
          toast.error('Use Mark sent / Accept on the quotations list. Saving cannot set Sent or Accepted.')
        }
      }

      if (!isSequentialQuoteNumber(enrichedData.quoteNumber)) {
        enrichedData.quoteNumber = await crmStore.generateQuoteNumber()
      }

      // Preserve/attach leadId context
      if (leadContext?.leadId) {
        enrichedData.leadId = leadContext.leadId
        enrichedData.leadName = leadContext.leadName || leadContext.customerName
        if (leadContext.customerId) {
          enrichedData.customerId = leadContext.customerId
        }
      } else if (editingQuote?.leadId) {
        enrichedData.leadId = editingQuote.leadId
        enrichedData.leadName = editingQuote.leadName
      }

      if (editingQuote?.id) {
        await updateDoc(doc(db, 'crmQuotes', editingQuote.id), enrichedData)
        toast.success('Quotation updated')
      } else {
        await crmStore.createQuote({
          ...enrichedData,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || '',
          createdByName: resolveCurrentUserName(),
        })
        toast.success('Quotation created')
      }
      setLeadContext(null)
      setIsCreateMode(false)
      setEditingQuote(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save quotation')
    } finally {
      setSaving(false)
    }
  }

  const postQuoteCommand = async (quoteId: string, path: 'review' | 'accept', body: Record<string, unknown>) => {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('Authentication required')
    const response = await fetch(`/api/crm/quotes/${encodeURIComponent(quoteId)}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Quotation command failed')
    return result
  }

  const handleQuoteReview = async (quote: FirestoreQuote, action: 'SUBMIT' | 'APPROVE_TO_SEND' | 'RECORD_SENT') => {
    if (!quote.id) return
    try {
      await postQuoteCommand(quote.id, 'review', {
        action,
        send: action === 'RECORD_SENT' ? { channel: 'email', recipient: quote.customerEmail } : undefined,
      })
      toast.success(
        action === 'SUBMIT' ? 'Submitted for manager review'
          : action === 'APPROVE_TO_SEND' ? 'Approved to send'
          : 'Recorded as sent'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review action failed')
    }
  }

  const handleAcceptQuote = async (quote: FirestoreQuote) => {
    if (!quote.id) return
    const acceptedBy = window.prompt('Accepting person (required)')
    if (!acceptedBy?.trim()) return
    try {
      const result = await postQuoteCommand(quote.id, 'accept', { acceptedBy: acceptedBy.trim() })
      toast.success(result.idempotent
        ? 'Acceptance already recorded — existing draft job and invoice reused'
        : result.invoiceCreated === false
          ? 'Accepted. Draft job linked; invoice already existed.'
          : 'Accepted. Draft job and draft invoice stub created.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acceptance failed')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quotation?')) return
    try {
      await deleteDoc(doc(db, 'crmQuotes', id))
      toast.success('Quotation deleted')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleDuplicate = async (quote: FirestoreQuote) => {
    if (!quote.id || duplicatingQuote) return

    setDuplicatingQuote(quote.id)
    try {
      await crmStore.duplicateQuote(quote.id, {
        createdBy: user?.uid || '',
        createdByName: resolveCurrentUserName(),
      })
      toast.success(`${quote.quoteNumber || 'Quotation'} duplicated as a new draft`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate quotation')
    } finally {
      setDuplicatingQuote(null)
    }
  }

  const handleCreateJobCard = async (quote: any) => {
    if (!confirm(`Create a Job Card from quote ${quote.quoteNumber}?`)) return
    setCreatingJobCard(quote.id)
    try {
      const jobCardData = {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        leadId: quote.leadId || null,
        leadName: quote.leadName || null,
        customerName: quote.customerName || '',
        customerEmail: quote.customerEmail || '',
        dimensionsOfStructure: quote.dimensionsOfStructure || '',
        requisitionSections: quote.requisitionSections || [],
        items: quote.items || [],
        otherServices: quote.otherServices || [],
        summary: quote.summary || {},
        grandTotal: quote.grandTotal || 0,
        notes: quote.notes || '',
        status: 'DRAFT',
      }
      const newJobId = await jobCardsStore.createJobCard(jobCardData)
      // Mark quote as having a linked job card
      await updateDoc(doc(db, 'crmQuotes', quote.id), {
        linkedJobCardId: newJobId,
        updatedAt: serverTimestamp(),
      })
      toast.success(`Draft job card created from ${quote.quoteNumber}. Acceptance still happens separately.`)
      router.push('/job-cards')
    } catch (err: any) {
      toast.error('Failed to create job card: ' + err.message)
    } finally {
      setCreatingJobCard(null)
    }
  }

  const handleGeneratePdf = async (quote: FirestoreQuote) => {
    try {
      toast.loading('Generating PDF...', { id: 'pdf-gen' })
      const signer = await resolvePdfSigner(quote.createdBy)
      const creatorName =
        resolveQuoteCreatorName(quote) || signer.name || ''
      await generateCrmPdf(
        {
          ...customerFacingQuote({
            ...quote,
            signatureUrl: signer.signatureUrl,
            position: signer.position,
          }),
        },
        'QUOTATION',
        adminStore.appSettings,
        adminStore.appSettings,
        creatorName,
        adminStore.jobCategories || [],
      )
      toast.success('PDF generated successfully', { id: 'pdf-gen' })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to generate PDF: ' + err.message, { id: 'pdf-gen' })
    }
  }


  // ── Flatten editing quote into form data ──
  const editingFormData = useMemo((): CrmQuoteFormData | null => {
    // If coming from leads page with lead context, pre-fill from lead
    if (!editingQuote && leadContext) {
      return {
        quoteNumber: '',
        customerId: leadContext.customerId || '',
        customerName: leadContext.customerName || '',
        customerEmail: leadContext.customerEmail || '',
        dimensionsOfStructure: '',
        status: 'DRAFT',
        validUntil: '',
        notes: `From lead: ${leadContext.leadName || leadContext.customerName}`,
        requisitionSections: [],
        otherServices: [],
        leadId: leadContext.leadId,
        leadName: leadContext.leadName,
      }
    }
    if (!editingQuote) return null
    return {
      quoteNumber: editingQuote.quoteNumber || '',
      customerId: editingQuote.customerId || '',
      customerName: editingQuote.customerName || '',
      customerEmail: editingQuote.customerEmail || '',
      dimensionsOfStructure: editingQuote.dimensionsOfStructure || '',
      status: editingQuote.status || 'DRAFT',
      validUntil: editingQuote.validUntil || '',
      notes: editingQuote.notes || '',
      requisitionSections: editingQuote.requisitionSections || [],
      otherServices: editingQuote.otherServices || [],
      discountType: editingQuote.summary?.discountType || 'NONE',
      discountValue: Number(editingQuote.summary?.discountValue) || 0,
      leadId: editingQuote.leadId,
      leadName: editingQuote.leadName,
    }
  }, [editingQuote, leadContext])

  // ── Workspace View ──
  if (isCreateMode) {
    return (
      <div className="space-y-4">
        <CrmDocumentWorkspace
          initialData={editingFormData}
          inventoryItems={inventoryStore.items || []}
          onSave={handleWorkspaceSave}
          onCancel={handleWorkspaceCancel}
          saving={saving}
        />
      </div>
    )
  }

  // ── List View ──
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-primary">Quotations</span>
          </h2>
          <p className="text-muted-foreground">Create and manage customer quotations</p>
        </div>
        <Button
          onClick={handleNewQuote}
          className="bg-brand-primary text-white hover:bg-brand-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" /> New Quotation
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {([
          { key: 'total', label: 'Total Quotes', badge: 'ALL', value: quoteStats.total, icon: FileText, iconCls: 'text-brand-primary', chip: 'bg-brand-primary/10', card: 'border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10', badgeCls: 'border-brand-primary/40 text-brand-primary', valueCls: 'text-foreground' },
          { key: 'sent', label: 'Sent', badge: 'OUT', value: quoteStats.sent, icon: Send, iconCls: 'text-blue-500', chip: 'bg-blue-500/10', card: 'border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10', badgeCls: 'border-blue-400/40 text-blue-600 dark:text-blue-400', valueCls: 'text-blue-600 dark:text-blue-400' },
          { key: 'accepted', label: 'Accepted', badge: 'WON', value: quoteStats.accepted, icon: CheckCircle, iconCls: 'text-emerald-500', chip: 'bg-emerald-500/10', card: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10', badgeCls: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400', valueCls: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'rate', label: 'Conversion Rate', badge: 'RATE', value: `${quoteStats.conversion}%`, icon: Percent, iconCls: 'text-brand-secondary', chip: 'bg-brand-secondary/10', card: 'border-brand-secondary/20 bg-brand-secondary/5 dark:bg-brand-secondary/10', badgeCls: 'border-brand-secondary/40 text-brand-secondary', valueCls: 'text-brand-secondary' },
        ] as const).map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.key} className={cn('relative overflow-hidden shadow-sm', s.card)}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('p-2 rounded-lg', s.chip)}>
                    <Icon className={cn('size-4', s.iconCls)} />
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-bold bg-transparent', s.badgeCls)}>{s.badge}</Badge>
                </div>
                <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', s.valueCls)}>
                  {loading ? <Skeleton className="h-8 w-16" /> : s.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotations..."
            className="pl-8 focus-visible:border-brand-primary focus-visible:ring-brand-primary/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border-brand-primary/15 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-brand-primary/5 dark:bg-brand-primary/10">
                  <th className="text-left p-3 font-medium text-sm text-brand-primary">Quote #</th>
                  <th className="text-left p-3 font-medium text-sm">Customer</th>
                  <th className="text-right p-3 font-medium text-sm">Total</th>
                  <th className="text-center p-3 font-medium text-sm">Status</th>
                  <th className="text-center p-3 font-medium text-sm">Linked</th>
                  <th className="text-center p-3 font-medium text-sm">Date</th>
                  <th className="text-left p-3 font-medium text-sm">Created by</th>
                  <th className="text-right p-3 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center p-8 text-muted-foreground">
                      No quotations found
                    </td>
                  </tr>
                ) : (
                  paginatedQuotes.map((quote: any) => (
                    <tr key={quote.id} className="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors">
                      <td className="p-3 text-sm font-mono font-semibold text-brand-primary">
                        <div>{quote.quoteNumber || quote.id?.substring(0, 8)}</div>
                        {quote.leadId && (
                          <div className="text-[10px] text-purple-400 mt-0.5">📋 Lead linked</div>
                        )}
                      </td>
                      <td className="p-3 text-sm">{quote.customerName || 'N/A'}</td>
                      <td className="p-3 text-sm text-right font-mono">
                        ${(quote.grandTotal || quote.total || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="space-y-1">
                          {getStatusBadge(quote.status)}
                          {quote.reviewStatus && (
                            <div className="text-[10px] text-muted-foreground">{String(quote.reviewStatus).replace(/_/g, ' ')}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {quote.linkedJobCardId ? (
                          <span className="text-[10px] text-amber-400 font-medium">🔨 Job Card</span>
                        ) : quote.status === 'ACCEPTED' && quote.linkedInvoiceId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                            disabled={creatingJobCard === quote.id}
                            onClick={() => handleCreateJobCard(quote)}
                          >
                            <Hammer className="h-3 w-3 mr-1" />
                            {creatingJobCard === quote.id ? 'Creating...' : 'Job Card'}
                          </Button>
                        ) : quote.status === 'ACCEPTED' && !quote.linkedInvoiceId ? (
                          <span className="text-[10px] text-destructive font-medium">Needs Accept</span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-center text-sm text-muted-foreground">
                        {quote.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                      </td>
                      <td className="p-3 text-left text-sm text-muted-foreground">
                        {resolveQuoteCreatorName(quote) || '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGeneratePdf(quote)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {(!quote.reviewStatus || quote.reviewStatus === 'DRAFT' || quote.reviewStatus === 'CHANGES_REQUIRED') && quote.status === 'DRAFT' && (
                            <Button variant="ghost" size="sm" title="Submit for manager review" onClick={() => handleQuoteReview(quote, 'SUBMIT')}>
                              Submit
                            </Button>
                          )}
                          {quote.reviewStatus === 'PENDING_MANAGER' && (
                            <Button variant="ghost" size="sm" title="Approve to send" onClick={() => handleQuoteReview(quote, 'APPROVE_TO_SEND')}>
                              Approve
                            </Button>
                          )}
                          {quote.reviewStatus === 'APPROVED_TO_SEND' && quote.status !== 'SENT' && quote.status !== 'ACCEPTED' && (
                            <Button variant="ghost" size="sm" title="Record as sent" onClick={() => handleQuoteReview(quote, 'RECORD_SENT')}>
                              Mark sent
                            </Button>
                          )}
                          {((quote.status === 'SENT' || quote.reviewStatus === 'APPROVED_TO_SEND') && quote.status !== 'ACCEPTED') ||
                          (quote.status === 'ACCEPTED' && !quote.linkedInvoiceId) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title={quote.linkedInvoiceId ? 'Record customer acceptance' : 'Complete acceptance — create missing draft invoice'}
                              onClick={() => handleAcceptQuote(quote)}
                            >
                              {quote.status === 'ACCEPTED' && !quote.linkedInvoiceId ? 'Fix Accept' : 'Accept'}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleEditQuote(quote)}
                            title="Edit quotation"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={duplicatingQuote !== null}
                            onClick={() => handleDuplicate(quote)}
                            title="Duplicate quotation"
                          >
                            {duplicatingQuote === quote.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500"
                            onClick={() => handleDelete(quote.id)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!loading && filteredQuotes.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>
              {' '}to{' '}
              <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredQuotes.length)}</span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{filteredQuotes.length}</span>
              {' '}quotations
            </div>

            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="bg-background border border-muted rounded text-xs px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer text-foreground font-medium"
                >
                  <option value={20}>20 per view</option>
                  <option value={50}>50 per view</option>
                  <option value={100}>100 per view</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                >
                  &laquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  title="Previous Page"
                >
                  &lsaquo;
                </Button>
                
                <span className="text-xs font-medium px-2">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  title="Next Page"
                >
                  &rsaquo;
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                >
                  &raquo;
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}