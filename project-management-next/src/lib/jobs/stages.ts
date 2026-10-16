export const JOB_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVAL_PENDING_ACCOUNTANT',
  'APPROVED_ACCOUNTANT',
  'APPROVAL_PENDING_MANAGER',
  'APPROVED_MANAGER',
  'COMPLETED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export function jobStatusLabel(status: string, workStartedAt?: string | null, readyToStartAt?: string | null) {
  if (status === 'APPROVED_MANAGER') {
    if (workStartedAt) return 'In Progress'
    if (readyToStartAt) return 'Ready to Start'
    return 'Approved'
  }
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    APPROVAL_PENDING_ACCOUNTANT: 'Accountant Review',
    APPROVED_ACCOUNTANT: 'Accountant Review',
    APPROVAL_PENDING_MANAGER: 'Manager Review',
    COMPLETED: 'Work Completed',
    CLOSED: 'Closed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
  }
  return labels[status] || status
}

export function jobApprovalDoesNotAuthoriseWork(status: string) {
  return status === 'APPROVED_MANAGER'
}
