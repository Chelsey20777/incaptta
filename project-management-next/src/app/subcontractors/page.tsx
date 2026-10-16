'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useSubcontractorsStore,
} from '@/stores/subcontractors-store'
import type {
  Subcontractor,
  SubcontractorPaymentTerms,
  SubcontractorStatus,
} from '@/features/subcontractors/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MasterDetailLayout } from '@/components/ui/MasterDetailLayout'
import { TrafficLightBadge } from '@/components/ui/TrafficLightBadge'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Search,
  Loader2,
  HardHat,
  Edit3,
  UserPlus,
  Info,
  Eye,
  Trash2,
  FileText,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { usePermissionsStore } from '@/stores/permissions-store'

const emptyForm = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  trade: '',
  paymentTerms: 'NET30' as SubcontractorPaymentTerms,
  bankDetails: '',
  status: 'ACTIVE' as SubcontractorStatus,
  notes: '',
}

export default function SubcontractorsPage() {
  const router = useRouter()
  const auth = useAuthStore()
  const { canAccessModule, load: loadPermissions, loading: permLoading } = usePermissionsStore()
  const {
    subcontractors,
    loading,
    fetchSubcontractors,
    addSubcontractor,
    updateSubcontractor,
    deleteSubcontractor,
  } = useSubcontractorsStore()

  const canWrite =
    auth.isSuperAdmin() ||
    canAccessModule(auth.getRoles(), 'subcontractorsWrite')

  const isAdmin = auth.isSuperAdmin() || auth.hasRole('ADMIN' as any)

  useEffect(() => {
    if (permLoading) loadPermissions()
  }, [permLoading, loadPermissions])

  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Subcontractor | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [formData, setFormData] = useState(emptyForm)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchSubcontractors()
  }, [fetchSubcontractors])

  const stats = useMemo(() => ({
    all: subcontractors.length,
    ACTIVE: subcontractors.filter((s) => s.status === 'ACTIVE').length,
    INACTIVE: subcontractors.filter((s) => s.status === 'INACTIVE').length,
  }), [subcontractors])

  const filtered = useMemo(() => {
    let list = [...subcontractors]
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.contactPerson?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.trade?.toLowerCase().includes(q)
      )
    }
    return list
  }, [subcontractors, searchQuery, statusFilter])

  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filtered.slice(startIndex, startIndex + itemsPerPage)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

  const openAddModal = () => {
    if (!canWrite) {
      toast.error('You do not have permission to add subcontractors')
      return
    }
    setEditing(null)
    setFormData(emptyForm)
    setShowModal(true)
  }

  const openEditModal = (sc: Subcontractor) => {
    if (!canWrite) {
      toast.error('You do not have permission to edit subcontractors')
      return
    }
    setEditing(sc)
    setFormData({
      name: sc.name || '',
      contactPerson: sc.contactPerson || '',
      email: sc.email || '',
      phone: sc.phone || '',
      address: sc.address || '',
      trade: sc.trade || '',
      paymentTerms: sc.paymentTerms || 'NET30',
      bankDetails: sc.bankDetails || '',
      status: sc.status || 'ACTIVE',
      notes: sc.notes || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (sc: Subcontractor) => {
    if (!isAdmin) {
      toast.error('Only admins can delete subcontractors')
      return
    }
    if (
      !window.confirm(
        `Delete "${sc.name}"? This cannot be undone. Subcontractors with active transactions cannot be deleted.`
      )
    ) {
      return
    }
    try {
      await deleteSubcontractor(sc.id)
      toast.success('Subcontractor deleted')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete subcontractor')
    }
  }

  const handleSubmit = async () => {
    if (!canWrite) {
      toast.error('You do not have permission to save subcontractors')
      return
    }
    if (!formData.name.trim()) {
      toast.error('Subcontractor name is required')
      return
    }
    setIsSubmitting(true)
    try {
      if (editing) {
        await updateSubcontractor(editing.id, formData)
        toast.success('Subcontractor updated')
      } else {
        await addSubcontractor({
          ...formData,
          createdBy: auth.user?.uid || '',
        })
        toast.success('Subcontractor added')
      }
      setShowModal(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save subcontractor')
    } finally {
      setIsSubmitting(false)
    }
  }

  const LeftPanel = (
    <div className="space-y-4">
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">
          Overview
        </h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div
            className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer"
            onClick={() => setStatusFilter('all')}
          >
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div
            className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer"
            onClick={() => setStatusFilter('ACTIVE')}
          >
            <p className="text-lg font-black text-green-500">{stats.ACTIVE}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Active</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">
          Status Filtering
        </h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Subcontractors', count: stats.all },
            { key: 'ACTIVE', label: 'Active', count: stats.ACTIVE },
            { key: 'INACTIVE', label: 'Inactive', count: stats.INACTIVE },
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
              <span
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-full border',
                  statusFilter === tab.key
                    ? 'bg-white/20 border-white/10 text-white'
                    : 'bg-muted border-border/40 text-muted-foreground'
                )}
              >
                {tab.count}
              </span>
            </Button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
          <Info className="size-3.5" /> About
        </h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          Manage vendors, create SCN contracts first, link them to job cards, and approve partial
          payments into OPEX. Open a profile for the vendor statement.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-9 rounded-xl text-xs font-bold gap-1.5"
          onClick={() => router.push('/subcontractors/guide')}
        >
          <BookOpen className="size-3.5" /> Module guideline
        </Button>
      </GlassCard>
    </div>
  )

  const RightPanel = (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-border/20 flex flex-col gap-3 bg-card/60 backdrop-blur-md sticky top-0 z-20 shrink-0">
        {/* Mobile filter chips — desktop uses left sidebar */}
        <div className="flex md:hidden gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
          {[
            { key: 'all', label: 'All', count: stats.all },
            { key: 'ACTIVE', label: 'Active', count: stats.ACTIVE },
            { key: 'INACTIVE', label: 'Inactive', count: stats.INACTIVE },
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

        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search by name, trade, contact..."
            className="pl-9 h-11 border bg-muted/20 w-full rounded-xl"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-600/90 text-white font-bold text-xs gap-1.5 h-11 rounded-xl w-full border-0"
            onClick={() => router.push('/subcontractors/jobs')}
          >
            <FileText className="size-4" /> SCN Contracts
          </Button>
          {canWrite && (
            <Button
              size="sm"
              className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold text-xs gap-1.5 h-11 rounded-xl w-full sm:col-auto"
              onClick={openAddModal}
            >
              <UserPlus className="size-4" /> Add Subcontractor
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-11 rounded-xl text-xs font-bold gap-1.5 w-full sm:col-span-2"
            onClick={() => router.push('/subcontractors/guide')}
          >
            <BookOpen className="size-4" /> How it works — guideline
          </Button>
        </div>
        <p className="hidden sm:block text-[10px] text-muted-foreground font-bold uppercase">
          Showing {filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto relative min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">
              Loading subcontractors...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <HardHat className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No Subcontractors Found</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden p-3 space-y-2">
              {paginated.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-xl border border-border/30 bg-card/50 p-3 active:bg-muted/40 cursor-pointer"
                  onClick={() => router.push(`/subcontractors/${sc.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{sc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[sc.trade, sc.contactPerson].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {sc.phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">{sc.phone}</p>
                      )}
                    </div>
                    <TrafficLightBadge status={sc.status || 'ACTIVE'} />
                  </div>
                  <div
                    className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="mr-auto text-[9px] font-bold px-1.5 py-0.5 rounded border bg-card/65 uppercase text-muted-foreground">
                      {sc.paymentTerms}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 rounded-lg"
                      onClick={() => router.push(`/subcontractors/${sc.id}`)}
                    >
                      <Eye className="size-4 text-muted-foreground" />
                    </Button>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-lg"
                        onClick={() => openEditModal(sc)}
                      >
                        <Edit3 className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-lg"
                        onClick={() => handleDelete(sc)}
                        title="Delete subcontractor"
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <table className="hidden md:table w-full text-xs text-left border-collapse border-0">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
                <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                  <th className="p-3">Name</th>
                  <th className="p-3">Trade</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3 text-center">Terms</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((sc) => (
                  <tr
                    key={sc.id}
                    className="border-b border-border/10 hover:bg-muted/40 transition-colors h-11 cursor-pointer"
                    onClick={() => router.push(`/subcontractors/${sc.id}`)}
                  >
                    <td className="p-3 font-semibold text-foreground">{sc.name}</td>
                    <td className="p-3 text-muted-foreground">{sc.trade || '—'}</td>
                    <td className="p-3 text-muted-foreground">{sc.contactPerson || '—'}</td>
                    <td className="p-3 text-muted-foreground">{sc.phone || '—'}</td>
                    <td className="p-3 text-center">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-card/65 uppercase">
                        {sc.paymentTerms}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <TrafficLightBadge status={sc.status || 'ACTIVE'} />
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg"
                          onClick={() => router.push(`/subcontractors/${sc.id}`)}
                        >
                          <Eye className="size-4 text-muted-foreground" />
                        </Button>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            onClick={() => openEditModal(sc)}
                          >
                            <Edit3 className="size-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            onClick={() => handleDelete(sc)}
                            title="Delete subcontractor"
                          >
                            <Trash2 className="size-4 text-red-500 hover:text-red-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-border/20 bg-card/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            className="rounded-xl h-10 text-xs font-bold min-w-[88px]"
          >
            Previous
          </Button>
          <span className="text-[10px] text-muted-foreground font-black">
            PAGE {currentPage} OF {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            className="rounded-xl h-10 text-xs font-bold min-w-[88px]"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
      <header className="sticky top-0 z-10 bg-card/60 backdrop-blur-md border-b border-border/20 px-4 py-3.5 flex items-center gap-4 shadow-sm shrink-0">
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight">Subcontractors</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {subcontractors.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
            Third-party contractors & statements
          </p>
        </div>
      </header>

      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout
        leftPanel={LeftPanel}
        rightPanel={RightPanel}
        leftClassName="hidden md:flex"
        rightClassName="w-full md:w-[75%]"
      />
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full max-w-md sm:max-w-2xl lg:max-w-3xl max-h-[90dvh] flex flex-col bg-card/95 backdrop-blur-lg border border-border/40 shadow-2xl rounded-t-3xl rounded-b-none sm:rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="pb-4 shrink-0">
              <CardTitle className="text-lg font-black tracking-tight">
                {editing ? 'Edit Subcontractor' : 'Register Subcontractor'}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Contact details, trade, and payment terms.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[min(70vh,calc(90dvh-8rem))] overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-left">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Apex Steel Works"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Trade / Specialty</Label>
                  <Input
                    value={formData.trade}
                    onChange={(e) => setFormData((f) => ({ ...f, trade: e.target.value }))}
                    placeholder="e.g. Welding, Electrical"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Contact Person</Label>
                  <Input
                    value={formData.contactPerson}
                    onChange={(e) => setFormData((f) => ({ ...f, contactPerson: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Bank Details</Label>
                  <Input
                    value={formData.bankDetails}
                    onChange={(e) => setFormData((f) => ({ ...f, bankDetails: e.target.value }))}
                    placeholder="Bank / account for remittance"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Payment Terms</Label>
                  <select
                    value={formData.paymentTerms}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        paymentTerms: e.target.value as SubcontractorPaymentTerms,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm font-semibold"
                  >
                    <option value="COD">COD</option>
                    <option value="NET30">NET 30</option>
                    <option value="NET60">NET 60</option>
                    <option value="NET90">NET 90</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Status</Label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData((f) => ({
                        ...f,
                        status: e.target.value as SubcontractorStatus,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm font-semibold"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Notes</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2 sticky bottom-0 bg-card/95 pb-1">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {editing ? 'Update' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
