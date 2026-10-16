'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useSubcontractorsStore,
  computeSubcontractorBalance,
} from '@/stores/subcontractors-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { useAdminStore } from '@/stores/admin-store'
import { formatCurrency } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  FileText,
  Loader2,
  Mail,
  Phone,
  MapPin,
  HardHat,
  Receipt,
  Briefcase,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { generateSubcontractorStatementPdf } from '@/features/subcontractors/utils/generateSubcontractorStatementPdf'
import { SubcontractorPaymentApprovalsTable } from '@/features/subcontractors/components/SubcontractorPaymentApprovalsTable'
import { isFinanceLedgerLoaded, useFinanceStore } from '@/stores/finance-store'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { downloadBlob } from '@/lib/browser-download'
import type { SubcontractorTransaction } from '@/features/subcontractors/types'

function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-GB')
  if (typeof val === 'string') return new Date(val).toLocaleDateString('en-GB')
  if (val instanceof Date) return val.toLocaleDateString('en-GB')
  return String(val)
}

function sortTs(val: any): number {
  if (!val) return 0
  if (val?.toMillis) return val.toMillis()
  if (val?.toDate) return val.toDate().getTime()
  if (typeof val === 'string') return new Date(val).getTime()
  if (val instanceof Date) return val.getTime()
  return 0
}

