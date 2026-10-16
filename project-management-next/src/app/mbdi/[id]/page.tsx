'use client'

import { accrualPayrollEnabled } from '@/lib/payroll/client'
import React, { useEffect, useMemo, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useMbdiStore } from '@/stores/mbdi-store'
import { useAuthStore } from '@/stores/auth-store'
import { uploadMbdiEvidence } from '@/lib/storage-helpers'
import { MbdiTaskChecklist } from '@/components/mbdi/task-checklist'
import { MbdiComments } from '@/components/mbdi/comments'
import { MbdiInitiativeChat } from '@/components/mbdi/initiative-chat'
import { MbdiStatusPill, MbdiTierPill, ProgressBar } from '@/features/mbdi/ui'
import { markInitiativeMbdiNotificationsRead } from '@/features/mbdi/utils/notify'
import { isMbdiInitiativeOwner } from '@/features/mbdi/utils/ownership'
import { useMbdiLinkedEmployeeId } from '@/features/mbdi/utils/use-linked-employee-id'
import {
  MBDI_TIERS,
  MBDI_APPROVER_ROLES,
  validateTierAmount,
  taskProgress,
  type MbdiClaim,
  type MbdiClaimStage,
  type MbdiTier,
} from '@/features/mbdi/types'
import { cn } from '@/lib/utils'

