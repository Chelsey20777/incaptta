/** Job-card ad-hoc expenses below this amount need accountant approval only. */
export const JOB_CARD_ADHOC_MANAGER_THRESHOLD = 200

const AUTO_APPROVAL_ROLES = new Set(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'])

/** Server-side policy for posting a job-card expense without manager sign-off. */
export function canPostJobCardAdHocAutoApproval(claims: { isActive?: unknown; roles?: unknown }): boolean {
  if (claims.isActive !== true) return false
  const roles = Array.isArray(claims.roles) ? claims.roles : claims.roles ? [claims.roles] : []
  return roles.some((role) => typeof role === 'string' && AUTO_APPROVAL_ROLES.has(role))
}

export function isJobCardAdHocAutoEligible(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount < JOB_CARD_ADHOC_MANAGER_THRESHOLD
}

export function autoApprovalRuleLabel(expense: { managerApprovedBy?: { actionType?: string } | string }): string {
  return typeof expense.managerApprovedBy === 'object' &&
    expense.managerApprovedBy?.actionType === 'POLICY_BYPASS_JOBCARD_UNDER_200'
    ? '< $200'
    : '< $300'
}