export default function SubcontractorDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const auth = useAuthStore()
  const financeStore = useFinanceStore()
  const financeBalancesLoaded = isFinanceLedgerLoaded(financeStore)
  const { appSettings } = useAdminStore()
  const { canAccessModule, load: loadPermissions, loading: permLoading } = usePermissionsStore()
  const {
    subcontractors,
    transactions,
    loading,
    loadingTransactions,
    fetchSubcontractors,
    fetchTransactions,
    stopTransactions,
    fetchDirectPayments,
    stopDirectPayments,
    directPayments,
    loadingDirectPayments,
    recordPaymentWithOpex,
    deleteSubcontractor,
  } = useSubcontractorsStore()

  const [showPayModal, setShowPayModal] = useState(false)
  const [paying, setPaying] = useState(false)
  const [linkedJobs, setLinkedJobs] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentMethod: 'BANK',
    paymentRef: '',
    description: '',
  })

  const canRecordPayment =
    auth.isSuperAdmin() ||
    canAccessModule(auth.getRoles(), 'subcontractorsWrite')

  const isAccountant =
    auth.isSuperAdmin() ||
    auth.hasRole('ACCOUNTANT' as any) ||
    auth.hasRole('ADMIN' as any)

  const isManager =
    auth.isSuperAdmin() ||
    auth.hasRole('MANAGER' as any) ||
    auth.hasRole('ADMIN' as any) ||
    auth.hasRole('DIRECTOR' as any)

  const isAdmin = auth.isSuperAdmin() || auth.hasRole('ADMIN' as any)

  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  useEffect(() => {
    fetchSubcontractors()
  }, [fetchSubcontractors])

  useEffect(() => {
    if (!id) return
    fetchTransactions(id)
    fetchDirectPayments(id)
    return () => {
      stopTransactions()
      stopDirectPayments()
    }
  }, [id, fetchTransactions, stopTransactions, fetchDirectPayments, stopDirectPayments])

  const subcontractor = useMemo(
    () => subcontractors.find((s) => s.id === id),
    [subcontractors, id]
  )

  const balance = useMemo(
    () => computeSubcontractorBalance(transactions),
    [transactions]
  )

  const statementRows = useMemo(() => {
    const active = transactions.filter((t) => !t.voided)
    const chronological = [...active].sort(
      (a, b) => sortTs(a.createdAt) - sortTs(b.createdAt)
    )
    return chronological.reduce<Array<SubcontractorTransaction & { runningBalance: number }>>(
      (rows, tx) => {
        const previous = rows.at(-1)?.runningBalance || 0
        const amount = Number(tx.amount) || 0
        const runningBalance = tx.type === 'CHARGE' || tx.type === 'ADJUSTMENT'
          ? previous + amount
          : previous - amount
        rows.push({ ...tx, runningBalance })
        return rows
      },
      []
    ).reverse()
  }, [transactions])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function loadJobs() {
      setLoadingJobs(true)
      try {
        const jobIds = new Set<string>()
        transactions.forEach((t) => {
          if (t.jobCardId && !t.voided) jobIds.add(t.jobCardId)
        })
        if (jobIds.size === 0) {
          // Also scan job cards that reference this subcontractor
          const snap = await getDocs(collection(db, 'jobCards'))
          const matches: any[] = []
          snap.forEach((d) => {
            const data = d.data()
            const works = data.subcontractWorks || []
            if (works.some((w: any) => w.subcontractorId === id)) {
              matches.push({ id: d.id, ...data })
            }
          })
          if (!cancelled) setLinkedJobs(matches)
          return
        }
        const results: any[] = []
        for (const jobId of jobIds) {
          const snap = await getDocs(
            query(collection(db, 'jobCards'), where('__name__', '==', jobId))
          )
          snap.forEach((d) => results.push({ id: d.id, ...d.data() }))
        }
        if (!cancelled) setLinkedJobs(results)
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setLoadingJobs(false)
      }
    }
    loadJobs()
    return () => {
      cancelled = true
    }
  }, [id, transactions])

  const handleDownloadPdf = async () => {
    if (!subcontractor || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const generated = await generateSubcontractorStatementPdf(
        subcontractor,
        transactions,
        appSettings as any
      )
      downloadBlob(generated)
      toast.success('Statement PDF downloaded')
    } catch (err: any) {
      console.error('Failed to generate subcontractor statement PDF:', err)
      toast.error(err?.message || 'Failed to generate PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!canRecordPayment) {
      toast.error('You do not have permission to record payments')
      return
    }
    if (!subcontractor) return
    const amount = Number(payForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid payment amount')
      return
    }
    setPaying(true)
    try {
      await recordPaymentWithOpex({
        subcontractorId: subcontractor.id,
        subcontractorName: subcontractor.name,
        amount,
        description:
          payForm.description || `Payment to ${subcontractor.name}`,
        paymentMethod: payForm.paymentMethod,
        paymentRef: payForm.paymentRef,
        createdBy: auth.user?.uid || '',
        createdByName: auth.profile?.name || auth.user?.displayName || auth.user?.email || '',
      })
      toast.success('Payment recorded — awaiting accountant then manager approval')
      setShowPayModal(false)
      setPayForm({ amount: '', paymentMethod: 'BANK', paymentRef: '', description: '' })
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record payment')
    } finally {
      setPaying(false)
    }
  }

  const handleDelete = async () => {
    if (!isAdmin || !subcontractor) {
      toast.error('Only admins can delete subcontractors')
      return
    }
    if (
      !window.confirm(
        `Delete "${subcontractor.name}"? This cannot be undone. Subcontractors with active transactions cannot be deleted.`
      )
    ) {
      return
    }
    try {
      await deleteSubcontractor(subcontractor.id)
      toast.success('Subcontractor deleted')
      router.push('/subcontractors')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete subcontractor')
    }
  }

  if (loading && !subcontractor) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="size-8 animate-spin text-[#ff8903]" />
      </div>
    )
  }

  if (!subcontractor) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/subcontractors')}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <p className="text-muted-foreground">Subcontractor not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/subcontractors')}>
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{subcontractor.name}</h1>
            <p className="text-muted-foreground text-sm">Account Statement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRecordPayment && (
            <Button variant="outline" onClick={() => setShowPayModal(true)}>
              <Plus className="size-4 mr-2" /> Record Payment
            </Button>
          )}
          <Button
            className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loadingTransactions}
          >
            {downloadingPdf ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileText className="size-4 mr-2" />}
            {downloadingPdf ? 'Generating…' : 'Download PDF'}
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
              onClick={handleDelete}
            >
              <Trash2 className="size-4 mr-2" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <HardHat className="size-4" /> Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold text-base">{subcontractor.name}</p>
            {subcontractor.trade && (
              <p className="text-muted-foreground">Trade: {subcontractor.trade}</p>
            )}
            {subcontractor.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-3.5" /> {subcontractor.email}
              </div>
            )}
            {subcontractor.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-3.5" /> {subcontractor.phone}
              </div>
            )}
            {subcontractor.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5" /> {subcontractor.address}
              </div>
            )}
            <Badge variant="outline">{subcontractor.status}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Charges
            </p>
            <p className="text-3xl font-bold">{formatCurrency(balance.totalCharges)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Payments
            </p>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(balance.totalPayments)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Balance Owed
            </p>
            <p
              className={`text-3xl font-bold ${
                balance.balance > 0 ? 'text-[#ff8903]' : 'text-muted-foreground'
              }`}
            >
              {formatCurrency(balance.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="statement">
        <TabsList>
          <TabsTrigger value="statement">
            <Receipt className="size-3.5 mr-1.5" /> Statement
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Briefcase className="size-3.5 mr-1.5" /> Linked Job Cards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statement" className="mt-4 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Pending Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SubcontractorPaymentApprovalsTable
                payments={directPayments}
                loading={loadingDirectPayments}
                isAccountant={isAccountant}
                isManager={isManager}
                accountBalances={financeStore.finalBalances}
                balancesLoaded={financeBalancesLoaded}
                emptyMessage="No direct payments recorded yet."
              />
            </CardContent>
          </Card>

          <div>
          {loadingTransactions ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#ff8903]" />
            </div>
          ) : statementRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No transactions yet. Approved subcontract works on job cards will appear here.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Job Card</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementRows.map((tx) => (
                    <TableRow key={tx.id} className={tx.voided ? 'opacity-40' : ''}>
                      <TableCell className="text-xs">{fmtDate(tx.createdAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tx.type === 'PAYMENT'
                              ? 'default'
                              : tx.type === 'CHARGE'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {tx.description}
                      </TableCell>
                      <TableCell className="text-xs">
                        {tx.jobCardId ? (
                          <button
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={() => router.push(`/job-cards/${tx.jobCardId}`)}
                          >
                            {tx.jobCardNumber || tx.jobCardId.substring(0, 8)}
                          </button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          tx.type === 'PAYMENT' ? 'text-green-600' : ''
                        }`}
                      >
                        {tx.type === 'PAYMENT' ? '−' : '+'}
                        {formatCurrency(Number(tx.amount) || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(tx.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          {loadingJobs ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#ff8903]" />
            </div>
          ) : linkedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No linked job cards yet.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Subcontract Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedJobs.map((job) => {
                    const works = (job.subcontractWorks || []).filter(
                      (w: any) => w.subcontractorId === id
                    )
                    const total = works.reduce(
                      (s: number, w: any) => s + (Number(w.totalAmount) || 0),
                      0
                    )
                    return (
                      <TableRow
                        key={job.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => router.push(`/job-cards/${job.id}`)}
                      >
                        <TableCell className="font-semibold">
                          {job.generalInfo?.jobNumber || job.id.substring(0, 8)}
                        </TableCell>
                        <TableCell>
                          {job.generalInfo?.jobTitle || job.generalInfo?.jobCardTitle || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{job.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full max-w-md sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl rounded-b-none sm:rounded-3xl overflow-hidden">
            <CardHeader className="shrink-0">
              <CardTitle>Record Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Amount *</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <select
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                    value={payForm.paymentMethod}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, paymentMethod: e.target.value }))
                    }
                  >
                    <option value="BANK">Bank</option>
                    <option value="CASH">Cash</option>
                    <option value="ECOCASH">EcoCash</option>
                    <option value="RESERVE">Reserve</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reference</Label>
                  <Input
                    value={payForm.paymentRef}
                    onChange={(e) => setPayForm((f) => ({ ...f, paymentRef: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={payForm.description}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder={`Payment to ${subcontractor.name}`}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Payment will be submitted for accountant then manager approval before posting to OPEX.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-10"
                  onClick={() => setShowPayModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl h-10 bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                  disabled={paying}
                  onClick={handleRecordPayment}
                >
                  {paying ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  Submit for Approval
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
