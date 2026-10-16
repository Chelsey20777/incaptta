'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCrmStore } from '@/stores/crm-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { useEquipmentHireStore } from '@/stores/equipment-hire-store'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ArrowLeft, FileText, Loader2, User, Mail, Phone, MapPin,
  Receipt, Briefcase, TrendingUp, TrendingDown, Minus, CreditCard, Truck
} from 'lucide-react'
import { toast } from 'sonner'
import AddDepositSheet from '@/components/crm/AddDepositSheet'
import { downloadBlob } from '@/lib/browser-download'
import { recordBelongsToCustomer } from '@/lib/customer-profile'

const APPROVED = ['APPROVED_MANAGER', 'COMPLETED']

function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-US')
  if (typeof val === 'string') return new Date(val).toLocaleDateString('en-US')
  if (val instanceof Date) return val.toLocaleDateString('en-US')
  return String(val)
}

function sortTs(val: any): number {
  if (!val) return 0
  if (val?.toDate) return val.toDate().getTime()
  if (typeof val === 'string') return new Date(val).getTime()
  if (val instanceof Date) return val.getTime()
  return 0
}

interface TxRow {
  sortTs: number
  date: string
  ref: string
  description: string
  invoiced: number
  paid: number
  type: 'invoice' | 'payment' | 'deposit'
  status?: string
  source: 'crm' | 'jobcard' | 'credit'
}