const fmtMoney = (n?: number) =>
  typeof n === 'number' ? `US$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—')

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' })

const CLAIM_STATUS_META: Record<string, { pill: string; dot: string }> = {
  PENDING: { pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  APPROVED: { pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  RETURNED: { pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dot: 'bg-red-500' },
}

export default function MbdiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const store = useMbdiStore()
  const { user, hasAnyRole } = useAuthStore()
  const { id: initiativeId } = use(params)
  const linkedEmployeeId = useMbdiLinkedEmployeeId()

  const isApprover = hasAnyRole([...MBDI_APPROVER_ROLES])

  useEffect(() => {
    store.fetchInitiatives()
    return () => store.cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user?.uid || !initiativeId) return
    void markInitiativeMbdiNotificationsRead(user.uid, initiativeId).catch((err) =>
      console.error('Failed to mark MBDI initiative notifications read:', err)
    )
  }, [user?.uid, initiativeId])

  const initiative = useMemo(
    () => store.initiatives.find((i) => i.id === initiativeId) || null,
    [store.initiatives, initiativeId]
  )

  const isOwner = isMbdiInitiativeOwner(initiative, user, { employeeId: linkedEmployeeId })

  // ── Approval dialog state ──────────────────────────────────────────────────
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [tier, setTier] = useState<MbdiTier>('BRONZE')
  const [rewardAmount, setRewardAmount] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')

  // ── Claim dialog state ─────────────────────────────────────────────────────
  const [showClaimDialog, setShowClaimDialog] = useState(false)
  const [claimStage, setClaimStage] = useState<MbdiClaimStage>('COMPLETION')
  const [claimEarningPeriod, setClaimEarningPeriod] = useState('')
  const [claimSummary, setClaimSummary] = useState('')
  const [claimCosts, setClaimCosts] = useState('')
  const [claimResults, setClaimResults] = useState('')
  const [claimRecommendation, setClaimRecommendation] = useState('')
  const [claimFiles, setClaimFiles] = useState<File[]>([])

  // ── Claim review dialog state ──────────────────────────────────────────────
  const [reviewClaim, setReviewClaim] = useState<MbdiClaim | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'RETURN'>('APPROVE')
  const [reviewNote, setReviewNote] = useState('')
  const [benefitGenerated, setBenefitGenerated] = useState('')

  // ── Edit scope dialog state ────────────────────────────────────────────────
  const [showEditScopeDialog, setShowEditScopeDialog] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editObjective, setEditObjective] = useState('')
  const [editEstimatedCost, setEditEstimatedCost] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editIndicators, setEditIndicators] = useState<string[]>([''])
  const [editTier, setEditTier] = useState<MbdiTier>('BRONZE')
  const [editRewardAmount, setEditRewardAmount] = useState('')

  const [processing, setProcessing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  if (store.loading && !initiative) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!initiative) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">Initiative not found.</p>
        <Button variant="outline" onClick={() => router.push('/mbdi')}>
          Back to Register
        </Button>
      </div>
    )
  }

  const tasks = initiative.tasks || []
  const verifiedProgress = taskProgress(tasks)
  const allTasksVerified =
    tasks.length > 0 && tasks.every((t) => t.status === 'VERIFIED')
  const canApproveProposal = isApprover && initiative.status === 'PENDING_APPROVAL'
  const canSubmitCompletionClaim =
    isOwner && initiative.status === 'APPROVED' && allTasksVerified
  const canSubmitPerformanceClaim = isOwner && initiative.status === 'COMPLETED'
  const pendingClaim = (initiative.claims || []).find((c) => c.status === 'PENDING') || null
  const scopeEditableStatus =
    initiative.status !== 'REJECTED' && initiative.status !== 'VALUE_CONFIRMED'
  const canEditScope =
    scopeEditableStatus &&
    (isApprover || (isOwner && initiative.status === 'PENDING_APPROVAL'))
  const canEditReward =
    isApprover &&
    !!initiative.tier &&
    initiative.status !== 'PENDING_APPROVAL' &&
    scopeEditableStatus &&
    !initiative.stage2Payment &&
    !initiative.stage3Payment
  const canDelete = isApprover && !initiative.stage2Payment && !initiative.stage3Payment
  const canCompose = isOwner || isApprover
  const displayProgress =
    initiative.status === 'VALUE_CONFIRMED'
      ? 100
      : initiative.status === 'COMPLETED' || initiative.status === 'PERFORMANCE_CLAIMED'
        ? 50
        : initiative.status === 'COMPLETION_CLAIMED'
          ? Math.max(50, verifiedProgress)
          : verifiedProgress

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDeleteInitiative = async () => {
    if (!user) return
    setProcessing(true)
    try {
      await store.deleteInitiative(initiative, {
        uid: user.uid,
        name: user.displayName || user.email || 'Manager',
      })
      toast.success('Initiative deleted.')
      setShowDeleteDialog(false)
      router.push('/mbdi')
    } catch (err: any) {
      console.error('Failed to delete MBDI:', err)
      toast.error(err?.message || 'Failed to delete initiative.')
    } finally {
      setProcessing(false)
    }
  }

  const openEditScope = () => {
    setEditTitle(initiative.title || '')
    setEditObjective(initiative.objective || '')
    setEditEstimatedCost(
      typeof initiative.estimatedCost === 'number' ? String(initiative.estimatedCost) : ''
    )
    setEditStartDate(initiative.startDate || '')
    setEditEndDate(initiative.endDate || '')
    setEditIndicators(
      initiative.successIndicators?.length ? [...initiative.successIndicators] : ['']
    )
    setEditTier(initiative.tier || 'BRONZE')
    setEditRewardAmount(
      typeof initiative.rewardAmount === 'number' ? String(initiative.rewardAmount) : ''
    )
    setShowEditScopeDialog(true)
  }

  const handleSaveScope = async () => {
    const cleanIndicators = editIndicators.map((s) => s.trim()).filter(Boolean)
    if (!editTitle.trim()) return toast.error('Title is required.')
    if (!editObjective.trim()) return toast.error('Objective is required.')
    if (
      editEstimatedCost === '' ||
      Number(editEstimatedCost) < 0 ||
      !Number.isFinite(Number(editEstimatedCost))
    ) {
      return toast.error('Enter a valid estimated cost.')
    }
    if (!editStartDate || !editEndDate) return toast.error('Set the timeline dates.')
    if (editEndDate < editStartDate) return toast.error('End date cannot be before the start date.')
    if (cleanIndicators.length === 0) return toast.error('Add at least one success indicator.')

    let rewardPatch: { tier?: MbdiTier; rewardAmount?: number } = {}
    if (canEditReward) {
      const amount = Number(editRewardAmount)
      const validationError = validateTierAmount(editTier, amount)
      if (validationError) return toast.error(validationError)
      rewardPatch = { tier: editTier, rewardAmount: amount }
    }

    setProcessing(true)
    try {
      await store.updateScope(
        initiative,
        {
          title: editTitle.trim(),
          objective: editObjective.trim(),
          expectedBenefit: initiative.expectedBenefit || '',
          estimatedCost: Number(editEstimatedCost),
          startDate: editStartDate,
          endDate: editEndDate,
          successIndicators: cleanIndicators,
          ...rewardPatch,
        },
        {
          uid: user!.uid,
          name: user!.displayName || user!.email || (isOwner ? 'Owner' : 'Manager'),
        }
      )
      toast.success('Initiative updated.')
      setShowEditScopeDialog(false)
    } catch (err: any) {
      console.error('Failed to update MBDI scope:', err)
      toast.error(err?.message || 'Failed to update initiative.')
    } finally {
      setProcessing(false)
    }
  }

  const handleApproveProposal = async () => {
    if (!user) return
    const amount = Number(rewardAmount)
    const validationError = validateTierAmount(tier, amount)
    if (validationError) return toast.error(validationError)

    setProcessing(true)
    try {
      const mbdiNo = await store.approveProposal(
        initiative.id,
        { tier, rewardAmount: amount },
        { uid: user.uid, name: user.displayName || user.email || 'Manager' }
      )
      toast.success(`Initiative approved as ${mbdiNo} (${MBDI_TIERS[tier].label}, ${fmtMoney(amount)}).`)
      setShowApproveDialog(false)
    } catch (err: any) {
      console.error('Failed to approve MBDI proposal:', err)
      toast.error(err?.message || 'Failed to approve proposal.')
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectProposal = async () => {
    if (!user) return
    if (!rejectionReason.trim()) return toast.error('Provide a reason for rejection.')
    setProcessing(true)
    try {
      await store.rejectProposal(
        initiative.id,
        { uid: user.uid, name: user.displayName || user.email || 'Manager' },
        rejectionReason.trim()
      )
      toast.success('Proposal rejected.')
      setShowRejectDialog(false)
    } catch (err: any) {
      console.error('Failed to reject MBDI proposal:', err)
      toast.error(err?.message || 'Failed to reject proposal.')
    } finally {
      setProcessing(false)
    }
  }

  const openClaimDialog = (stage: MbdiClaimStage) => {
    setClaimStage(stage)
    setClaimSummary('')
    setClaimCosts('')
    setClaimResults('')
    setClaimRecommendation('')
    setClaimFiles([])
    setShowClaimDialog(true)
  }

  const handleSubmitClaim = async () => {
    if (accrualPayrollEnabled && !claimEarningPeriod) return toast.error('Select the month this reward was earned.')
    if (!claimSummary.trim()) return toast.error('Summarise the work completed.')
    if (!claimResults.trim()) return toast.error('Describe the results achieved.')
    if (claimCosts !== '' && (!Number.isFinite(Number(claimCosts)) || Number(claimCosts) < 0))
      return toast.error('Enter a valid costs amount.')

    setProcessing(true)
    try {
      const evidenceUrls: string[] = []
      for (const file of claimFiles) {
        evidenceUrls.push(await uploadMbdiEvidence(file, initiative.id))
      }
      await store.submitClaim(initiative, {
        stage: claimStage,
        summary: claimSummary.trim(),
        ...(accrualPayrollEnabled ? { earningPeriod: claimEarningPeriod } : {}),
        evidenceUrls,
        costsIncurred: claimCosts === '' ? 0 : Number(claimCosts),
        resultsAchieved: claimResults.trim(),
        recommendation: claimRecommendation.trim(),
      })
      toast.success('Claim submitted for management assessment.')
      setShowClaimDialog(false)
    } catch (err: any) {
      console.error('Failed to submit MBDI claim:', err)
      toast.error(err?.message || 'Failed to submit claim.')
    } finally {
      setProcessing(false)
    }
  }

  const openReviewDialog = (claim: MbdiClaim, action: 'APPROVE' | 'RETURN') => {
    setReviewClaim(claim)
    setReviewAction(action)
    setReviewNote('')
    setBenefitGenerated('')
  }

  const handleReviewClaim = async () => {
    if (!user || !reviewClaim) return
    const reviewer = { uid: user.uid, name: user.displayName || user.email || 'Manager' }

    if (reviewAction === 'RETURN' && !reviewNote.trim()) {
      return toast.error('Explain what is missing so the owner can resubmit.')
    }
    if (reviewAction === 'APPROVE' && reviewClaim.stage === 'PERFORMANCE' && !benefitGenerated.trim()) {
      return toast.error('Record the measurable benefit generated before releasing the final 50%.')
    }

    setProcessing(true)
    try {
      if (reviewAction === 'APPROVE') {
        const payment = await store.approveClaim(initiative, reviewClaim.id, reviewer, {
          reviewNote: reviewNote.trim(),
          benefitGenerated: benefitGenerated.trim() || undefined,
        })
        toast.success(
          `Claim approved — ${fmtMoney(payment.amount)} posted to ${monthName(payment.month)} ${payment.year} payroll.`
        )
      } else {
        await store.returnClaim(initiative, reviewClaim.id, reviewer, reviewNote.trim())
        toast.success('Claim returned to the owner for rework.')
      }
      setReviewClaim(null)
    } catch (err: any) {
      console.error('Failed to review MBDI claim:', err)
      toast.error(err?.message || 'Failed to process the claim.')
    } finally {
      setProcessing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0 mt-0.5" onClick={() => router.push('/mbdi')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
            <Rocket className="size-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono text-red-600 dark:text-red-400">
                {initiative.mbdiNo || 'Pending Approval'}
              </h1>
              <MbdiStatusPill status={initiative.status} />
              {initiative.tier && (
                <MbdiTierPill tier={initiative.tier} amount={initiative.rewardAmount} />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{initiative.title}</p>
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 sm:min-w-[140px]">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {canEditScope && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/20"
                onClick={openEditScope}
              >
                <Pencil className="h-3.5 w-3.5" />
                {initiative.status === 'PENDING_APPROVAL' && isOwner && !isApprover
                  ? 'Edit Proposal'
                  : 'Edit Scope'}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-red-600 border-red-500/30 hover:bg-red-500/10"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full">
            <ProgressBar value={displayProgress} className="flex-1 sm:w-32 h-2.5" />
            <span
              className={cn(
                'text-sm font-black tabular-nums',
                displayProgress >= 100
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : displayProgress >= 50
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-orange-600 dark:text-orange-400'
              )}
            >
              {displayProgress}%
            </span>
          </div>
          {initiative.status === 'APPROVED' && (
            <p className="text-[10px] text-muted-foreground sm:text-right">
              {verifiedProgress}% tasks verified · Stage pay {initiative.completionPercent}%
            </p>
          )}
        </div>
      </div>

      {/* Owner awaiting task verification */}
      {isOwner && initiative.status === 'APPROVED' && !allTasksVerified && (
        <Card className="border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/10 shadow-sm">
          <CardContent className="py-4">
            <p className="font-semibold text-sm text-orange-700 dark:text-orange-300">Work through the checklist below.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tick each task when done. Management must verify every task before you can submit the Stage 2
              completion claim ({verifiedProgress}% verified
              {tasks.length ? ` — ${tasks.filter((t) => t.status === 'VERIFIED').length}/${tasks.length}` : ''}).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Owner actions */}
      {(canSubmitCompletionClaim || canSubmitPerformanceClaim) && (
        <Card
          className={cn(
            'shadow-sm',
            canSubmitCompletionClaim
              ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
              : 'border-fuchsia-500/30 bg-fuchsia-500/5 dark:bg-fuchsia-500/10'
          )}
        >
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div>
              <p className="font-semibold text-sm">
                {canSubmitCompletionClaim
                  ? 'All tasks verified — submit a completion claim for the first 50% reward.'
                  : 'First 50% paid — submit a performance claim once measurable results are available.'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Include a summary of work, evidence, costs incurred, results, and your payment recommendation.
              </p>
            </div>
            <Button
              className={cn(
                'gap-1.5 shrink-0 text-white',
                canSubmitCompletionClaim
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-fuchsia-600 hover:bg-fuchsia-700'
              )}
              onClick={() => openClaimDialog(canSubmitCompletionClaim ? 'COMPLETION' : 'PERFORMANCE')}
            >
              <FileText className="h-4 w-4" />
              {canSubmitCompletionClaim ? 'Submit Completion Claim' : 'Submit Performance Claim'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Management approval panel */}
      {canApproveProposal && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 shadow-sm">
          <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
            <div>
              <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                This proposal is awaiting management approval.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approving assigns an MBDI number and sets the reward tier. Work must not begin before approval.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowApproveDialog(true)}
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/20"
                onClick={() => setShowRejectDialog(true)}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejection notice */}
      {initiative.status === 'REJECTED' && (
        <Card className="border-red-500/30 bg-red-500/5 dark:bg-red-500/10 shadow-sm">
          <CardContent className="py-4">
            <p className="font-semibold text-sm text-red-700 dark:text-red-400">
              Proposal rejected by {initiative.rejectedByName || 'management'}.
            </p>
            {initiative.rejectionReason && (
              <p className="text-sm text-muted-foreground mt-1">{initiative.rejectionReason}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage 1 success indicators — owner ticks, manager verifies */}
      {user && initiative.status !== 'REJECTED' && (
        <MbdiTaskChecklist
          initiative={initiative}
          isOwner={isOwner}
          isApprover={isApprover}
          actor={{ uid: user.uid, name: user.displayName || user.email || 'User' }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Proposal */}
        <Card className="shadow-sm border-red-500/15 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-red-500/5 border-b border-red-500/10">
            <CardTitle className="text-base text-red-700 dark:text-red-300">Stage 1 — Proposal</CardTitle>
            {canEditScope && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/20"
                onClick={openEditScope}
              >
                <Pencil className="h-3.5 w-3.5" />
                {initiative.status === 'PENDING_APPROVAL' && isOwner && !isApprover
                  ? 'Edit Proposal'
                  : 'Edit Scope'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Initiative Owner</p>
              <p>{initiative.ownerName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Objective</p>
              <p className="whitespace-pre-wrap">{initiative.objective}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Estimated Cost</p>
                <p>{fmtMoney(initiative.estimatedCost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Start</p>
                <p>{initiative.startDate || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target End</p>
                <p>{initiative.endDate || '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Success Indicators</p>
              <p className="text-xs text-muted-foreground italic">
                Tracked in the Success Indicators checklist above — the owner ticks each one and management
                verifies it.
              </p>
            </div>
            {initiative.approvedByName && (
              <p className="text-xs text-muted-foreground">
                Approved by {initiative.approvedByName}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payments */}
        <Card className="shadow-sm border-emerald-500/15 overflow-hidden">
          <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10">
            <CardTitle className="text-base text-emerald-700 dark:text-emerald-300">Reward &amp; Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
                <p className="text-xs text-muted-foreground">Approved Reward</p>
                <p className="font-black text-lg text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {fmtMoney(initiative.rewardAmount)}
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground mb-1">Tier</p>
                {initiative.tier ? (
                  <MbdiTierPill tier={initiative.tier} />
                ) : (
                  <p>—</p>
                )}
                {initiative.tier && (
                  <p className="text-[11px] text-muted-foreground mt-1">{MBDI_TIERS[initiative.tier].description}</p>
                )}
              </div>
            </div>

            {[
              {
                label: 'First 50% — Successful Completion',
                payment: initiative.stage2Payment,
                accent: 'border-l-teal-500 bg-teal-500/5',
                paidCls: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20',
              },
              {
                label: 'Final 50% — Performance Assessment',
                payment: initiative.stage3Payment,
                accent: 'border-l-emerald-500 bg-emerald-500/5',
                paidCls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
              },
            ].map(({ label, payment, accent, paidCls }) => (
              <div key={label} className={cn('rounded-xl border border-l-4 p-3', accent)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{label}</p>
                  {payment ? (
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', paidCls)}>
                      <Wallet className="h-3 w-3" />
                      Posted
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20">
                      Not yet paid
                    </span>
                  )}
                </div>
                {payment && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtMoney(payment.amount)} on {monthName(payment.month)} {payment.year} payroll · posted by{' '}
                    {payment.postedByName} on {fmtDate(payment.postedAt)}
                  </p>
                )}
              </div>
            ))}

            {initiative.benefitGenerated && (
              <div>
                <p className="text-xs text-muted-foreground">Benefit Generated</p>
                <p className="whitespace-pre-wrap">{initiative.benefitGenerated}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Claims */}
      <Card className="shadow-sm border-orange-500/15 overflow-hidden">
        <CardHeader className="bg-orange-500/5 border-b border-orange-500/10">
          <CardTitle className="text-base text-orange-700 dark:text-orange-300">Claims</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {(initiative.claims || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No claims submitted yet.</p>
          ) : (
            <div className="space-y-4">
              {initiative.claims.map((claim) => {
                const claimMeta = CLAIM_STATUS_META[claim.status] || CLAIM_STATUS_META.PENDING
                return (
                <div
                  key={claim.id}
                  className={cn(
                    'rounded-xl border border-l-4 p-4 bg-background shadow-sm',
                    claim.stage === 'COMPLETION' ? 'border-l-teal-500' : 'border-l-fuchsia-500'
                  )}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {claim.stage === 'COMPLETION' ? 'Completion Claim (first 50%)' : 'Performance Claim (final 50%)'}
                      </p>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          claimMeta.pill
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', claimMeta.dot)} />
                        {claim.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Submitted {fmtDate(claim.submittedAt)}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Summary of Work Completed</p>
                      <p className="whitespace-pre-wrap">{claim.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Results Achieved</p>
                      <p className="whitespace-pre-wrap">{claim.resultsAchieved}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Costs Incurred</p>
                      <p>{fmtMoney(claim.costsIncurred)}</p>
                    </div>
                    {claim.recommendation && (
                      <div>
                        <p className="text-xs text-muted-foreground">Recommendation for Payment</p>
                        <p className="whitespace-pre-wrap">{claim.recommendation}</p>
                      </div>
                    )}
                  </div>

                  {claim.evidenceUrls.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Evidence</p>
                      <div className="flex flex-wrap gap-2">
                        {claim.evidenceUrls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                          >
                            <Paperclip className="h-3 w-3" />
                            Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {claim.reviewNote && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Review by {claim.reviewedByName || 'management'}: {claim.reviewNote}
                    </p>
                  )}

                  {isApprover && claim.status === 'PENDING' && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openReviewDialog(claim, 'APPROVE')}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve &amp; Pay {initiative.rewardAmount ? fmtMoney(initiative.rewardAmount / 2) : '50%'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/20"
                        onClick={() => openReviewDialog(claim, 'RETURN')}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Return for Rework
                      </Button>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {user && (
        <MbdiInitiativeChat initiative={initiative} canCompose={canCompose} />
      )}

      {user && (
        <MbdiComments
          initiative={initiative}
          actor={{ uid: user.uid, name: user.displayName || user.email || 'User' }}
          canCompose={canCompose}
        />
      )}

      {/* ── Approve proposal dialog ─────────────────────────────────────────── */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Initiative</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reward Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as MbdiTier)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MBDI_TIERS) as MbdiTier[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {MBDI_TIERS[t].label} — {MBDI_TIERS[t].description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mbdi-reward">Reward Amount (US$)</Label>
              <Input
                id="mbdi-reward"
                type="number"
                min="0"
                step="0.01"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                50% is released on completion, 50% after the performance assessment.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleApproveProposal} disabled={processing} className="gap-1.5">
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve Initiative
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject proposal dialog ──────────────────────────────────────────── */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mbdi-reject-reason">Reason</Label>
            <Textarea
              id="mbdi-reject-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this initiative is not approved..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRejectProposal} disabled={processing} className="gap-1.5">
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Submit claim dialog ─────────────────────────────────────────────── */}
      <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {claimStage === 'COMPLETION' ? 'Completion Claim (first 50%)' : 'Performance Claim (final 50%)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {accrualPayrollEnabled && <label className="block text-sm">Reward earning month<Input type="month" value={claimEarningPeriod} onChange={e => setClaimEarningPeriod(e.target.value)} /></label>}
            <div className="space-y-1.5">
              <Label htmlFor="claim-summary">Summary of Work Completed</Label>
              <Textarea
                id="claim-summary"
                value={claimSummary}
                onChange={(e) => setClaimSummary(e.target.value)}
                placeholder="What was delivered against the approved scope?"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-results">
                {claimStage === 'COMPLETION' ? 'Results Achieved' : 'Measurable Results Achieved'}
              </Label>
              <Textarea
                id="claim-results"
                value={claimResults}
                onChange={(e) => setClaimResults(e.target.value)}
                placeholder={
                  claimStage === 'COMPLETION'
                    ? 'e.g. Package negotiated, artwork submitted, contract signed, campaign launched'
                    : 'e.g. 14 qualified enquiries generated, 3 converted to sales worth US$2,400'
                }
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-costs">Costs Incurred (US$)</Label>
              <Input
                id="claim-costs"
                type="number"
                min="0"
                step="0.01"
                value={claimCosts}
                onChange={(e) => setClaimCosts(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-recommendation">Recommendation for Payment</Label>
              <Textarea
                id="claim-recommendation"
                value={claimRecommendation}
                onChange={(e) => setClaimRecommendation(e.target.value)}
                placeholder="Your case for releasing this payment..."
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-evidence">Evidence (contracts, screenshots, reports...)</Label>
              <Input
                id="claim-evidence"
                type="file"
                multiple
                onChange={(e) => setClaimFiles(Array.from(e.target.files || []))}
              />
              {claimFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {claimFiles.length} file{claimFiles.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClaimDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleSubmitClaim} disabled={processing} className="gap-1.5">
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Review claim dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!reviewClaim} onOpenChange={(open) => !open && setReviewClaim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'APPROVE' ? 'Approve Claim & Release Payment' : 'Return Claim for Rework'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {reviewAction === 'APPROVE' && (
              <p className="text-sm text-muted-foreground">
                Approving posts {initiative.rewardAmount ? fmtMoney(initiative.rewardAmount / 2) : '50% of the reward'}{' '}
                to {initiative.ownerName}&apos;s payroll as an allowance, paid with this month&apos;s salary.
              </p>
            )}
            {reviewAction === 'APPROVE' && reviewClaim?.stage === 'PERFORMANCE' && (
              <div className="space-y-1.5">
                <Label htmlFor="review-benefit">Benefit Generated (required)</Label>
                <Textarea
                  id="review-benefit"
                  value={benefitGenerated}
                  onChange={(e) => setBenefitGenerated(e.target.value)}
                  placeholder="Record the measurable value confirmed — e.g. advertising generated 14 qualified enquiries"
                  rows={3}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="review-note">
                {reviewAction === 'APPROVE' ? 'Review Note (optional)' : 'What needs rework? (required)'}
              </Label>
              <Textarea
                id="review-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewClaim(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleReviewClaim}
              disabled={processing}
              variant={reviewAction === 'APPROVE' ? 'default' : 'destructive'}
              className="gap-1.5"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              {reviewAction === 'APPROVE' ? 'Approve & Post Payment' : 'Return Claim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit scope dialog ───────────────────────────────────────────────── */}
      <Dialog open={showEditScopeDialog} onOpenChange={setShowEditScopeDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {initiative.status === 'PENDING_APPROVAL' && isOwner && !isApprover
                ? 'Edit Proposal'
                : 'Edit Initiative Scope'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-objective">Objective</Label>
              <Textarea
                id="edit-objective"
                value={editObjective}
                onChange={(e) => setEditObjective(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-cost">Estimated Cost (US$)</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editEstimatedCost}
                  onChange={(e) => setEditEstimatedCost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">Target End</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Success Indicators</Label>
              <div className="space-y-2">
                {editIndicators.map((value, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={value}
                      onChange={(e) =>
                        setEditIndicators((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                      }
                      placeholder={`Indicator ${idx + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 shrink-0"
                      onClick={() =>
                        setEditIndicators((prev) =>
                          prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev
                        )
                      }
                      disabled={editIndicators.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 mt-1"
                onClick={() => setEditIndicators((prev) => [...prev, ''])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Indicator
              </Button>
            </div>
            {canEditReward && (
              <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Reward (editable until first payment is posted)
                </p>
                <div className="space-y-1.5">
                  <Label>Reward Tier</Label>
                  <Select value={editTier} onValueChange={(v) => setEditTier(v as MbdiTier)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MBDI_TIERS) as MbdiTier[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {MBDI_TIERS[t].label} — {MBDI_TIERS[t].description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-reward">Reward Amount (US$)</Label>
                  <Input
                    id="edit-reward"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editRewardAmount}
                    onChange={(e) => setEditRewardAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {canEditReward
                ? 'Updating success indicators rebuilds the checklist while keeping progress on unchanged items.'
                : initiative.stage2Payment || initiative.stage3Payment
                  ? 'Reward tier and amount are locked after a payment has been posted. Scope updates do not change payments already posted.'
                  : 'Updating success indicators rebuilds the checklist while keeping progress on unchanged items.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditScopeDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveScope}
              disabled={processing}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete initiative?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently deletes{' '}
            <span className="font-semibold text-foreground">
              {initiative.mbdiNo || 'this proposal'}
            </span>
            {initiative.title ? ` — “${initiative.title}”` : ''}. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={processing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteInitiative} disabled={processing} className="gap-1.5">
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
