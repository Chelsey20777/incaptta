'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSubcontractorsStore } from '@/stores/subcontractors-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useAdminStore } from '@/stores/admin-store'
import { formatCurrency } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { uploadExpenseAttachment } from '@/features/jobCards/utils/financeUtils'
import {
  ArrowLeft,
  Loader2,
  Link2,
  Unlink,
  HardHat,
  FileText,
  Paperclip,
  Eye,
  Trash2,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { ScnPaymentsPanel } from '@/features/subcontractors/components/ScnPaymentsPanel'
import { isFinanceLedgerLoaded, useFinanceStore } from '@/stores/finance-store'
import { generateScnContractPdf } from '@/features/subcontractors/utils/generateScnContractPdf'
import { downloadBlob } from '@/lib/browser-download'

function fileLabel(url: string, index: number): string {
  try {
    const path = decodeURIComponent(url.split('?')[0] || '')
    const name = path.split('/').pop() || ''
    const cleaned = name.replace(/^\d+_/, '')
    return cleaned || `Attachment ${index + 1}`
  } catch {
    return `Attachment ${index + 1}`
  }
}

export default function SubcontractorJobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const auth = useAuthStore()
  const { appSettings } = useAdminStore()
  const financeStore = useFinanceStore()
  const financeBalancesLoaded = isFinanceLedgerLoaded(financeStore)
  const { canAccessModule, load: loadPermissions, loading: permLoading } = usePermissionsStore()
  const {
    jobs,
    jobPayments,
    loadingJobs,
    loadingJobPayments,
    fetchJobs,
    fetchJobPayments,
    stopJobPayments,
    linkJobToJobCard,
    unlinkJobFromJobCard,
    updateJob,
  } = useSubcontractorsStore()
  const { jobCards, fetchJobCards } = useJobCardsStore()

  const [linking, setLinking] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [jobCardSearch, setJobCardSearch] = useState('')
  const [selectedJobCardId, setSelectedJobCardId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [viewerFile, setViewerFile] = useState<{ url: string; title: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canWrite =
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

  // Unlink of approved SCNs: Admin / Manager / Super Admin only (not Director-only)
  const isAdminOrManager =
    auth.isSuperAdmin() ||
    auth.hasRole('ADMIN' as any) ||
    auth.hasRole('MANAGER' as any)

  const userName =
    auth.profile?.name || auth.user?.displayName || auth.user?.email || ''

  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  useEffect(() => {
    fetchJobs()
    const unsub = fetchJobCards()
    return () => { unsub?.() }
  }, [fetchJobs, fetchJobCards])

  useEffect(() => {
    if (!id) return
    fetchJobPayments(id)
    return () => stopJobPayments()
  }, [id, fetchJobPayments, stopJobPayments])

  useEffect(() => {
    return financeStore.subscribeLedger()
    // Finance store actions are stable Zustand functions; subscribing to the
    // whole reactive store here would recreate every listener on each update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const job = useMemo(() => jobs.find((j) => j.id === id), [jobs, id])
  const attachments = job?.attachmentUrls || []

  const filteredJobCards = useMemo(() => {
    const q = jobCardSearch.trim().toLowerCase()
    const list = jobCards || []
    if (!q) return list.slice(0, 40)
    return list
      .filter((jc: any) => {
        const num = String(jc.jobNumber || jc.generalInfo?.jobNumber || '').toLowerCase()
        const client = String(jc.clientName || jc.generalInfo?.clientName || '').toLowerCase()
        return num.includes(q) || client.includes(q) || jc.id?.toLowerCase().includes(q)
      })
      .slice(0, 40)
  }, [jobCards, jobCardSearch])

  const handleLink = async () => {
    if (!job || !selectedJobCardId) return
    const jc = jobCards.find((j: any) => j.id === selectedJobCardId)
    if (!jc) {
      toast.error('Job card not found')
      return
    }
    const jobCardNumber = jc.jobNumber || jc.generalInfo?.jobNumber || jc.id
    setLinking(true)
    try {
      await linkJobToJobCard(job.id, jc.id, jobCardNumber)
      toast.success(`Linked ${job.contractNumber} to ${jobCardNumber}`)
      setShowLinkModal(false)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link job card')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlink = async () => {
    if (!job?.jobCardId) return
    const isApproved =
      (Number(job.paidApprovedTotal) || 0) > 0 || job.status === 'COMPLETED'
    if (isApproved && !isAdminOrManager) {
      toast.error('Only managers and admins can unlink an approved subcontract')
      return
    }
    if (!isApproved && !canWrite) {
      toast.error('You do not have permission to unlink')
      return
    }
    if (!window.confirm(`Unlink ${job.contractNumber} from ${job.jobCardNumber}?`)) return
    setLinking(true)
    try {
      await unlinkJobFromJobCard(job.id, { isAdminOrManager })
      toast.success('Unlinked from job card')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink')
    } finally {
      setLinking(false)
    }
  }

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!job || !files || files.length === 0) return
    if (!canWrite) {
      toast.error('You do not have permission to attach files')
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const url = await uploadExpenseAttachment(file, 'subcontractor-contracts')
        uploaded.push(url)
      }
      await updateJob(job.id, {
        attachmentUrls: [...attachments, ...uploaded],
      })
      toast.success(uploaded.length === 1 ? 'Attachment added' : `${uploaded.length} attachments added`)
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleRemoveAttachment = async (url: string) => {
    if (!job || !canWrite) return
    if (!window.confirm('Remove this attachment?')) return
    try {
      await updateJob(job.id, {
        attachmentUrls: attachments.filter((u) => u !== url),
      })
      toast.success('Attachment removed')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove attachment')
    }
  }

  const handleDownloadPdf = async () => {
    if (!job || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const generated = await generateScnContractPdf(job, jobPayments, appSettings)
      downloadBlob(generated)
      toast.success('SCN PDF downloaded')
    } catch (error) {
      console.error('Failed to generate SCN PDF:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate SCN PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loadingJobs && !job) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="size-8 animate-spin text-[#ff8903]" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/subcontractors/jobs')}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <p className="text-muted-foreground">SCN contract not found.</p>
      </div>
    )
  }

  const statusBadge = () => {
    if (job.status === 'COMPLETED') return <Badge className="bg-green-600 text-white">Completed</Badge>
    if (job.status === 'CANCELLED') return <Badge variant="destructive">Cancelled</Badge>
    if (job.status === 'DRAFT') return <Badge variant="outline">Draft</Badge>
    return <Badge className="bg-blue-600 text-white">Active</Badge>
  }

  const isApprovedForUnlink =
    (Number(job.paidApprovedTotal) || 0) > 0 || job.status === 'COMPLETED'
  const canUnlink =
    !!job.jobCardId &&
    ((isApprovedForUnlink && isAdminOrManager) || (!isApprovedForUnlink && canWrite))

  return (
    <div className="space-y-6 p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 shrink-0"
            onClick={() => router.push('/subcontractors/jobs')}
          >
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono text-[#ff8903]">
                {job.contractNumber}
              </h1>
              {statusBadge()}
            </div>
            <p className="text-muted-foreground text-sm truncate">{job.subcontractorName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-10 flex-1 sm:flex-none"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loadingJobPayments}
          >
            {downloadingPdf ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileText className="size-4 mr-1" />}
            {downloadingPdf ? 'Generating…' : 'Download PDF'}
          </Button>
          {job.jobCardId ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-10 flex-1 sm:flex-none"
                onClick={() => router.push(`/job-cards/${job.jobCardId}`)}
              >
                <FileText className="size-4 mr-1" /> {job.jobCardNumber}
              </Button>
              {canUnlink && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 sm:flex-none"
                  onClick={handleUnlink}
                  disabled={linking}
                >
                  <Unlink className="size-4 mr-1" /> Unlink
                </Button>
              )}
            </>
          ) : (
            canWrite && (
              <Button
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white h-10 w-full sm:w-auto"
                size="sm"
                onClick={() => setShowLinkModal(true)}
              >
                <Link2 className="size-4 mr-1" /> Link to Job Card
              </Button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <HardHat className="size-4" /> Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-semibold text-base">{job.description || 'No description'}</p>
            <p className="text-muted-foreground">Vendor: {job.subcontractorName}</p>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(Number(job.contractValue) || 0)}</p>
            <p className="text-xs text-muted-foreground">
              Paid approved: {formatCurrency(Number(job.paidApprovedTotal) || 0)}
            </p>

            <div className="pt-2 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Paperclip className="size-3.5" /> Attachments
                </p>
                {canWrite && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*,.pdf,application/pdf"
                      onChange={handleAttach}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      ) : (
                        <Plus className="size-3.5 mr-1" />
                      )}
                      Attach
                    </Button>
                  </>
                )}
              </div>

              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No contracts or documents attached yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((url, idx) => (
                    <li
                      key={url}
                      className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5"
                    >
                      <FileText className="size-3.5 text-[#ff8903] shrink-0" />
                      <span className="text-xs truncate flex-1 min-w-0" title={fileLabel(url, idx)}>
                        {fileLabel(url, idx)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => setViewerFile({ url, title: fileLabel(url, idx) })}
                        title="View"
                      >
                        <Eye className="size-4 text-muted-foreground" />
                      </Button>
                      {canWrite && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-red-500"
                          onClick={() => handleRemoveAttachment(url)}
                          title="Remove"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScnPaymentsPanel
              job={job}
              payments={jobPayments}
              loading={loadingJobPayments}
              canWrite={canWrite}
              isAccountant={isAccountant}
              isManager={isManager}
              userName={userName}
              createdBy={auth.user?.uid || ''}
              accountBalances={financeStore.finalBalances}
              balancesLoaded={financeBalancesLoaded}
            />
          </CardContent>
        </Card>
      </div>

      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-background w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold">Link to Job Card</h3>
              <p className="text-xs text-muted-foreground">
                Allocate {job.contractNumber} against a project job card
              </p>
            </div>
            <div>
              <Label>Search job cards</Label>
              <Input
                value={jobCardSearch}
                onChange={(e) => setJobCardSearch(e.target.value)}
                placeholder="Job number or client…"
                className="mb-2 h-10"
              />
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {filteredJobCards.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No job cards found</p>
                ) : (
                  filteredJobCards.map((jc: any) => {
                    const num = jc.jobNumber || jc.generalInfo?.jobNumber || jc.id
                    const client = jc.clientName || jc.generalInfo?.clientName || ''
                    return (
                      <button
                        key={jc.id}
                        type="button"
                        className={`w-full text-left px-3 py-3 text-xs border-b hover:bg-muted/40 min-h-11 ${
                          selectedJobCardId === jc.id ? 'bg-[#ff8903]/10' : ''
                        }`}
                        onClick={() => setSelectedJobCardId(jc.id)}
                      >
                        <span className="font-semibold font-mono">{num}</span>
                        {client && <span className="text-muted-foreground ml-2">{client}</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setShowLinkModal(false)}
                disabled={linking}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white h-10"
                onClick={handleLink}
                disabled={linking || !selectedJobCardId}
              >
                {linking ? <Loader2 className="size-4 animate-spin mr-2" /> : <Link2 className="size-4 mr-2" />}
                Link
              </Button>
            </div>
          </div>
        </div>
      )}

      <FileViewerModal
        isOpen={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url || ''}
        title={viewerFile?.title || 'Document'}
      />
    </div>
  )
}
