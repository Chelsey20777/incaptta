import type { Timestamp } from 'firebase/firestore'

// ── Reward tiers ─────────────────────────────────────────────────────────────

export type MbdiTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'STRATEGIC'

export interface TierConfig {
  label: string
  /** Minimum reward in USD. */
  min: number
  /** Maximum reward in USD. Null = no cap (management-determined). */
  max: number | null
  description: string
  badgeClass: string
}

export const MBDI_TIERS: Record<MbdiTier, TierConfig> = {
  BRONZE: {
    label: 'Bronze',
    min: 20,
    max: 50,
    description: 'US$20 – US$50',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  SILVER: {
    label: 'Silver',
    min: 50,
    max: 150,
    description: 'US$50 – US$150',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  },
  GOLD: {
    label: 'Gold',
    min: 150,
    max: 500,
    description: 'US$150 – US$500',
    badgeClass: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  },
  STRATEGIC: {
    label: 'Strategic',
    min: 0,
    max: null,
    description: 'Amount determined by management',
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
}

export function validateTierAmount(tier: MbdiTier, amount: number): string | null {
  const cfg = MBDI_TIERS[tier]
  if (!Number.isFinite(amount) || amount <= 0) return 'Reward amount must be greater than zero.'
  if (tier === 'STRATEGIC') return null
  if (amount < cfg.min || (cfg.max !== null && amount > cfg.max)) {
    return `${cfg.label} rewards must be between US$${cfg.min} and US$${cfg.max}.`
  }
  return null
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export type MbdiStatus =
  | 'PENDING_APPROVAL'   // Stage 1 submitted, awaiting management approval
  | 'REJECTED'
  | 'APPROVED'           // Stage 1 approved — work in progress (0%)
  | 'COMPLETION_CLAIMED' // Stage 2 claim submitted, awaiting review
  | 'COMPLETED'          // Stage 2 approved — first 50% posted to payroll
  | 'PERFORMANCE_CLAIMED'// Stage 3 claim submitted, awaiting review
  | 'VALUE_CONFIRMED'    // Stage 3 approved — remaining 50% posted (100%)

export const MBDI_STATUS_LABELS: Record<MbdiStatus, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  REJECTED: 'Rejected',
  APPROVED: 'In Progress',
  COMPLETION_CLAIMED: 'Completion Claimed',
  COMPLETED: 'Completed (50%)',
  PERFORMANCE_CLAIMED: 'Performance Claimed',
  VALUE_CONFIRMED: 'Value Confirmed (100%)',
}

/** OPEX-style translucent status pills: { pill, dot }. */
export const MBDI_STATUS_META: Record<MbdiStatus, { pill: string; dot: string }> = {
  PENDING_APPROVAL: {
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dot: 'bg-amber-500',
  },
  REJECTED: {
    pill: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    dot: 'bg-red-500',
  },
  APPROVED: {
    pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    dot: 'bg-orange-500',
  },
  COMPLETION_CLAIMED: {
    pill: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    dot: 'bg-orange-500',
  },
  COMPLETED: {
    pill: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    dot: 'bg-teal-500',
  },
  PERFORMANCE_CLAIMED: {
    pill: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20',
    dot: 'bg-fuchsia-500',
  },
  VALUE_CONFIRMED: {
    pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-500',
  },
}

/** @deprecated Prefer MBDI_STATUS_META — kept for any leftover className usage. */
export const MBDI_STATUS_CLASSES: Record<MbdiStatus, string> = {
  PENDING_APPROVAL: MBDI_STATUS_META.PENDING_APPROVAL.pill,
  REJECTED: MBDI_STATUS_META.REJECTED.pill,
  APPROVED: MBDI_STATUS_META.APPROVED.pill,
  COMPLETION_CLAIMED: MBDI_STATUS_META.COMPLETION_CLAIMED.pill,
  COMPLETED: MBDI_STATUS_META.COMPLETED.pill,
  PERFORMANCE_CLAIMED: MBDI_STATUS_META.PERFORMANCE_CLAIMED.pill,
  VALUE_CONFIRMED: MBDI_STATUS_META.VALUE_CONFIRMED.pill,
}

// ── Claims ───────────────────────────────────────────────────────────────────

export type MbdiClaimStage = 'COMPLETION' | 'PERFORMANCE'

export type MbdiClaimStatus = 'PENDING' | 'APPROVED' | 'RETURNED'

export interface MbdiClaim {
  id: string
  stage: MbdiClaimStage
  summary: string
  evidenceUrls: string[]
  costsIncurred: number
  resultsAchieved: string
  recommendation: string
  status: MbdiClaimStatus
  /** ISO string — serverTimestamp() cannot be used inside arrays. */
  submittedAt: string
  reviewedByUid?: string
  reviewedByName?: string
  reviewedAt?: string
  reviewNote?: string
}

// ── Tasks (in-initiative checklist) ──────────────────────────────────────────

export type MbdiTaskStatus =
  | 'PENDING'  // not done yet
  | 'DONE'     // owner ticked it — awaiting manager verification
  | 'VERIFIED' // manager confirmed completion — counts toward progress

export interface MbdiTask {
  id: string
  title: string
  status: MbdiTaskStatus
  /** ISO strings — serverTimestamp() cannot be used inside arrays. */
  createdAt: string
  createdByUid: string
  createdByName: string
  markedDoneAt?: string
  verifiedAt?: string
  verifiedByUid?: string
  verifiedByName?: string
  /** Manager note when rejecting a claimed-done task back to pending. */
  reviewNote?: string
}

export interface MbdiCommentMention {
  uid: string
  displayName: string
}

export interface MbdiCommentAttachment {
  name: string
  url: string
  contentType?: string
  size?: number
}

export interface MbdiComment {
  id: string
  authorUid: string
  authorName: string
  text: string
  createdAt?: Timestamp | { toDate?: () => Date } | string | null
  mentions?: MbdiCommentMention[]
  attachments?: MbdiCommentAttachment[]
}

export const MBDI_TASK_STATUS_LABELS: Record<MbdiTaskStatus, string> = {
  PENDING: 'To Do',
  DONE: 'Awaiting Verification',
  VERIFIED: 'Verified',
}

export const MBDI_TASK_STATUS_CLASSES: Record<MbdiTaskStatus, string> = {
  PENDING: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  DONE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  VERIFIED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
}

export const MBDI_TASK_STATUS_META: Record<MbdiTaskStatus, { pill: string; dot: string; accent: string }> = {
  PENDING: {
    pill: MBDI_TASK_STATUS_CLASSES.PENDING,
    dot: 'bg-slate-400',
    accent: 'border-l-slate-400',
  },
  DONE: {
    pill: MBDI_TASK_STATUS_CLASSES.DONE,
    dot: 'bg-amber-500',
    accent: 'border-l-amber-500',
  },
  VERIFIED: {
    pill: MBDI_TASK_STATUS_CLASSES.VERIFIED,
    dot: 'bg-emerald-500',
    accent: 'border-l-emerald-500',
  },
}

/** Verified tasks as a share of all tasks (0–100). */
export function taskProgress(tasks?: MbdiTask[]): number {
  if (!tasks || tasks.length === 0) return 0
  const verified = tasks.filter((t) => t.status === 'VERIFIED').length
  return Math.round((verified / tasks.length) * 100)
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface MbdiPayment {
  amount: number
  month: number
  year: number
  payrollId: string
  postedAt: string
  postedByUid: string
  postedByName: string
}

// ── Initiative ───────────────────────────────────────────────────────────────

export interface MbdiInitiative {
  id: string
  /** Assigned at approval, e.g. MBDI-2026-001. Empty while pending. */
  mbdiNo?: string
  title: string

  ownerId: string      // auth uid
  ownerName: string
  ownerEmail: string   // used to resolve the HR employee record for payroll

  // Stage 1 proposal
  objective: string
  expectedBenefit: string
  estimatedCost: number
  startDate: string    // yyyy-MM-dd
  endDate: string      // yyyy-MM-dd
  successIndicators: string[]

  // Classification (set by management at approval)
  tier?: MbdiTier
  rewardAmount?: number

  status: MbdiStatus
  completionPercent: 0 | 50 | 100
  /** Measurable value confirmed at Stage 3. */
  benefitGenerated?: string

  claims: MbdiClaim[]

  /** Manager-defined checklist the owner works through; verified tasks drive progress. */
  tasks?: MbdiTask[]

  /** First 50% — paid on successful completion (Stage 2). */
  stage2Payment?: MbdiPayment
  /** Remaining 50% — paid after performance assessment (Stage 3). */
  stage3Payment?: MbdiPayment

  approvedByUid?: string
  approvedByName?: string
  approvedAt?: Timestamp
  rejectedByUid?: string
  rejectedByName?: string
  rejectedAt?: Timestamp
  rejectionReason?: string

  /**
   * Due-reminder windows already fired, e.g. ['due-7', 'due-3'].
   * Prevents duplicate Rocket notifications from the daily cron.
   */
  dueRemindersSent?: string[]

  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Roles allowed to approve proposals, review claims, and trigger payments. */
export const MBDI_APPROVER_ROLES = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'] as const
