import type { ApprovalStatus, ApprovalWorkflow } from '@/types'

/**
 * Approval workflow state machine utility
 * Enforces 2-step approval: SUBMITTED → REVIEW → APPROVED
 */

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  SUBMITTED: 'Submitted',
  PENDING_ACCOUNTANT: 'Pending Accountant',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed'
}

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  SUBMITTED: 'warning',
  PENDING_ACCOUNTANT: 'tertiary',
  UNDER_REVIEW: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  COMPLETED: 'success'
}

export function canTransitionTo(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): boolean {
  const transitions: Record<ApprovalStatus, ApprovalStatus[]> = {
    SUBMITTED: ['UNDER_REVIEW', 'PENDING_ACCOUNTANT', 'REJECTED'],
    PENDING_ACCOUNTANT: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: ['COMPLETED'],
    REJECTED: ['SUBMITTED'],
    COMPLETED: []
  }
  
  return transitions[currentStatus]?.includes(newStatus) || false
}

export function isEditable(status: ApprovalStatus): boolean {
  return ['SUBMITTED', 'PENDING_ACCOUNTANT', 'REJECTED'].includes(status)
}

export function isApproved(status: ApprovalStatus): boolean {
  return ['APPROVED', 'COMPLETED'].includes(status)
}

export function isPending(status: ApprovalStatus): boolean {
  return ['SUBMITTED', 'PENDING_ACCOUNTANT', 'UNDER_REVIEW'].includes(status)
}

export function createApprovalWorkflow(
  userId: string,
  status: ApprovalStatus = 'SUBMITTED'
): ApprovalWorkflow {
  return {
    status,
    submittedAt: new Date(),
    submittedBy: userId
  }
}

export function updateApprovalStatus(
  workflow: ApprovalWorkflow,
  newStatus: ApprovalStatus,
  userId: string,
  rejectionReason?: string
): ApprovalWorkflow {
  if (!canTransitionTo(workflow.status, newStatus)) {
    throw new Error(`Cannot transition from ${workflow.status} to ${newStatus}`)
  }

  const updated = { ...workflow }

  switch (newStatus) {
    case 'UNDER_REVIEW':
      updated.reviewedAt = new Date()
      updated.reviewedBy = userId
      break
    case 'APPROVED':
      updated.approvedAt = new Date()
      updated.approvedBy = userId
      break
    case 'REJECTED':
      updated.rejectionReason = rejectionReason
      break
    case 'SUBMITTED':
      // Resubmitting
      updated.submittedAt = new Date()
      updated.submittedBy = userId
      updated.rejectionReason = undefined
      break
  }

  updated.status = newStatus
  return updated
}
