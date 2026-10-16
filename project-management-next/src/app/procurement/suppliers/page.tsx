'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
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
  Plus,
  ChevronLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Users,
  Edit3,
  CheckCircle2,
  XCircle,
  UserPlus,
  Info
} from 'lucide-react'
import type { Supplier, PaymentTerms, SupplierStatus } from '@/features/procurement/types'

export default function SuppliersPage() {
  const router = useRouter()
  const {
    suppliers,
    loadingSuppliers,
    fetchSuppliers,
    addSupplier,
    updateSupplier
  } = useProcurementStore()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    paymentTerms: 'NET30' as PaymentTerms,
    status: 'ACTIVE' as SupplierStatus
  })

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const stats = useMemo(() => {
    return {
      all: suppliers.length,
      ACTIVE: suppliers.filter(s => s.status === 'ACTIVE').length,
      INACTIVE: suppliers.filter(s => s.status === 'INACTIVE').length,
      COD: suppliers.filter(s => s.paymentTerms === 'COD').length,
      NET30: suppliers.filter(s => s.paymentTerms === 'NET30').length,
    }
  }, [suppliers])

  const filtered = useMemo(() => {
    let list = [...suppliers]
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.contactPerson?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
      )
    }
    return list
  }, [suppliers, searchQuery, statusFilter])

  // Paginated Suppliers
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filtered.slice(startIndex, startIndex + itemsPerPage)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

  const openAddModal = () => {
    setEditingSupplier(null)
    setFormData({ name: '', contactPerson: '', email: '', phone: '', address: '', paymentTerms: 'NET30', status: 'ACTIVE' })
    setShowModal(true)
  }

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setFormData({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      paymentTerms: supplier.paymentTerms || 'NET30',
      status: supplier.status || 'ACTIVE'
    })
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Supplier name is required')
      return
    }
    setIsSubmitting(true)
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, formData)
        toast.success('Supplier updated')
      } else {
        await addSupplier({
          ...formData,
          categories: [],
          notes: '',
          createdBy: ''
        })
        toast.success('Supplier added')
      }
      setShowModal(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save supplier')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Left Panel component
  const LeftPanel = (
    <div className="space-y-4">
      {/* Stats Summary */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-3">Supplier Overview</h3>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-card/30 p-2 rounded-xl border border-border/10 cursor-pointer" onClick={() => setStatusFilter('all')}>
            <p className="text-lg font-black text-foreground">{stats.all}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Total</p>
          </div>
          <div className="bg-green-500/5 p-2 rounded-xl border border-green-500/10 cursor-pointer" onClick={() => setStatusFilter('ACTIVE')}>
            <p className="text-lg font-black text-green-500">{stats.ACTIVE}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">Active</p>
          </div>
          <div className="bg-blue-500/5 p-2 rounded-xl border border-blue-500/10">
            <p className="text-lg font-black text-blue-500">{stats.NET30}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">NET 30</p>
          </div>
          <div className="bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
            <p className="text-lg font-black text-amber-500">{stats.COD}</p>
            <p className="text-[9px] uppercase font-bold text-muted-foreground">COD Terms</p>
          </div>
        </div>
      </GlassCard>

      {/* Filters */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2.5">Status Filtering</h3>
        <div className="flex flex-col gap-1.5">
          {[
            { key: 'all', label: 'All Suppliers', count: stats.all },
            { key: 'ACTIVE', label: 'Active Vendors', count: stats.ACTIVE },
            { key: 'INACTIVE', label: 'Inactive Vendors', count: stats.INACTIVE },
          ].map(tab => (
            <Button
              key={tab.key}
              variant={statusFilter === tab.key ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'justify-between h-9 rounded-xl font-bold text-xs px-3',
                statusFilter === tab.key ? 'bg-[#ff8903] text-white hover:bg-[#ff8903]/90' : 'text-muted-foreground hover:bg-muted/40'
              )}
              onClick={() => {
                setStatusFilter(tab.key)
                setCurrentPage(1)
              }}
            >
              <span>{tab.label}</span>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border', statusFilter === tab.key ? 'bg-white/20 border-white/10 text-white' : 'bg-muted border-border/40 text-muted-foreground')}>{tab.count}</span>
            </Button>
          ))}
        </div>
      </GlassCard>

      {/* Guide */}
      <GlassCard className="p-4" hoverable={false}>
        <h3 className="text-xs font-black uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5"><Info className="size-3.5" /> Supplier Terms</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Ensure supplier contact details are valid to receive automated Purchase Order PDF documents. Payment terms apply to invoice generation.
        </p>
      </GlassCard>
    </div>
  )

  // Right Panel component
  const RightPanel = (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sticky Table Header Section */}
      <div className="p-4 border-b border-border/20 flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/60 backdrop-blur-md sticky top-0 z-20 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search suppliers by name, contact..."
            className="pl-9 h-10 border bg-muted/20 w-full"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-[10px] text-muted-foreground font-bold uppercase mr-1">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
          </span>
          <Button
            size="sm"
            className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold text-xs gap-1.5 h-10 rounded-xl"
            onClick={openAddModal}
          >
            <UserPlus className="size-4" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-y-auto relative min-h-0">
        {loadingSuppliers ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-8 animate-spin text-[#ff8903]" />
            <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Loading suppliers...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-muted-foreground">
            <Building2 className="size-12 mx-auto mb-3 opacity-30 text-[#ff8903]" />
            <p className="text-sm font-black">No Suppliers Found</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left border-collapse border-0">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 border-b border-border/20 shadow-sm">
              <tr className="text-[10px] font-black uppercase text-muted-foreground tracking-wider h-10">
                <th className="p-3">Company Name</th>
                <th className="p-3">Contact Person</th>
                <th className="p-3">Email Address</th>
                <th className="p-3">Phone Line</th>
                <th className="p-3">Physical Address</th>
                <th className="p-3 text-center">Payment Terms</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(supplier => (
                <tr
                  key={supplier.id}
                  className="border-b border-border/10 hover:bg-muted/40 transition-colors h-11"
                >
                  <td className="p-3 font-semibold text-foreground">{supplier.name}</td>
                  <td className="p-3 text-muted-foreground">{supplier.contactPerson || '—'}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-44">{supplier.email || '—'}</td>
                  <td className="p-3 text-muted-foreground">{supplier.phone || '—'}</td>
                  <td className="p-3 text-muted-foreground truncate max-w-44">{supplier.address || '—'}</td>
                  <td className="p-3 text-center">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-card/65 uppercase">
                      {supplier.paymentTerms}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <TrafficLightBadge status={supplier.status || 'ACTIVE'} />
                  </td>
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openEditModal(supplier)}>
                      <Edit3 className="size-4 text-muted-foreground hover:text-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-border/20 bg-card/60 backdrop-blur-md flex items-center justify-between shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="rounded-xl h-8 text-xs font-bold"
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
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="rounded-xl h-8 text-xs font-bold"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
      {/* Sticky Main Header */}
      <header className="sticky top-0 z-10 bg-card/60 backdrop-blur-md border-b border-border/20 px-4 py-3.5 flex items-center gap-4 shadow-sm shrink-0">
        <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => router.push('/procurement')}>
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight">Suppliers Database</h1>
            <span className="bg-[#ff8903]/10 text-[#ff8903] text-[9px] font-black h-4.5 px-1.5 flex items-center justify-center rounded border border-[#ff8903]/25">
              {suppliers.length} TOTAL
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Vendor details & terms</p>
        </div>
      </header>

      {/* Master Detail Layout */}
      <div className="p-4 flex-1 overflow-hidden">
        <MasterDetailLayout leftPanel={LeftPanel} rightPanel={RightPanel} />
      </div>

      {/* Add/Edit Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card/95 backdrop-blur-lg border border-border/40 shadow-2xl rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight text-foreground">{editingSupplier ? 'Edit Supplier' : 'Register Supplier'}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">Fill in the company contact information & terms.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1.5 text-left">
                <Label className="text-xs font-black uppercase text-muted-foreground">Company Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ABC Trading" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5 text-left">
                <Label className="text-xs font-black uppercase text-muted-foreground">Contact Person</Label>
                <Input value={formData.contactPerson} onChange={(e) => setFormData(f => ({ ...f, contactPerson: e.target.value }))} placeholder="e.g. John Doe" className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="email@vendor.com" className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Phone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="+263 7XX XXX XXX" className="h-10 rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5 text-left">
                <Label className="text-xs font-black uppercase text-muted-foreground">Physical Address</Label>
                <Input value={formData.address} onChange={(e) => setFormData(f => ({ ...f, address: e.target.value }))} placeholder="Factory / street location details..." className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Payment Terms</Label>
                  <select value={formData.paymentTerms} onChange={(e) => setFormData(f => ({ ...f, paymentTerms: e.target.value as PaymentTerms }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm font-semibold text-foreground focus:outline-none"
                  >
                    <option value="COD">COD (Immediate Cash)</option>
                    <option value="NET30">NET 30 Days</option>
                    <option value="NET60">NET 60 Days</option>
                    <option value="NET90">NET 90 Days</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Status</Label>
                  <select value={formData.status} onChange={(e) => setFormData(f => ({ ...f, status: e.target.value as SupplierStatus }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm font-semibold text-foreground focus:outline-none"
                  >
                    <option value="ACTIVE">Active Vendor</option>
                    <option value="INACTIVE">Inactive Vendor</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" disabled={isSubmitting} onClick={handleSubmit}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {editingSupplier ? 'Update Vendor' : 'Add Vendor'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}