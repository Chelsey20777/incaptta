'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useCrmStore, isSequentialInvoiceNumber } from '@/stores/crm-store'
import { useAdminStore } from '@/stores/admin-store'
import { useAuthStore } from '@/stores/auth-store'
import { generateCrmPdf } from '@/features/crm/utils/generateCrmPdf'
import { hydrateInvoiceFromQuote } from '@/features/crm/utils/hydrateInvoiceFromQuote'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Download, Loader2, Pencil, DollarSign, FileText, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { resolveStaffName } from '@/lib/person-name'
import { resolvePdfSigner } from '@/lib/resolve-pdf-signer'
import { canIssueInvoice, canSendInvoice, issueInvoiceFields, resolveBillingTerms, sendInvoiceFields } from '@/lib/crm/billing-terms'
import { resolveDocumentDiscount } from '@/lib/crm/quotation-commercial'

function customerLabel(customer: any, fallbackName?: string) {
  const label = [
    customer?.name,
    customer?.company,
    customer?.companyName,
    customer?.primaryContactName,
    fallbackName,
    customer?.email,
  ].find((value) => typeof value === 'string' && value.trim() && !/^[A-Za-z0-9]{12,}$/.test(value.trim()))
  return label?.trim() || 'Unnamed customer'
}

export default function InvoicesPage() {
  const { customers, invoices, fetchCustomers, fetchInvoices, loading, createInvoice, updateInvoice, recordInvoicePayment, generateInvoiceNumber, backfillMissingInvoiceNumbers } = useCrmStore()
  const adminStore = useAdminStore()
  const authStore = useAuthStore()
  const { user } = authStore
  const canOverrideCredit = authStore.isSuperAdmin() || authStore.hasRole('ADMIN' as any)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter])

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<any>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [paymentData, setPaymentData] = useState({ amount: 0, method: 'CASH', reference: '', date: new Date().toISOString().split('T')[0] })
  const [formData, setFormData] = useState<any>({
    invoiceNumber: '',
    customerId: '',
    customerName: '',
    customerEmail: '',
    status: 'DRAFT',
    amount: 0,
    amountPaid: 0,
    balance: 0,
    dueDate: '',
    notes: '',
    discountType: 'NONE',
    discountValue: 0,
  })

  useEffect(() => {
    const unsub = fetchInvoices()
    const unsubCustomers = fetchCustomers()
    adminStore.fetchAll()
    return () => {
      if (unsub) unsub()
      if (unsubCustomers) unsubCustomers()
    }
  }, [])

  useEffect(() => {
    if (loading || invoices.length === 0) return
    const needsBackfill = invoices.some((inv: any) => !isSequentialInvoiceNumber(inv.invoiceNumber))
    if (!needsBackfill) return
    let cancelled = false
    ;(async () => {
      try {
        const count = await backfillMissingInvoiceNumbers()
        if (!cancelled && count > 0) {
          toast.success(`Assigned sequential invoice numbers to ${count} invoice${count === 1 ? '' : 's'}`)
        }
      } catch (err) {
        console.error('Invoice number backfill failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loading, invoices, backfillMissingInvoiceNumbers])

  const filteredInvoices = useMemo(() => {
    let result = invoices
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((inv: any) =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.customerName?.toLowerCase().includes(q) ||
        inv.customerEmail?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'ALL') result = result.filter((inv: any) => inv.status === statusFilter)
    return result
  }, [invoices, searchQuery, statusFilter])

  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredInvoices.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredInvoices, currentPage, itemsPerPage])

  const totalPages = Math.max(Math.ceil(filteredInvoices.length / itemsPerPage), 1)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
      ISSUED: 'border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      SENT: 'border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      PAID: 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary',
      OVERDUE: 'border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-400',
      CANCELLED: 'border-slate-400/40 bg-slate-500/10 text-slate-500',
    }
    return (
      <Badge variant="outline" className={cn('text-[10px] font-bold uppercase', styles[status] || styles.DRAFT)}>
        {status}
      </Badge>
    )
  }

  const stats = useMemo(() => ({
    total: invoices.length,
    issued: invoices.filter((i: any) => i.status === 'ISSUED').length,
    sent: invoices.filter((i: any) => i.status === 'SENT').length,
    paid: invoices.filter((i: any) => i.status === 'PAID').length,
    overdue: invoices.filter((i: any) => i.status === 'OVERDUE').length,
    outstandingTotal: invoices.reduce((s: number, i: any) => s + ((i.amount || 0) - (i.amountPaid || 0)), 0),
    collectedTotal: invoices.filter((i: any) => i.status === 'PAID').reduce((s: number, i: any) => s + (i.amount || 0), 0),
  }), [invoices])

  const openNewInvoice = () => {
    setEditingInvoice(null)
    setFormData({
      invoiceNumber: '',
      customerId: '',
      customerName: '',
      customerEmail: '',
      status: 'DRAFT',
      amount: 0,
      amountPaid: 0,
      balance: 0,
      dueDate: '',
      notes: '',
      discountType: 'NONE',
      discountValue: 0,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.customerId && formData.status !== 'DRAFT') {
      toast.error('Select a customer before issuing this invoice')
      return
    }
    if (formData.status === 'SENT' && !canSendInvoice(formData.status) && formData.status !== 'SENT') {
      toast.error('Issue the invoice before sending it')
      return
    }
    setSaving(true)
    try {
      const listAmount = Number(formData.amount) || 0
      const discount = resolveDocumentDiscount(listAmount, {
        type: formData.discountType,
        value: formData.discountValue,
      })
      const payload = {
        ...formData,
        listAmount,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        discountAmount: discount.discountAmount,
        amount: discount.netSubtotal,
        grandTotal: discount.netSubtotal,
        summary: {
          ...(formData.summary || {}),
          subtotal: listAmount,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountAmount: discount.discountAmount,
          netSubtotal: discount.netSubtotal,
        },
        balance: discount.netSubtotal - (Number(formData.amountPaid) || 0),
      }
      if (editingInvoice) {
        if (!isSequentialInvoiceNumber(payload.invoiceNumber)) {
          payload.invoiceNumber = await generateInvoiceNumber()
        }
        const { createdBy: _cb, createdByName: _cbn, id: _id, ...updatePayload } = payload
        try {
          await updateInvoice(editingInvoice.id, updatePayload)
        } catch (error: any) {
          if (error.code !== 'CREDIT_LIMIT_EXCEEDED' || !canOverrideCredit) throw error
          const reason = window.prompt(`${error.message}. Enter an administrator override reason:`)?.trim()
          if (!reason) throw error
          await updateInvoice(editingInvoice.id, updatePayload, { overrideCreditLimit: true, overrideReason: reason })
        }
        toast.success('Invoice updated')
      } else {
        const createPayload = {
          ...payload,
          createdBy: user?.uid || '',
          createdByName: resolveStaffName({
            directoryUser: (adminStore.users || []).find((u: any) => u.id === user?.uid || u.uid === user?.uid),
            authDisplayName: user?.displayName,
          }),
        }
        try {
          await createInvoice(createPayload)
        } catch (error: any) {
          if (error.code !== 'CREDIT_LIMIT_EXCEEDED' || !canOverrideCredit) throw error
          const reason = window.prompt(`${error.message}. Enter an administrator override reason:`)?.trim()
          if (!reason) throw error
          await createInvoice(createPayload, { overrideCreditLimit: true, overrideReason: reason })
        }
        toast.success('Invoice created')
      }
      setIsDialogOpen(false)
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const persistInvoice = async (invoice: any, patch: Record<string, unknown>) => {
    const { createdBy: _cb, createdByName: _cbn, id: _id, ...base } = invoice
    await updateInvoice(invoice.id, { ...base, ...patch })
  }

  const handleIssue = async (invoice: any) => {
    if (!canIssueInvoice(invoice.status, invoice.issuable !== false)) {
      toast.error(invoice.billingHoldReason || 'This draft is held until its billing trigger')
      return
    }
    setSaving(true)
    try {
      const terms = resolveBillingTerms(invoice.billingTerms || (adminStore.appSettings as any)?.billingTerms)
      await persistInvoice(invoice, issueInvoiceFields(terms, invoice.issuedOn || undefined))
      toast.success('Invoice issued. Sending is a separate step. Due date comes from the agreed terms.')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async (invoice: any) => {
    if (!canSendInvoice(invoice.status)) {
      toast.error('Issue the invoice before sending it')
      return
    }
    setSaving(true)
    try {
      await persistInvoice(invoice, sendInvoiceFields())
      toast.success('Invoice marked sent')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return
    setSaving(true)
    try {
      await recordInvoicePayment(selectedInvoice.id, paymentData)
      toast.success('Payment recorded')
      setIsPaymentDialogOpen(false)
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleGeneratePdf = async (invoice: any) => {
    try {
      toast.loading('Generating PDF...', { id: 'pdf-gen' })
      const creatorRow = (adminStore.users || []).find(
        (u: any) => u.id === invoice?.createdBy || u.uid === invoice?.createdBy,
      )
      const currentRow = (adminStore.users || []).find(
        (u: any) => u.id === user?.uid || u.uid === user?.uid,
      )
      const signer = await resolvePdfSigner(invoice?.createdBy)
      const creatorName =
        resolveStaffName({
          directoryUser: creatorRow || currentRow,
          authDisplayName: user?.displayName,
          storedName: invoice.createdByName,
        }) ||
        signer.name ||
        ''
      const pdfInvoice = await hydrateInvoiceFromQuote(invoice)
      await generateCrmPdf(
        {
          ...pdfInvoice,
          signatureUrl: signer.signatureUrl,
          position: signer.position,
        },
        'INVOICE',
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            <span className="text-brand-primary">Invoices</span>
          </h2>
          <p className="text-muted-foreground">Manage invoices and payment receipts</p>
        </div>
        <Button onClick={openNewInvoice} className="bg-brand-primary text-white hover:bg-brand-primary/90">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {([
          { key: 'total', label: 'Total Invoices', badge: 'ALL', value: stats.total, icon: FileText, iconCls: 'text-brand-primary', chip: 'bg-brand-primary/10', card: 'border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10', badgeCls: 'border-brand-primary/40 text-brand-primary', valueCls: 'text-foreground' },
          { key: 'out', label: 'Outstanding', badge: 'DUE', value: `$${stats.outstandingTotal.toLocaleString()}`, icon: DollarSign, iconCls: 'text-amber-500', chip: 'bg-amber-500/10', card: 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10', badgeCls: 'border-amber-400/40 text-amber-600 dark:text-amber-400', valueCls: 'text-amber-600 dark:text-amber-400' },
          { key: 'paid', label: 'Collected', badge: 'PAID', value: `$${stats.collectedTotal.toLocaleString()}`, icon: CheckCircle, iconCls: 'text-emerald-500', chip: 'bg-emerald-500/10', card: 'border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10', badgeCls: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400', valueCls: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'over', label: 'Overdue', badge: 'ALERT', value: stats.overdue, icon: AlertTriangle, iconCls: 'text-brand-secondary', chip: 'bg-brand-secondary/10', card: 'border-brand-secondary/20 bg-brand-secondary/5 dark:bg-brand-secondary/10', badgeCls: 'border-brand-secondary/40 text-brand-secondary', valueCls: 'text-brand-secondary' },
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
            placeholder="Search invoices..."
            className="pl-8 focus-visible:border-brand-primary focus-visible:ring-brand-primary/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ISSUED">Issued</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border-brand-primary/15 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-brand-primary/5 dark:bg-brand-primary/10">
                  <th className="text-left p-3 font-medium text-sm text-brand-primary">Invoice #</th>
                  <th className="text-left p-3 font-medium text-sm">Customer</th>
                  <th className="text-right p-3 font-medium text-sm">Amount</th>
                  <th className="text-right p-3 font-medium text-sm">Paid</th>
                  <th className="text-right p-3 font-medium text-sm">Balance</th>
                  <th className="text-center p-3 font-medium text-sm">Status</th>
                  <th className="text-center p-3 font-medium text-sm">Due</th>
                  <th className="text-right p-3 font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (<td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>))}
                    </tr>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">No invoices found</td></tr>
                ) : (
                  paginatedInvoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors">
                      <td className="p-3 text-sm font-mono font-semibold text-brand-primary">{inv.invoiceNumber || inv.id.substring(0, 8)}</td>
                      <td className="p-3 text-sm">{inv.customerName || 'N/A'}</td>
                      <td className="p-3 text-sm text-right">${(inv.amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-sm text-right">${(inv.amountPaid || 0).toFixed(2)}</td>
                      <td className="p-3 text-sm text-right font-mono">${((inv.amount || 0) - (inv.amountPaid || 0)).toFixed(2)}</td>
                      <td className="p-3 text-center">{getStatusBadge(inv.status)}</td>
                      <td className="p-3 text-center text-sm">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleGeneratePdf(inv)} title="Download PDF"><Download className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" title="Record Payment"
                            onClick={() => { setSelectedInvoice(inv); setPaymentData({ amount: (inv.amount || 0) - (inv.amountPaid || 0), method: 'CASH', reference: '', date: new Date().toISOString().split('T')[0] }); setIsPaymentDialogOpen(true) }}>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                          </Button>
                          {inv.status === 'DRAFT' && (
                            <Button variant="ghost" size="sm" title="Issue" onClick={() => handleIssue(inv)}>
                              Issue
                            </Button>
                          )}
                          {inv.status === 'ISSUED' && (
                            <Button variant="ghost" size="sm" title="Send" onClick={() => handleSend(inv)}>
                              Send
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { setEditingInvoice(inv); setFormData({ ...inv, amount: inv.listAmount ?? inv.amount, discountType: inv.discountType || inv.summary?.discountType || 'NONE', discountValue: inv.discountValue ?? inv.summary?.discountValue ?? 0 }); setIsDialogOpen(true) }}><Pencil className="h-4 w-4" /></Button>
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

      {!loading && filteredInvoices.length > 0 && (
        <Card className="bg-muted/5 dark:bg-card/10 border-muted">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center sm:text-left">
              Showing{' '}
              <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span>
              {' '}to{' '}
              <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredInvoices.length)}</span>
              {' '}of{' '}
              <span className="font-bold text-foreground">{filteredInvoices.length}</span>
              {' '}invoices
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingInvoice ? 'Edit Invoice' : 'New Invoice'}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={formData.invoiceNumber || (editingInvoice ? '' : 'INV-#### (auto on save)')}
                disabled
                className="font-mono text-brand-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer {formData.status === 'DRAFT' ? '' : '*'}</Label>
                <Select
                  value={formData.customerId || ''}
                  onValueChange={(value) => {
                    const customer = customers.find((item: any) => item.id === value)
                    setFormData((previous: any) => ({
                      ...previous,
                      customerId: value,
                      customerName: customerLabel(customer),
                      customerEmail: customer?.email || '',
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer">
                      {formData.customerId
                        ? (customerLabel(
                            customers.find((item: any) => item.id === formData.customerId),
                            formData.customerName,
                          ))
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formData.customerId && !customers.some((item: any) => item.id === formData.customerId) && (
                      <SelectItem value={formData.customerId}>
                        {customerLabel(null, formData.customerName)}
                      </SelectItem>
                    )}
                    {customers.map((customer: any) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customerLabel(customer)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Customer Email</Label><Input type="email" value={formData.customerEmail} onChange={(e) => setFormData((p: any) => ({ ...p, customerEmail: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount before discount</Label><Input type="number" value={formData.amount} onChange={(e) => setFormData((p: any) => ({ ...p, amount: Number(e.target.value) }))} /></div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={formData.dueDate} onChange={(e) => setFormData((p: any) => ({ ...p, dueDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client discount</Label>
                <Select value={formData.discountType || 'NONE'} onValueChange={(value) => setFormData((p: any) => ({ ...p, discountType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No discount</SelectItem>
                    <SelectItem value="PERCENT">Percentage</SelectItem>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{formData.discountType === 'PERCENT' ? 'Discount percent' : 'Discount amount'}</Label>
                <Input type="number" min="0" disabled={(formData.discountType || 'NONE') === 'NONE'} value={formData.discountValue || 0} onChange={(e) => setFormData((p: any) => ({ ...p, discountValue: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => v && setFormData((p: any) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData((p: any) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary text-white hover:bg-brand-primary/90">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingInvoice ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <p>Invoice: <strong>{selectedInvoice?.invoiceNumber}</strong></p>
              <p>Total: <strong>${(selectedInvoice?.amount || 0).toFixed(2)}</strong></p>
              <p>Already Paid: <strong>${(selectedInvoice?.amountPaid || 0).toFixed(2)}</strong></p>
            </div>
            <div className="space-y-2"><Label>Payment Amount *</Label><Input type="number" value={paymentData.amount} onChange={(e) => setPaymentData(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={paymentData.method} onValueChange={(v) => v && setPaymentData(p => ({ ...p, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="ECOCASH">EcoCash</SelectItem>
                  <SelectItem value="RESERVE">Reserve</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Reference</Label><Input value={paymentData.reference} onChange={(e) => setPaymentData(p => ({ ...p, reference: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={paymentData.date} onChange={(e) => setPaymentData(p => ({ ...p, date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={saving || paymentData.amount <= 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
