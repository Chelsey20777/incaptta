'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSubcontractorsStore } from '@/stores/subcontractors-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MasterDetailLayout } from '@/components/ui/MasterDetailLayout'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { toast } from 'sonner'
import { uploadExpenseAttachment } from '@/features/jobCards/utils/financeUtils'
import {
  Search,
  Loader2,
  FileText,
  Plus,
  Eye,
  ArrowLeft,
  Users,
  Paperclip,
  Trash2,
  BookOpen,
} from 'lucide-react'
import type { SubcontractorJobStatus } from '@/features/subcontractors/types'

const emptyForm = {
  subcontractorId: '',
  description: '',
  contractValue: '',
}

export default function SubcontractorJobsPage() {
  const router = useRouter()
  const auth = useAuthStore()
  const { canAccessModule, load: loadPermissions, loading: permLoading } = usePermissionsStore()
  const {
    subcontractors,
    jobs,
    loadingJobs,
    fetchSubcontractors,
    fetchJobs,
    createJob,
    updateJob,
  } = useSubcontractorsStore()

  const canWrite =
    auth.isSuperAdmin() ||
    canAccessModule(auth.getRoles(), 'subcontractorsWrite')

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  useEffect(() => {
    fetchSubcontractors()
    fetchJobs()
  }, [fetchSubcontractors, fetchJobs])

  const activeSubs = useMemo(
    () => subcontractors.filter((s) => s.status !== 'INACTIVE'),
    [subcontractors]
  )

  const stats = useMemo(() => {
    const base = { all: jobs.length, ACTIVE: 0, COMPLETED: 0, DRAFT: 0, CANCELLED: 0 }
    for (const j of jobs) {
      const s = (j.status || 'ACTIVE') as keyof typeof base
      if (s in base && s !== 'all') base[s]++
    }
    return base
  }, [jobs])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false
      if (!q) return true
      return (
        j.contractNumber?.toLowerCase().includes(q) ||
        j.subcontractorName?.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q) ||
        j.jobCardNumber?.toLowerCase().includes(q)
      )
    })
  }, [jobs, searchQuery, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const statusBadge = (status?: SubcontractorJobStatus) => {
    if (status === 'COMPLETED') return <Badge className="bg-green-600 text-white text-[10px]">Completed</Badge>
    if (status === 'CANCELLED') return <Badge variant="destructive" className="text-[10px]">Cancelled</Badge>
    if (status === 'DRAFT') return <Badge variant="outline" className="text-[10px]">Draft</Badge>
    return <Badge className="bg-blue-600 text-white text-[10px]">Active</Badge>
  }

  const openCreate = () => {
    if (!canWrite) {
      toast.error('You do not have permission to create SCN contracts')
      return
    }
    setFormData({
      ...emptyForm,
      subcontractorId: activeSubs[0]?.id || '',
    })
    setPendingFiles([])
    setShowModal(true)
  }

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setPendingFiles((prev) => [...prev, ...Array.from(files)])
    e.target.value = ''
  }

  const handleCreate = async () => {
    if (!canWrite) return
    const sc = activeSubs.find((s) => s.id === formData.subcontractorId) ||
      subcontractors.find((s) => s.id === formData.subcontractorId)
    if (!sc) {
      toast.error('Select a subcontractor')
      return
    }
    const value = Number(formData.contractValue)
    if (!value || value <= 0) {
      toast.error('Enter a valid contract value')
      return
    }
    setIsSubmitting(true)
    try {
      const id = await createJob({
        subcontractorId: sc.id,
        subcontractorName: sc.name,
        description: formData.description.trim(),
        contractValue: value,
        createdBy: auth.user?.uid || '',
        createdByName: auth.profile?.name || auth.user?.displayName || auth.user?.email || '',
      })

      if (pendingFiles.length > 0) {
        const uploaded: string[] = []
        for (const file of pendingFiles) {
          const url = await uploadExpenseAttachment(file, 'subcontractor-contracts')
          uploaded.push(url)
        }
        await updateJob(id, { attachmentUrls: uploaded })
      }

      toast.success('SCN contract created')
      setShowModal(false)
      setPendingFiles([])
      router.push(`/subcontractors/jobs/${id}`)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create contract')
    } finally {
      setIsSubmitting(false)
    }
  }

  const LeftPanel = (
    <div className="space-y-4">
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">
          SCN Contracts
        </h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10">
            <p className="text-lg font-black">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10">
            <p className="text-lg font-black text-blue-500">{stats.ACTIVE}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Active</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">
          Filter
        </h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Contracts', count: stats.all },
            { key: 'ACTIVE', label: 'Active', count: stats.ACTIVE },
            { key: 'COMPLETED', label: 'Completed', count: stats.COMPLETED },
            { key: 'CANCELLED', label: 'Cancelled', count: stats.CANCELLED },
          ].map((tab) => (
            <Button
              key={tab.key}
              variant={statusFilter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'justify-between h-9 rounded-xl font-bold text-xs px-3',
                statusFilter === tab.key
                  ? 'bg-[#ff8903] text-white hover:bg-[#ff8903]/90'
                  : 'text-muted-foreground hover:bg-muted/40'
              )}
              onClick={() => {
                setStatusFilter(tab.key)
                setCurrentPage(1)
              }}
            >
              <span>{tab.label}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border">{tab.count}</span>
            </Button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 space-y-2" hoverable={false}>
        <Button
          variant="outline"
          className="w-full rounded-xl text-xs font-bold"
          onClick={() => router.push('/subcontractors')}
        >
          <Users className="size-4 mr-2" /> Vendor Registry
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-xl text-xs font-bold"
          onClick={() => router.push('/subcontractors/guide')}
        >
          <BookOpen className="size-4 mr-2" /> Module guideline
        </Button>
      </GlassCard>
    </div>
  )

  const RightPanel = (
    <Card className="border-border/40 shadow-sm overflow-hidden flex flex-col h-full">
      <CardHeader className="pb-3 border-b border-border/20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black tracking-tight flex items-center gap-2">
              <FileText className="size-5 text-[#ff8903]" /> SCN Contracts
            </CardTitle>
            <CardDescription className="text-xs hidden sm:block">
              Create subcontract jobs first, then link them to a job card
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 flex-1 sm:flex-none"
              onClick={() => router.push('/subcontractors')}
            >
              <ArrowLeft className="size-4 mr-1" /> Vendors
            </Button>
            {canWrite && (
              <Button
                size="sm"
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white rounded-xl h-10 flex-1 sm:flex-none"
                onClick={openCreate}
              >
                <Plus className="size-4 mr-1" /> New SCN
              </Button>
            )}
          </div>
        </div>

        <div className="flex md:hidden gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          {[
            { key: 'all', label: 'All', count: stats.all },
            { key: 'ACTIVE', label: 'Active', count: stats.ACTIVE },
            { key: 'COMPLETED', label: 'Done', count: stats.COMPLETED },
            { key: 'CANCELLED', label: 'Cancelled', count: stats.CANCELLED },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusFilter(tab.key)
                setCurrentPage(1)
              }}
              className={cn(
                'shrink-0 h-9 px-3 rounded-full text-xs font-bold border transition-colors',
                statusFilter === tab.key
                  ? 'bg-[#ff8903] text-white border-[#ff8903]'
                  : 'bg-muted/40 text-muted-foreground border-border/40'
              )}
            >
              {tab.label}
              <span className="ml-1.5 opacity-80">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 rounded-xl"
            placeholder="Search SCN #, vendor, job card…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-auto">
        {loadingJobs ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <FileText className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No SCN Contracts Found</p>
            {canWrite && (
              <Button className="mt-4 bg-[#ff8903] text-white h-11" onClick={openCreate}>
                Create first contract
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="md:hidden p-3 space-y-2">
              {paginated.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl border border-border/30 bg-card/50 p-3 active:bg-muted/40 cursor-pointer"
                  onClick={() => router.push(`/subcontractors/jobs/${job.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-sm text-[#ff8903]">
                        {job.contractNumber}
                      </p>
                      <p className="font-semibold text-sm truncate">{job.subcontractorName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {job.description || 'No description'}
                      </p>
                    </div>
                    {statusBadge(job.status)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="tabular-nums font-semibold">
                      {formatCurrency(Number(job.contractValue) || 0)}
                    </span>
                    <span className="tabular-nums text-green-600">
                      Paid {formatCurrency(Number(job.paidApprovedTotal) || 0)}
                    </span>
                    <span className="text-muted-foreground">
                      {job.jobCardNumber || 'Unlinked'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden md:table w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20">
                <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                  <th className="p-3">SCN #</th>
                  <th className="p-3">Subcontractor</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-right">Value</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3">Job Card</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border/10 hover:bg-muted/40 cursor-pointer h-11"
                    onClick={() => router.push(`/subcontractors/jobs/${job.id}`)}
                  >
                    <td className="p-3 font-mono font-semibold text-[#ff8903]">{job.contractNumber}</td>
                    <td className="p-3 font-semibold">{job.subcontractorName}</td>
                    <td className="p-3 text-muted-foreground truncate max-w-[180px]">{job.description || '—'}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">
                      {formatCurrency(Number(job.contractValue) || 0)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-green-600">
                      {formatCurrency(Number(job.paidApprovedTotal) || 0)}
                    </td>
                    <td className="p-3 text-muted-foreground">{job.jobCardNumber || 'Unlinked'}</td>
                    <td className="p-3 text-center">{statusBadge(job.status)}</td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => router.push(`/subcontractors/jobs/${job.id}`)}
                      >
                        <Eye className="size-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>

      {totalPages > 1 && (
        <div className="p-3 border-t flex justify-between">
          <Button
            size="sm"
            variant="outline"
            className="h-10 min-w-[88px]"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-10 min-w-[88px]"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </Card>
  )

  return (
    <>
      <MasterDetailLayout
        leftPanel={LeftPanel}
        rightPanel={RightPanel}
        leftClassName="hidden md:flex"
        rightClassName="w-full md:w-[75%]"
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-card w-full sm:max-w-2xl lg:max-w-3xl rounded-t-2xl sm:rounded-xl border border-border shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold">New SCN Contract</h3>
              <p className="text-xs text-muted-foreground">
                Contract number is assigned automatically (SCN-0001…)
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Subcontractor</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={formData.subcontractorId}
                  onChange={(e) => setFormData((f) => ({ ...f, subcontractorId: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {activeSubs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Scope of subcontracted work"
                />
              </div>
              <div>
                <Label>Contract Value ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.contractValue}
                  onChange={(e) => setFormData((f) => ({ ...f, contractValue: e.target.value }))}
                  placeholder="1000.00"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="size-3.5" /> Contract attachments
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,application/pdf"
                    onChange={handlePickFiles}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="size-3.5 mr-1" /> Attach file
                  </Button>
                </div>
                {pendingFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Optional — PDF or images (contracts, quotes, etc.)
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {pendingFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2 py-1.5"
                      >
                        <FileText className="size-3.5 text-[#ff8903] shrink-0" />
                        <span className="text-xs truncate flex-1 min-w-0" title={file.name}>
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-red-500"
                          disabled={isSubmitting}
                          onClick={() =>
                            setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowModal(false)
                  setPendingFiles([])
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                onClick={handleCreate}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Create Contract
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