function statusColor(status?: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (!status) return 'secondary'
  if (['APPROVED_MANAGER', 'COMPLETED', 'PAID'].includes(status)) return 'default'
  if (['UNPAID', 'DRAFT', 'SUBMITTED'].includes(status)) return 'secondary'
  if (status === 'PARTIAL') return 'outline'
  if (status === 'REJECTED') return 'destructive'
  return 'secondary'
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  const crmStore = useCrmStore()
  const { hasAnyRole } = useAuthStore()
  const { appSettings } = useAdminStore()
  const hireStore = useEquipmentHireStore()

  const [jobCards, setJobCards] = useState<any[]>([])
  const [jobPayments, setJobPayments] = useState<any[]>([])
  const [invoicePayments, setInvoicePayments] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [statementError, setStatementError] = useState(false)
  const [customerAudit, setCustomerAudit] = useState<any[]>([])
  const [showDepositSheet, setShowDepositSheet] = useState(false)

  // Customer from store
  const customer = useMemo(() =>
    crmStore.customers.find((c: any) => c.id === customerId),
    [crmStore.customers, customerId]
  )

  const legacyNameIsUnique = useMemo(() => !!customer?.name &&
    crmStore.customers.filter((candidate) => candidate.name?.trim().toLowerCase() === customer.name?.trim().toLowerCase()).length === 1,
    [crmStore.customers, customer?.name]
  )

  // CRM invoices for this customer
  const crmInvoices = useMemo(() =>
    crmStore.invoices.filter((inv: any) => recordBelongsToCustomer(inv, customerId, customer?.name, legacyNameIsUnique)),
    [crmStore.invoices, customerId, customer?.name, legacyNameIsUnique]
  )

  // Equipment hire contracts for this customer
  const customerContracts = useMemo(() =>
    hireStore.contracts.filter((contract: any) => recordBelongsToCustomer(contract, customerId, customer?.name, legacyNameIsUnique)),
    [hireStore.contracts, customerId, customer?.name, legacyNameIsUnique]
  )

  const fetchJobData = useCallback(async () => {
    if (!customer) return
    setLoadingData(true)
    setStatementError(false)
    try {
      const token = await useAuthStore.getState().user?.getIdToken()
      if (!token) throw new Error('Please sign in to load the statement')
      const paymentResponse = await fetch(`/api/crm/customers/${encodeURIComponent(customerId)}/statement-payments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!paymentResponse.ok) throw new Error('Could not load invoice payments')
      const paymentData = await paymentResponse.json()
      setInvoicePayments(paymentData.payments || [])
      const linkedSnap = await getDocs(query(collection(db, 'jobCards'), where('generalInfo.customerId', '==', customerId)))
      const legacySnap = legacyNameIsUnique && customer.name
        ? await getDocs(query(collection(db, 'jobCards'), where('generalInfo.recipientName', '==', customer.name)))
        : null
      const matchingDocs = [
        ...linkedSnap.docs,
        ...(legacySnap?.docs.filter((doc) => !doc.data().generalInfo?.customerId) || []),
      ]
      const jcs = [...new Map(matchingDocs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])).values()]
      setJobCards(jcs)

      const ids = jcs.map((jc: any) => jc.id)
      const payments: any[] = []
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30)
        const pymSnap = await getDocs(
          query(collection(db, 'jobPayments'), where('jobCardId', 'in', chunk))
        )
        payments.push(...pymSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
      setJobPayments(payments)
    } catch (error) {
      console.error('Failed to load customer statement:', error)
      setStatementError(true)
      toast.error('Could not load the complete customer statement')
    } finally {
      setLoadingData(false)
    }
  }, [customer, customerId, legacyNameIsUnique])

  useEffect(() => {
    const unsubCustomers = crmStore.fetchCustomers()
    const unsubInvoices = crmStore.fetchInvoices()
    const unsubHire = hireStore.fetchData()
    crmStore.fetchCreditAccount(customerId)
    crmStore.fetchCreditTransactions(customerId)

    return () => {
      unsubCustomers()
      unsubInvoices()
      unsubHire()
      crmStore.cleanup()
    }
  }, [customerId])

  useEffect(() => onSnapshot(
    query(collection(db, 'customerAuditLogs'), where('customerId', '==', customerId)),
    (snapshot) => setCustomerAudit(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    (error) => console.error('Could not load customer change history:', error),
  ), [customerId])

  useEffect(() => {
    if (crmStore.customers.length > 0 && customer) {
      fetchJobData()
    }
  }, [crmStore.customers, customer, fetchJobData])

  // ── Computed financials ─────────────────────────────────────────────────
  const issuedCrmInvoices = useMemo(
    () => crmInvoices.filter((inv: any) => !['DRAFT', 'CANCELLED'].includes(String(inv.status || 'DRAFT').toUpperCase())),
    [crmInvoices],
  )

  // Job cards whose receivable is already represented by a linked CRM invoice.
  const jobCardsCoveredByCrm = useMemo(() => {
    const ids = new Set<string>()
    for (const inv of issuedCrmInvoices) {
      const jobCardId = String(inv.jobCardId || '').trim()
      if (jobCardId) ids.add(jobCardId)
    }
    return ids
  }, [issuedCrmInvoices])

  const transactions = useMemo<TxRow[]>(() => {
    const rows: TxRow[] = []
    const includedInvoicePaymentIds = new Set(
      invoicePayments.map((p: any) => String(p.id || '').trim()).filter(Boolean),
    )
    const issuedCrmInvoiceIds = new Set(issuedCrmInvoices.map((inv: any) => String(inv.id)))

    // Only issued CRM invoices are receivables. Deposits are shown separately.
    for (const inv of issuedCrmInvoices) {
      const ref = `INV-${String(inv.id).substring(0, 8).toUpperCase()}`
      rows.push({
        sortTs: sortTs(inv.createdAt),
        date: fmtDate(inv.createdAt),
        ref,
        description: `CRM Invoice${inv.items?.length ? ` (${inv.items.length} item${inv.items.length > 1 ? 's' : ''})` : ''}`,
        invoiced: Number(inv.amount ?? inv.grandTotal ?? 0),
        paid: 0,
        type: 'invoice',
        status: inv.status,
        source: 'crm',
      })
      const recordedPayments = invoicePayments.filter((p) => p.invoiceId === inv.id)
      const payments = recordedPayments.length ? recordedPayments : (inv.payments || [])
      for (const p of payments) {
        rows.push({
          sortTs: sortTs(p.date || p.createdAt),
          date: fmtDate(p.date || p.createdAt),
          ref,
          description: `Payment${p.reference ? ` — ${p.reference}` : ''} (${p.method || ''})`,
          invoiced: 0,
          paid: Number(p.amount || 0),
          type: 'payment',
          source: 'crm',
        })
      }
      const listedPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)
      const unlistedPaid = Number((Number(inv.amountPaid || 0) - listedPaid).toFixed(2))
      if (unlistedPaid > 0) rows.push({
        sortTs: sortTs(inv.updatedAt || inv.createdAt),
        date: fmtDate(inv.updatedAt || inv.createdAt),
        ref,
        description: 'Previously recorded payment',
        invoiced: 0,
        paid: unlistedPaid,
        type: 'payment',
        source: 'crm',
      })
    }

    // Job card invoices + jobPayments (skip mirrors already counted via invoicePayments)
    const pymByJob = new Map<string, any[]>()
    for (const p of jobPayments) {
      const invoicePaymentId = String(p.invoicePaymentId || '').trim()
      const invoiceId = String(p.invoiceId || '').trim()
      const mirroredAlreadyCounted =
        (invoicePaymentId && includedInvoicePaymentIds.has(invoicePaymentId)) ||
        (String(p.source || '').toUpperCase() === 'INVOICE' && invoiceId && issuedCrmInvoiceIds.has(invoiceId))
      if (mirroredAlreadyCounted) continue

      const jid = String(p.jobCardId || '')
      if (!pymByJob.has(jid)) pymByJob.set(jid, [])
      pymByJob.get(jid)!.push(p)
    }

    for (const jc of jobCards) {
      if (!APPROVED.includes(jc.status || '')) continue
      const jcRef = jc.generalInfo?.jobNumber || String(jc.id).substring(0, 8).toUpperCase()
      const coveredByCrmInvoice = jobCardsCoveredByCrm.has(jc.id)
      // Linked CRM invoice already carries the receivable — do not double-count it.
      if (!coveredByCrmInvoice) {
        const jcAmt = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)
        rows.push({
          sortTs: sortTs(jc.generalInfo?.dateIssued || jc.createdAt),
          date: fmtDate(jc.generalInfo?.dateIssued || jc.createdAt),
          ref: jcRef,
          description: `Job Card Invoice${jc.generalInfo?.jobTitle ? ` — ${jc.generalInfo.jobTitle}` : ''}`,
          invoiced: jcAmt,
          paid: 0,
          type: 'invoice',
          status: jc.status,
          source: 'jobcard',
        })
      }
      for (const p of (pymByJob.get(jc.id) || [])) {
        rows.push({
          sortTs: sortTs(p.createdAt),
          date: fmtDate(p.createdAt),
          ref: jcRef,
          description: `Payment${p.description ? ` — ${p.description}` : ''} (${p.paymentMethod || ''})`,
          invoiced: 0,
          paid: Number(p.amount || 0),
          type: 'payment',
          source: 'jobcard',
        })
      }
    }

    return rows.sort((a, b) => a.sortTs - b.sortTs)
  }, [issuedCrmInvoices, invoicePayments, jobCards, jobPayments, jobCardsCoveredByCrm])

  const totalInvoiced = useMemo(() => {
    const sum = transactions.reduce((s, r) => s + r.invoiced, 0)
    return Number(sum.toFixed(2))
  }, [transactions])

  const totalPaid = useMemo(() => {
    const sum = transactions.reduce((s, r) => s + r.paid, 0)
    return Number(sum.toFixed(2))
  }, [transactions])

  const outstanding = useMemo(() => {
    const value = issuedCrmInvoices.reduce((sum, invoice) => {
      return sum + Math.max(0, Number(invoice.amount || invoice.grandTotal || 0) - Number(invoice.amountPaid || 0))
    }, 0)
    return Number(value.toFixed(2))
  }, [issuedCrmInvoices])

  const rowsWithBalance = useMemo(() => {
    let balance = 0
    return transactions.map(r => {
      balance = Number((balance + (r.invoiced - r.paid)).toFixed(2))
      return { ...r, balance }
    })
  }, [transactions])

  const statementBalance = rowsWithBalance.at(-1)?.balance || 0

  async function handleDownloadPdf() {
    if (loadingData || statementError || downloadingPdf || !customer) return
    setDownloadingPdf(true)
    try {
      const { generateCustomerStatementPdf } = await import('@/features/crm/utils/generateCustomerStatementPdf')
      const generated = await generateCustomerStatementPdf(customer, rowsWithBalance, appSettings as any)
      downloadBlob(generated)
      toast.success('Customer statement downloaded')
    } catch (error) {
      console.error('Failed to generate customer statement PDF:', error)
      toast.error('Could not download the customer statement')
    } finally {
      setDownloadingPdf(false)
    }
  }

  // Job cards that contribute their own invoice line on the statement (not covered by CRM).
  const statementJobCards = useMemo(
    () => jobCards.filter((jc: any) => APPROVED.includes(jc.status || '') && !jobCardsCoveredByCrm.has(jc.id)),
    [jobCards, jobCardsCoveredByCrm],
  )

  const creditAccount = useMemo(() =>
    crmStore.creditAccounts[customerId] ?? {
      balance: 0,
      totalDeposited: 0,
      totalApplied: 0
    },
    [crmStore.creditAccounts, customerId]
  )

  const creditTxns = useMemo(() =>
    crmStore.creditTransactions[customerId] ?? [],
    [crmStore.creditTransactions, customerId]
  )

  function handleDeposited() {
    crmStore.fetchCreditAccount(customerId)
    crmStore.fetchCreditTransactions(customerId)
  }

  // ── Brand color ─────────────────────────────────────────────────────────
  const brandPrimary = appSettings?.uiColors?.brandPrimaryColor || '#79c21b'
  const brandSecondary = appSettings?.uiColors?.brandSecondaryColor || '#ff8903'

  // ── Loading / not found ─────────────────────────────────────────────────
  if (loadingData && !customer) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Customer not found.
      </div>
    )
  }

  const customerSince = customer.createdAt?.toDate
    ? customer.createdAt.toDate().toLocaleDateString()
    : 'N/A'

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <p className="text-muted-foreground text-sm">Account Statement</p>
          </div>
        </div>
        <Button
          style={{ backgroundColor: brandSecondary, color: '#fff' }}
          className="hover:opacity-90"
          onClick={handleDownloadPdf}
          disabled={loadingData || statementError || downloadingPdf}
        >
          {downloadingPdf ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileText className="size-4 mr-2" />}
          {downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}
        </Button>
      </div>

      {customerAudit.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Status and Credit Limit History</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[...customerAudit].sort((a, b) => sortTs(b.createdAt) - sortTs(a.createdAt)).slice(0, 10).map((entry) => (
              <div key={entry.id} className="border-b pb-2 last:border-0">
                <span className="font-medium">{fmtDate(entry.createdAt)}</span> · {entry.actorUid}
                {Object.entries(entry.changes || {}).map(([field, change]) => {
                  const values = change as { before?: unknown; after?: unknown }
                  return <div key={field}>{field === 'creditLimit' ? 'Credit limit' : 'Status'}: {String(values.before ?? '—')} → {String(values.after ?? '—')}</div>
                })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Customer info + summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Customer card */}
        <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-primary">
              <User className="size-4" /> Customer Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-semibold text-foreground dark:text-white text-base">
              <div
                className="size-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  color: brandPrimary,
                  backgroundColor: brandPrimary + '30'
                }}
              >
                {(customer.name || 'C').charAt(0).toUpperCase()}
              </div>
              {customer.name}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{customer.customerType === 'COMPANY' ? 'Company' : customer.customerType === 'INDIVIDUAL' ? 'Individual' : 'Unclassified (legacy)'}</Badge>
              <Badge variant={customer.status === 'BLACKLISTED' ? 'destructive' : customer.status === 'INACTIVE' ? 'secondary' : 'default'}>
                {customer.status || 'ACTIVE'}
              </Badge>
            </div>
            {customer.primaryContactName && <div>Primary contact: {customer.primaryContactName}</div>}
            {customer.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-3.5 shrink-0" /> {customer.email}
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-3.5 shrink-0" /> {customer.phone}
              </div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" /> Billing: {customer.address}
              </div>
            )}
            {customer.siteAddress && <div className="text-muted-foreground">Site: {customer.siteAddress}</div>}
            {customer.taxId && <div className="text-muted-foreground">Tax ID: {customer.taxId}</div>}
            {customer.registrationNumber && <div className="text-muted-foreground">Registration: {customer.registrationNumber}</div>}
            <div>Credit limit: {Number(customer.creditLimit || 0) > 0 ? formatCurrency(Number(customer.creditLimit)) : 'No limit configured'}</div>
            {customer.notes && <div className="whitespace-pre-wrap text-muted-foreground">Notes: {customer.notes}</div>}
            <div className="text-xs text-muted-foreground pt-1">
              Customer since {customerSince}
            </div>
          </CardContent>
        </Card>

        {/* Total Invoiced */}
        <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: brandPrimary }}>
              Total Invoiced
            </p>
            <p className="text-3xl font-bold text-foreground dark:text-white">
              {formatCurrency(totalInvoiced)}
            </p>
            <p className="text-xs text-muted-foreground">
              {issuedCrmInvoices.length} CRM invoice{issuedCrmInvoices.length !== 1 ? 's' : ''} +
              {' '}{statementJobCards.length} job card{statementJobCards.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        {/* Credit Balance */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Credit Balance
          </p>
          <p className={`text-2xl font-bold ${creditAccount.balance > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
            ${(creditAccount.balance ?? 0).toFixed(2)}
          </p>
          {hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']) && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs"
              onClick={() => setShowDepositSheet(true)}
            >
              + Add Deposit
            </Button>
          )}
        </div>

        {/* Total Paid / Outstanding */}
        <div className="grid grid-rows-2 gap-4">
          <Card className="bg-emerald-500/10 border-emerald-500/20 shadow-sm">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Total Paid
                </p>
                <p className="text-xl font-bold text-foreground dark:text-white">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
              <TrendingUp className="size-8 text-emerald-500/40" />
            </CardContent>
          </Card>
          <Card
            className={`shadow-sm ${outstanding > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}
          >
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider ${outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  Outstanding
                </p>
                <p className="text-xl font-bold text-foreground dark:text-white">
                  {formatCurrency(outstanding)}
                </p>
              </div>
              {outstanding > 0 ? (
                <TrendingDown className="size-8 text-red-500/40" />
              ) : (
                <Minus className="size-8 text-emerald-500/40" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="statement">
        <div className="w-full overflow-x-auto scrollbar-hide py-1">
          <TabsList className="flex justify-start gap-1 p-1 min-w-max">
            <TabsTrigger value="statement" className="shrink-0 flex-none">
              <Receipt className="size-3.5 mr-1.5" /> Account Statement
            </TabsTrigger>
            <TabsTrigger value="jobcards" className="shrink-0 flex-none">
              <Briefcase className="size-3.5 mr-1.5" />
              Job Cards
              {jobCards.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
                  {jobCards.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="crminvoices" className="shrink-0 flex-none">
              <FileText className="size-3.5 mr-1.5" />
              CRM Invoices
              {crmInvoices.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
                  {crmInvoices.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="creditaccount" className="shrink-0 flex-none">
              <CreditCard className="size-3.5 mr-1.5" />
              Credit Account
              {creditTxns.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
                  {creditTxns.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="equipmenthire" className="shrink-0 flex-none">
              <Truck className="size-3.5 mr-1.5" />
              Equipment Hire
              {customerContracts.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
                  {customerContracts.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Account Statement tab ── */}
        <TabsContent value="statement">
          <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent className="p-0">
              {loadingData ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : statementError ? (
                <div className="text-center py-12 text-destructive text-sm">
                  Statement data could not be loaded. Please refresh the page and try again.
                </div>
              ) : rowsWithBalance.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No transactions on record for this customer.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-4">Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Reference</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Description</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Invoiced</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Paid</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsWithBalance.map((row, i) => {
                      const isPayment = row.type === 'payment'
                      const isDeposit = row.type === 'deposit'
                      return (
                        <TableRow
                          key={i}
                          className={`border-b transition-colors ${
                            isPayment ? 'bg-emerald-500/5' :
                            isDeposit ? 'bg-blue-500/5' :
                            ''
                          } hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10`}
                        >
                          <TableCell className="text-xs text-muted-foreground pl-4 whitespace-nowrap">
                            {row.date}
                          </TableCell>
                          <TableCell>
                            <span
                              className="font-mono text-xs px-2 py-0.5 rounded border"
                              style={
                                row.type === 'deposit'
                                  ? { color: '#3b82f6', backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }
                                  : { color: brandPrimary, backgroundColor: brandPrimary + '15', borderColor: brandPrimary + '30' }
                              }
                            >
                              {row.ref}
                            </span>
                          </TableCell>
                          <TableCell className={`text-sm ${
                            isPayment ? 'text-muted-foreground italic pl-6' :
                            isDeposit ? 'text-blue-500 italic pl-6' :
                            'font-medium text-foreground dark:text-white'
                          }`}>
                            {row.description}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-foreground dark:text-white">
                            {row.invoiced > 0 ? formatCurrency(row.invoiced) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {row.paid > 0 ? formatCurrency(row.paid) : '—'}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-bold pr-4 ${
                            row.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatCurrency(row.balance)}
                          </TableCell>
                        </TableRow>
                      )
                    })}

                    {/* Totals row */}
                    <TableRow
                      className="border-t-2 bg-brand-primary/10"
                      style={{ borderColor: brandPrimary + '40' }}
                    >
                      <TableCell colSpan={3} className="font-bold text-sm pl-4 text-foreground dark:text-white">
                        TOTALS
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm text-foreground dark:text-white">
                        {formatCurrency(totalInvoiced)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalPaid)}
                      </TableCell>
                      <TableCell className={`text-right font-bold text-sm pr-4 ${
                        statementBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {formatCurrency(statementBalance)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Job Cards tab ── */}
        <TabsContent value="jobcards">
          <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent className="p-0">
              {loadingData ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : jobCards.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No job cards found for this customer.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-4">Job Ref</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Title</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Invoice Value</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobCards.map(jc => {
                      const collected = jobPayments
                        .filter((p: any) => p.jobCardId === jc.id)
                        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
                      return (
                        <TableRow
                          key={jc.id}
                          className="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors cursor-pointer"
                          onClick={() => router.push(`/job-cards/${jc.id}`)}
                        >
                          <TableCell className="pl-4">
                            <span
                              className="font-mono text-xs px-2 py-0.5 rounded border"
                              style={{
                                color: brandPrimary,
                                backgroundColor: brandPrimary + '15',
                                borderColor: brandPrimary + '30'
                              }}
                            >
                              {jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-foreground dark:text-white">
                            {jc.generalInfo?.jobTitle || jc.generalInfo?.jobCardTitle || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {jc.generalInfo?.dateIssued
                              ? new Date(jc.generalInfo.dateIssued).toLocaleDateString()
                              : fmtDate(jc.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColor(jc.status)} className="text-[10px]">{jc.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-foreground dark:text-white">
                            {APPROVED.includes(jc.status)
                              ? formatCurrency(Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || 0))
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400 font-semibold pr-4">
                            {formatCurrency(collected)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CRM Invoices tab ── */}
        <TabsContent value="crminvoices">
          <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent className="p-0">
              {crmInvoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No CRM invoices found for this customer.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-4">Invoice</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Amount</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Paid</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crmInvoices.map(inv => {
                      const balance = (inv.grandTotal || 0) - (inv.amountPaid || 0)
                      return (
                        <TableRow
                          key={inv.id}
                          className="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors"
                        >
                          <TableCell className="pl-4">
                            <span
                              className="font-mono text-xs px-2 py-0.5 rounded border"
                              style={{
                                color: brandPrimary,
                                backgroundColor: brandPrimary + '15',
                                borderColor: brandPrimary + '30'
                              }}
                            >
                              INV-{inv.id.substring(0, 8).toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</TableCell>
                          <TableCell>
                            <Badge variant={statusColor(inv.status)} className="text-[10px]">{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-foreground dark:text-white">
                            {formatCurrency(inv.grandTotal || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                            {formatCurrency(inv.amountPaid || 0)}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-bold pr-4 ${
                            balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatCurrency(balance)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Credit Account tab ── */}
        <TabsContent value="creditaccount">
          <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent className="p-0">
              {/* Header stats */}
              <div className="p-6 border-b bg-white/50 dark:bg-gray-900/50">
                <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Credit Account</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Deposited</p>
                    <p className="text-2xl font-bold text-foreground dark:text-white">
                      ${(creditAccount.totalDeposited || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Applied</p>
                    <p className="text-2xl font-bold text-foreground dark:text-white">
                      ${(creditAccount.totalApplied || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current Balance</p>
                    <p className={`text-2xl font-bold ${creditAccount.balance > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                      ${(creditAccount.balance || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction table */}
              {creditTxns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No credit transactions yet.<br />
                  Record a deposit to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-4">Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Type</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Amount</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Balance</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Reference</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Details</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pr-4">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditTxns.map((tx: any) => (
                      <TableRow
                        key={tx.id}
                        className="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors"
                      >
                        <TableCell className="text-xs text-muted-foreground pl-4 whitespace-nowrap">
                          {fmtDate(tx.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              tx.type === 'DEPOSIT' ? 'default' :
                              tx.type === 'APPLIED' ? 'secondary' : 'outline'
                            }
                            className={`text-[10px] ${
                              tx.type === 'DEPOSIT'
                                ? 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30'
                                : tx.type === 'APPLIED'
                                ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'APPLIED' ? 'Applied' : 'Adjustment'}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${
                          tx.type === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {tx.type === 'DEPOSIT' ? '+' : '−'}${(tx.amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-foreground dark:text-white">
                          ${(tx.balanceAfter || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tx.reference || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {tx.type === 'APPLIED' && tx.jobCardId ? (
                            <Button
                              variant="link"
                              className="h-auto p-0 text-xs"
                              onClick={() => router.push(`/job-cards/${tx.jobCardId}`)}
                            >
                              {tx.jobCardNumber || 'View Job Card'}
                            </Button>
                          ) : tx.type === 'DEPOSIT' ? (
                            <Badge variant="outline" className="text-[10px]">
                              {tx.paymentMethod || '—'}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground pr-4 max-w-[200px] truncate">
                          {tx.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Equipment Hire tab ── */}
        <TabsContent value="equipmenthire">
          <Card className="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent className="p-0">
              {loadingData ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : customerContracts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No equipment hire contracts on record for this customer.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider pl-4">Contract ID</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Equipment Asset</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Hire Type</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">Start Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider">End Date</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Daily Rate</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerContracts.map((contract) => (
                      <TableRow key={contract.id} className="border-b transition-colors hover:bg-muted/10">
                        <TableCell className="text-xs font-mono font-medium pl-4">{contract.id.substring(0, 8).toUpperCase()}</TableCell>
                        <TableCell className="text-xs font-semibold">{contract.assetName}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline">{contract.hireType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(contract.startDate)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(contract.endDate)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">${Number(contract.baseDailyRate).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right pr-4">
                          <Badge
                            variant={
                              contract.status === 'Active' ? 'default' :
                              contract.status === 'Draft' ? 'secondary' :
                              contract.status === 'Pending_Return' ? 'outline' : 'outline'
                            }
                            className={
                              contract.status === 'Closed' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : ''
                            }
                          >
                            {contract.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Deposit Sheet */}
      <AddDepositSheet
        open={showDepositSheet}
        onOpenChange={setShowDepositSheet}
        clientId={customerId}
        clientName={customer.name || ''}
        currentBalance={creditAccount.balance ?? 0}
        onDeposited={handleDeposited}
      />
    </div>
  )
}
