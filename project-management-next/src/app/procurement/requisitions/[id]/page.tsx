'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProcurementStore } from '@/stores/procurement-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  ShoppingCart,
  Trash2,
  Loader2,
  Building2,
  DollarSign,
  User,
  Calendar,
  FileText,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import type { PRStatus } from '@/features/procurement/types'

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  SUBMITTED: { label: 'Submitted', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  APPROVED: { label: 'Approved', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  REJECTED: { label: 'Rejected', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
}

export default function RequisitionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { requisitions, loadingRequisitions, fetchRequisitions, deleteRequisition } = useProcurementStore()
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (requisitions.length === 0) fetchRequisitions()
  }, [])

  const req = useMemo(() => requisitions.find(r => r.id === id), [requisitions, id])

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2 })

  const formatDate = (d: any) => {
    if (!d) return '—'
    const date = d?.toDate ? d.toDate() : new Date(d)
    return date.toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleDelete = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await deleteRequisition(id)
      toast.success('Requisition deleted')
      router.push('/procurement/requisitions')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loadingRequisitions && !req) {
    return (
      <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
        <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
          <Loader2 className="size-5 animate-spin text-[#ff8903]" />
        </header>
      </div>
    )
  }

  if (!req) {
    return (
      <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
        <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
          <h1 className="text-xl font-black">Not Found</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Requisition not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ChevronLeft className="size-6" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black tracking-tight">{req.prNumber}</h1>
            <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase ${statusConfig[req.status]?.color || ''}`}>
              {statusConfig[req.status]?.label || req.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{req.title}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-500 border-red-500/30"
            onClick={() => setShowDeleteConfirm(true)} disabled={deleting}>
            <Trash2 className="size-3" /> Delete
          </Button>
          {req.status !== 'APPROVED' && (
            <Button size="sm" className="h-8 text-xs gap-1 bg-[#ff8903] text-white font-bold"
              onClick={() => router.push(`/procurement/purchase-orders/new?prId=${id}`)}>
              <ShoppingCart className="size-3" /> Create PO
            </Button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 flex-1">
        {/* Metadata */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Title</span><p className="font-medium">{req.title}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Type</span><p className="font-medium">{req.procurementType?.replace('_', ' ')}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Department</span><p className="font-medium">{req.department || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Supplier</span><p className="font-medium">{req.supplierName || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Job Card</span><p className="font-medium">{req.jobCardTitle || req.jobCardId || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Requested By</span><p className="font-medium">{req.requestedByName || '—'}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Created</span><p className="font-medium">{formatDate(req.createdAt)}</p></div>
            <div><span className="text-[10px] font-bold uppercase text-muted-foreground">Updated</span><p className="font-medium">{formatDate(req.updatedAt)}</p></div>
          </CardContent>
        </Card>

        {req.description && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-black"><FileText className="size-4 inline mr-1" />Description</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{req.description}</p></CardContent>
          </Card>
        )}

        {/* Line Items */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-black">Line Items ({req.items.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-[10px] font-bold uppercase text-muted-foreground">
                    <th className="text-left p-2">Description</th>
                    <th className="text-center p-2">UOM</th>
                    <th className="text-center p-2">Qty</th>
                    <th className="text-right p-2">Unit Price</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-muted/20">
                      <td className="p-2 font-medium">{item.description}</td>
                      <td className="p-2 text-center text-muted-foreground">{item.uom}</td>
                      <td className="p-2 text-center">{item.qty}</td>
                      <td className="p-2 text-right">{fmt(item.unitCostPrice)}</td>
                      <td className="p-2 text-right font-bold">{fmt(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3 mt-2 border-t">
              <span className="text-xs font-black uppercase text-muted-foreground">Total Estimated Cost</span>
              <span className="text-lg font-black text-[#ff8903]">{fmt(req.totalEstimatedCost)}</span>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl">
            <CardContent className="p-6 text-center space-y-4">
              <AlertTriangle className="size-12 mx-auto text-red-500" />
              <h3 className="text-lg font-black">Delete Requisition?</h3>
              <p className="text-sm text-muted-foreground">This action cannot be undone. {req.linkedPoId ? 'This PR has a linked Purchase Order.' : ''}</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="size-4 animate-spin mr-1" /> : null} Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}