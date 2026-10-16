'use client'

import React, { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import {
  ArrowLeft,
  Download,
  LogIn,
  CheckCircle,
  XCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useContainerAccessStore } from '@/stores/container-access-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import type { ContainerAccessRequest, ContainerAccessLog } from '@/features/container-access/types'

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  APPROVED: 'bg-green-100 text-green-800 border border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-600 border border-gray-200',
}

const ACTION_CLASSES: Record<string, string> = {
  REQUEST_SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  CONTAINER_ACCESSED: 'bg-purple-100 text-purple-800',
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString()
}

export default function CAADetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const store = useContainerAccessStore()
  const adminStore = useAdminStore()
  const { user, claims, hasAnyRole } = useAuthStore()
  const { id: requestId } = use(params)

  const [request, setRequest] = useState<ContainerAccessRequest | null>(null)
  const [loading, setLoading] = useState(true)

  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showLogAccessDialog, setShowLogAccessDialog] = useState(false)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isLoggingAccess, setIsLoggingAccess] = useState(false)

  useEffect(() => {
    store.fetchLogs()
    if (user?.uid) {
      adminStore.fetchSettings(user.uid)
    }
    loadRequest()
    return () => {
      store.cleanup()
    }
  }, [requestId])

  async function loadRequest() {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
      if (!snap.exists()) {
        toast.error('Request not found')
        router.push('/container-access')
        return
      }
      setRequest({ id: snap.id, ...snap.data() } as ContainerAccessRequest)
    } catch (err: any) {
      toast.error('Failed to load request', { description: err.message })
      router.push('/container-access')
    } finally {
      setLoading(false)
    }
  }

  // ── Role-gated computed flags ──────────────────────────────────────────────

  const canApproveReject =
    hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) && request?.status === 'PENDING'

  const canCancel =
    request?.status === 'PENDING' && request?.requestedByUid === user?.uid

  const canDownloadPdf = request?.status === 'APPROVED' && !request?.pdfGenerated

  const canLogAccess = request?.status === 'APPROVED'

  // ── Logs for this request ──────────────────────────────────────────────────

  const requestLogs = useMemo<ContainerAccessLog[]>(() =>
    store.logs
      .filter((l) => l.requestId === requestId)
      .slice()
      .sort((a, b) => {
        const tA = (a.loggedAt as any)?.toDate?.()?.getTime?.() ?? 0
        const tB = (b.loggedAt as any)?.toDate?.()?.getTime?.() ?? 0
        return tB - tA
      }),
    [store.logs, requestId]
  )

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!request) return
    setIsProcessing(true)
    try {
      await store.approveRequest(
        requestId,
        request.requestNumber,
        request.containerName,
        {
          uid: user!.uid,
          name: user!.displayName || user!.email || 'Manager',
        },
        approvalNotes
      )
      const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
      setRequest({ id: snap.id, ...snap.data() } as ContainerAccessRequest)
      setShowApproveDialog(false)
      setApprovalNotes('')
      toast.success('Request approved successfully')
    } catch (err: any) {
      toast.error('Failed to approve request', { description: err.message })
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleReject() {
    if (!request || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason')
      return
    }
    setIsProcessing(true)
    try {
      await store.rejectRequest(
        requestId,
        request.requestNumber,
        request.containerName,
        {
          uid: user!.uid,
          name: user!.displayName || user!.email || 'Manager',
        },
        rejectionReason.trim()
      )
      const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
      setRequest({ id: snap.id, ...snap.data() } as ContainerAccessRequest)
      setShowRejectDialog(false)
      setRejectionReason('')
      toast.success('Request rejected')
    } catch (err: any) {
      toast.error('Failed to reject request', { description: err.message })
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleCancel() {
    if (!request) return
    setIsProcessing(true)
    try {
      const rolesRaw = claims?.roles
      const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')
      await store.cancelRequest(
        requestId,
        request.requestNumber,
        request.containerName,
        {
          uid: user!.uid,
          name: user!.displayName || user!.email || 'User',
          role,
        }
      )
      const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
      setRequest({ id: snap.id, ...snap.data() } as ContainerAccessRequest)
      toast.success('Request cancelled')
    } catch (err: any) {
      toast.error('Failed to cancel request', { description: err.message })
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleDownloadPdf() {
    if (!request) return
    setIsDownloading(true)
    try {
      const { generateCaaPdf } = await import(
        '@/features/container-access/utils/generate-caa-pdf'
      )
      await generateCaaPdf(request, adminStore.appSettings as any)
      if (!request.pdfGenerated) {
        await updateDoc(doc(db, 'containerAccessRequests', requestId), {
          pdfGenerated: true,
          updatedAt: serverTimestamp(),
        })
        setRequest((prev) => (prev ? { ...prev, pdfGenerated: true } : null))
      }
      toast.success('PDF downloaded')
    } catch (err: any) {
      toast.error('PDF generation failed', { description: err.message })
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleLogAccess() {
    if (!request) return
    setIsLoggingAccess(true)
    try {
      const rolesRaw = claims?.roles
      const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')
      await store.logContainerAccess(
        requestId,
        request.requestNumber,
        request.containerName,
        {
          uid: user!.uid,
          name: user!.displayName || user!.email || 'User',
          role,
        },
        logNotes.trim() || undefined
      )
      setLogNotes('')
      setShowLogAccessDialog(false)
      toast.success('Container access recorded')
    } catch (err: any) {
      toast.error('Failed to log access', { description: err.message })
    } finally {
      setIsLoggingAccess(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 gap-1"
        onClick={() => router.push('/container-access')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : request ? (
        <>
          {/* Header Card */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{request.requestNumber}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">{request.containerName}</p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLASSES[request.status] || ''}`}
                >
                  {request.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              {/* Job Card Reference */}
              {request.jobCardRef && (
                <div className="mb-4 flex items-center gap-2 text-sm bg-muted/40 border rounded-md px-3 py-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Job Card Ref
                  </span>
                  <span className="font-semibold text-primary">
                    {request.jobCardRef.jobNumber}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span>{request.jobCardRef.clientName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{request.jobCardRef.location}</span>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm mb-5">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Requestor
                  </p>
                  <p className="font-medium">{request.requestedByName}</p>
                  <p className="text-muted-foreground">{request.requestedByRole}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Submitted
                  </p>
                  <p>{formatTs(request.requestedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Container Location
                  </p>
                  <p>{request.containerLocation}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Access Date
                  </p>
                  <p>{request.accessDate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Time Window
                  </p>
                  <p>
                    {request.accessTimeFrom} – {request.accessTimeTo}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Purpose of Access
                  </p>
                  <p className="whitespace-pre-wrap">{request.purposeOfAccess}</p>
                </div>
              </div>

              {/* Approval details */}
              {request.status === 'APPROVED' && (
                <div className="border-t pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Approved By
                    </p>
                    <p>{request.approvedByName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Approved On
                    </p>
                    <p>{formatTs(request.approvedAt)}</p>
                  </div>
                  {request.approvalNotes && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        Approval Notes
                      </p>
                      <p>{request.approvalNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Rejection details */}
              {request.status === 'REJECTED' && (
                <div className="border-t pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Rejected By
                    </p>
                    <p>{request.rejectedByName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Rejected On
                    </p>
                    <p>{formatTs(request.rejectedAt)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Rejection Reason
                    </p>
                    <p className="text-red-700">{request.rejectionReason}</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t">
                {/* Manager: Approve / Reject */}
                {canApproveReject && (
                  <>
                    <Button className="gap-1.5" onClick={() => setShowApproveDialog(true)}>
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="gap-1.5"
                      onClick={() => setShowRejectDialog(true)}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </>
                )}

                {/* Requestor: Cancel */}
                {canCancel && (
                  <Button
                    variant="outline"
                    disabled={isProcessing}
                    className="gap-1.5"
                    onClick={handleCancel}
                  >
                    {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                    Cancel Request
                  </Button>
                )}

                {/* Download PDF */}
                {canDownloadPdf && (
                  <Button
                    variant="outline"
                    disabled={isDownloading}
                    className="gap-1.5"
                    onClick={handleDownloadPdf}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download Authorization PDF
                  </Button>
                )}

                {/* Log Container Access */}
                {canLogAccess && (
                  <Button
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => setShowLogAccessDialog(true)}
                  >
                    <LogIn className="h-4 w-4" />
                    Log Container Access
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Access Logs Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Log History</CardTitle>
            </CardHeader>
            <CardContent>
              {store.logsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : requestLogs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No log entries yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Date / Time</th>
                        <th className="text-left py-2 pr-4 font-medium">User</th>
                        <th className="text-left py-2 pr-4 font-medium">Role</th>
                        <th className="text-left py-2 pr-4 font-medium">Action</th>
                        <th className="text-left py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {formatTs(log.loggedAt)}
                          </td>
                          <td className="py-2 pr-4">{log.loggedByName}</td>
                          <td className="py-2 pr-4">{log.loggedByRole}</td>
                          <td className="py-2 pr-4">
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_CLASSES[log.action] || ''}`}
                            >
                              {log.action.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{log.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Access Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You are approving access to <strong>{request?.containerName}</strong> for{' '}
              <strong>{request?.requestedByName}</strong> on {request?.accessDate}.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="approvalNotes">Approval Notes (optional)</Label>
              <Textarea
                id="approvalNotes"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Any instructions or conditions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button disabled={isProcessing} onClick={handleApprove}>
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Access Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Provide a reason for rejecting this request.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rejectionReason">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this request being rejected?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isProcessing || !rejectionReason.trim()}
              onClick={handleReject}
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Container Access Dialog */}
      <Dialog open={showLogAccessDialog} onOpenChange={setShowLogAccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Container Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Record that you are physically opening <strong>{request?.containerName}</strong>.
              This will be saved as an access log entry.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="logNotes">Notes (optional)</Label>
              <Textarea
                id="logNotes"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="e.g. Retrieved item X for job card JC-2026-0012"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogAccessDialog(false)}>
              Cancel
            </Button>
            <Button disabled={isLoggingAccess} onClick={handleLogAccess}>
              {isLoggingAccess && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}