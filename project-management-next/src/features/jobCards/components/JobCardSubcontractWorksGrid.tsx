'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Link2, Loader2, ExternalLink, Unlink, Search } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { useSubcontractorsStore } from '@/stores/subcontractors-store'
import { ScnPaymentsPanel } from '@/features/subcontractors/components/ScnPaymentsPanel'
import type { SubcontractWork, SubcontractorJob } from '@/features/subcontractors/types'

interface JobCardSubcontractWorksGridProps {
  modelValue: SubcontractWork[]
  generalInfo?: any
  jobCardId?: string
  jobCardNumber?: string
  isAdmin?: boolean
  isAccountant?: boolean
  isManager?: boolean
  isJobApproved?: boolean
  canManageProof?: boolean
  canWrite?: boolean
  accountBalances?: Record<string, number>
  balancesLoaded?: boolean
  userName?: string
  createdBy?: string
  onUpdate: (works: SubcontractWork[]) => void
  onPersistWorks?: (works: SubcontractWork[]) => Promise<void>
  onApproveItem?: (itemId: string, status: string) => void
  onApproveAll?: (status: string) => void
}

export default function JobCardSubcontractWorksGrid({
  modelValue,
  generalInfo,
  jobCardId,
  jobCardNumber,
  isAdmin = false,
  isAccountant = false,
  isManager = false,
  canWrite = false,
  accountBalances,
  balancesLoaded = false,
  userName,
  createdBy,
  onUpdate,
}: JobCardSubcontractWorksGridProps) {
  const router = useRouter()
  const {
    jobs,
    jobPayments,
    loadingJobs,
    loadingJobPayments,
    fetchJobs,
    fetchPaymentsForJobCard,
    stopJobPayments,
    linkJobToJobCard,
    unlinkJobFromJobCard,
  } = useSubcontractorsStore()

  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [linking, setLinking] = useState(false)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    if (!jobCardId) return
    fetchPaymentsForJobCard(jobCardId)
    return () => stopJobPayments()
  }, [jobCardId, fetchPaymentsForJobCard, stopJobPayments])

  const scnLinks = useMemo(
    () => (modelValue || []).filter((w) => w.isScnLink || w.subcontractorJobId),
    [modelValue]
  )
  const legacyRows = useMemo(
    () => (modelValue || []).filter((w) => !w.isScnLink && !w.subcontractorJobId),
    [modelValue]
  )

  const resolveJob = (work: SubcontractWork): SubcontractorJob | undefined => {
    const jid = work.subcontractorJobId || work.id
    return jobs.find((j) => j.id === jid)
  }

  const filteredScnLinks = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return scnLinks
    return scnLinks.filter((work) => {
      const job = resolveJob(work)
      return (
        (work.contractNumber || '').toLowerCase().includes(q) ||
        (job?.contractNumber || '').toLowerCase().includes(q) ||
        (work.subcontractorName || '').toLowerCase().includes(q) ||
        (work.description || '').toLowerCase().includes(q) ||
        (job?.description || '').toLowerCase().includes(q) ||
        (job?.subcontractorName || '').toLowerCase().includes(q)
      )
    })
  }, [scnLinks, listSearch, jobs])

  const filteredLegacyRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return legacyRows
    return legacyRows.filter((work) =>
      (work.contractNumber || '').toLowerCase().includes(q) ||
      (work.subcontractorName || '').toLowerCase().includes(q) ||
      (work.description || '').toLowerCase().includes(q)
    )
  }, [legacyRows, listSearch])

  const availableJobs = useMemo(() => {
    const linkedIds = new Set(
      scnLinks.map((w) => w.subcontractorJobId || w.id).filter(Boolean)
    )
    const q = linkSearch.trim().toLowerCase()
    return jobs.filter((j) => {
      if (j.status === 'CANCELLED') return false
      if (j.jobCardId && j.jobCardId !== jobCardId) return false
      if (linkedIds.has(j.id)) return false
      if (!q) return true
      return (
        j.contractNumber?.toLowerCase().includes(q) ||
        j.subcontractorName?.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q)
      )
    })
  }, [jobs, scnLinks, jobCardId, linkSearch])

  const paymentsByJob = useMemo(() => {
    const map: Record<string, typeof jobPayments> = {}
    for (const p of jobPayments) {
      const jobId = p.subcontractorJobId
      if (!jobId) continue
      if (!map[jobId]) map[jobId] = []
      map[jobId].push(p)
    }
    return map
  }, [jobPayments])

  const handleLink = async () => {
    if (!jobCardId || !selectedJobId) return
    const job = jobs.find((j) => j.id === selectedJobId)
    if (!job) return
    setLinking(true)
    try {
      await linkJobToJobCard(
        job.id,
        jobCardId,
        jobCardNumber || generalInfo?.jobNumber || jobCardId
      )
      // Optimistic local projection — live sync also writes to Firestore
      const value = Number(job.contractValue) || 0
      const projection: SubcontractWork = {
        id: job.id,
        subcontractorId: job.subcontractorId,
        subcontractorName: job.subcontractorName,
        description: job.description || job.contractNumber,
        quantity: 1,
        unitPrice: value,
        totalAmount: value,
        paymentMethod: 'PENDING',
        paymentRef: '',
        attachmentUrl: null,
        attachmentUrls: [],
        createdAt: new Date().toISOString(),
        approvalStatus: 'PENDING',
        isScnLink: true,
        subcontractorJobId: job.id,
        contractNumber: job.contractNumber,
        contractValue: value,
        paidApprovedTotal: Number(job.paidApprovedTotal) || 0,
        scnStatus: job.status,
      }
      const withoutDup = modelValue.filter(
        (w) => w.subcontractorJobId !== job.id && !(w.isScnLink && w.id === job.id)
      )
      onUpdate([...withoutDup, projection])
      toast.success(`Linked ${job.contractNumber}`)
      setShowLinkModal(false)
      setSelectedJobId('')
      setExpandedJobId(job.id)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link SCN')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async (work: SubcontractWork) => {
    const jid = work.subcontractorJobId || work.id
    if (!jid) return
    const job = resolveJob(work)
    const paid = Number(job?.paidApprovedTotal ?? work.paidApprovedTotal) || 0
    const status = job?.status || work.scnStatus
    const isApproved = paid > 0 || status === 'COMPLETED'
    const isAdminOrManager = isAdmin || isManager
    if (isApproved && !isAdminOrManager) {
      toast.error('Only managers and admins can unlink an approved subcontract')
      return
    }
    if (!isApproved && !(canWrite || isAdmin)) {
      toast.error('You do not have permission to unlink')
      return
    }
    if (!window.confirm(`Unlink ${work.contractNumber || 'this SCN'} from this job card?`)) return
    setLinking(true)
    try {
      await unlinkJobFromJobCard(jid, { isAdminOrManager })
      onUpdate(modelValue.filter((w) => (w.subcontractorJobId || w.id) !== jid))
      toast.success('Unlinked')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink')
    } finally {
      setLinking(false)
    }
  }

  const canUnlinkWork = (work: SubcontractWork) => {
    const job = resolveJob(work)
    const paid = Number(job?.paidApprovedTotal ?? work.paidApprovedTotal) || 0
    const status = job?.status || work.scnStatus
    const isApproved = paid > 0 || status === 'COMPLETED'
    const isAdminOrManager = isAdmin || isManager
    if (isApproved) return isAdminOrManager
    return !!(canWrite || isAdmin)
  }

  const scnStatusBadge = (status?: string) => {
    if (status === 'COMPLETED') return <Badge className="bg-green-600 text-white text-[10px]">Completed</Badge>
    if (status === 'CANCELLED') return <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>
    return <Badge className="bg-blue-600 text-white text-[10px]">Active</Badge>
  }

  return (
    <div className="border rounded-md overflow-hidden bg-background font-sans">
      {generalInfo && (
        <div className="bg-muted/30 border-b px-4 py-2 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] w-full">
          <div className="flex items-center gap-2">
            <span className="font-bold text-muted-foreground uppercase tracking-tight">Job #:</span>
            <span className="font-mono text-primary font-bold">{generalInfo.jobNumber || 'N/A'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] font-bold"
              onClick={() => router.push('/subcontractors/jobs')}
            >
              <ExternalLink className="size-3 mr-1" /> SCN Module
            </Button>
            {(canWrite || isAdmin) && jobCardId && (
              <Button
                size="sm"
                className="h-7 text-[10px] font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                onClick={() => setShowLinkModal(true)}
              >
                <Link2 className="size-3 mr-1" /> Link SCN
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="relative max-w-sm px-4 py-2 border-b">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search SCN #, vendor, description…"
          className="pl-8 h-8"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto max-h-[520px] overflow-y-auto relative p-3 space-y-3">
        {loadingJobs && scnLinks.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-[#ff8903]" />
          </div>
        ) : scnLinks.length === 0 && legacyRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <p className="font-semibold">No SCN contracts linked</p>
            <p className="text-xs mt-1">Create an SCN in Subcontractors, then link it here.</p>
          </div>
        ) : filteredScnLinks.length === 0 && filteredLegacyRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <p className="font-semibold">No matching subcontract works</p>
          </div>
        ) : (
          <>
            {filteredScnLinks.map((work) => {
              const job = resolveJob(work)
              const jid = work.subcontractorJobId || work.id
              const expanded = expandedJobId === jid
              const paid = Number(job?.paidApprovedTotal ?? work.paidApprovedTotal) || 0
              const value = Number(job?.contractValue ?? work.contractValue ?? work.totalAmount) || 0
              return (
                <div key={work.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex flex-wrap items-center gap-3 px-3 py-2 bg-muted/20 cursor-pointer hover:bg-muted/40"
                    onClick={() => setExpandedJobId(expanded ? null : jid)}
                  >
                    <span className="font-mono font-bold text-[#ff8903] text-sm">
                      {work.contractNumber || job?.contractNumber || 'SCN'}
                    </span>
                    <span className="text-sm font-semibold">{work.subcontractorName}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {work.description}
                    </span>
                    <span className="text-xs tabular-nums font-semibold ml-auto">
                      {formatCurrency(value)}
                    </span>
                    <span className="text-xs tabular-nums text-green-600">
                      Paid {formatCurrency(paid)}
                    </span>
                    {scnStatusBadge(job?.status || work.scnStatus)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/subcontractors/jobs/${jid}`)
                      }}
                    >
                      <ExternalLink className="size-3" />
                    </Button>
                    {canUnlinkWork(work) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] text-red-500"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnlink(work)
                        }}
                        disabled={linking}
                      >
                        <Unlink className="size-3" />
                      </Button>
                    )}
                  </div>
                  {expanded && job && (
                    <div className="p-3 border-t">
                      <ScnPaymentsPanel
                        job={job}
                        payments={paymentsByJob[job.id] || []}
                        loading={loadingJobPayments}
                        canWrite={canWrite || isAdmin}
                        isAccountant={isAccountant}
                        isManager={isManager}
                        accountBalances={accountBalances}
                        balancesLoaded={balancesLoaded}
                        userName={userName}
                        createdBy={createdBy}
                      />
                    </div>
                  )}
                  {expanded && !job && (
                    <div className="p-3 border-t text-xs text-muted-foreground">
                      Loading contract details…
                    </div>
                  )}
                </div>
              )
            })}

            {filteredLegacyRows.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 px-1">
                  Legacy subcontract lines (read-only)
                </p>
                <Table className="border-collapse w-full">
                  <TableHeader>
                    <TableRow className="h-9">
                      <TableHead className="text-[11px]">Subcontractor</TableHead>
                      <TableHead className="text-[11px]">Description</TableHead>
                      <TableHead className="text-right text-[11px]">Total</TableHead>
                      <TableHead className="text-center text-[11px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLegacyRows.map((item) => (
                      <TableRow key={item.id} className="opacity-70">
                        <TableCell className="text-xs">{item.subcontractorName || '—'}</TableCell>
                        <TableCell className="text-xs">{item.description || '—'}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatCurrency(Number(item.totalAmount) || 0)}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {item.approvalStatus || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>

      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-background w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold">Link SCN Contract</h3>
              <p className="text-xs text-muted-foreground">
                Select an unlinked (or already linked here) active contract
              </p>
            </div>
            <Input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Search SCN # or vendor…"
            />
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {availableJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">
                  No available SCN contracts. Create one in Subcontractors → SCN Contracts.
                </p>
              ) : (
                availableJobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-xs border-b hover:bg-muted/40 ${
                      selectedJobId === j.id ? 'bg-[#ff8903]/10' : ''
                    }`}
                    onClick={() => setSelectedJobId(j.id)}
                  >
                    <span className="font-mono font-semibold text-[#ff8903]">{j.contractNumber}</span>
                    <span className="ml-2 font-semibold">{j.subcontractorName}</span>
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {formatCurrency(Number(j.contractValue) || 0)}
                    </span>
                    {j.description && (
                      <div className="text-[10px] text-muted-foreground truncate">{j.description}</div>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowLinkModal(false)} disabled={linking}>
                Cancel
              </Button>
              <Button
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                onClick={handleLink}
                disabled={linking || !selectedJobId}
              >
                {linking ? <Loader2 className="size-4 animate-spin mr-2" /> : <Link2 className="size-4 mr-2" />}
                Link
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
