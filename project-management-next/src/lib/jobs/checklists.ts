export const PREPARATION_CHECKS = [
  'ownerAssigned',
  'scopeConfirmed',
  'siteDetails',
  'scheduleSet',
  'deliveryBudget',
  'tasksOrMilestones',
  'labourOrSubcontract',
  'materialsListed',
  'equipmentReviewed',
  'dependenciesNoted',
] as const

export const READY_CHECKS = [
  'financialClearance',
  'operationalReadiness',
] as const

export const COMPLETION_CHECKS = [
  'workEvidence',
  'customerHandover',
] as const

export const CLOSURE_CHECKS = [
  'materialsReconciled',
  'costsReconciled',
  'financialChecklist',
] as const

export type ChecklistKey =
  | typeof PREPARATION_CHECKS[number]
  | typeof READY_CHECKS[number]
  | typeof COMPLETION_CHECKS[number]
  | typeof CLOSURE_CHECKS[number]

export function missingChecks(required: readonly string[], completed?: Record<string, boolean>) {
  return required.filter(key => !completed?.[key])
}

export function canSubmitJob(completed?: Record<string, boolean>) {
  const missing = missingChecks(PREPARATION_CHECKS, completed)
  return { ok: missing.length === 0, missing }
}

export function canMarkReady(completed?: Record<string, boolean>) {
  const missing = missingChecks([...PREPARATION_CHECKS, ...READY_CHECKS], completed)
  return { ok: missing.length === 0, missing }
}

export function canCompleteJob(completed?: Record<string, boolean>) {
  const missing = missingChecks(COMPLETION_CHECKS, completed)
  return { ok: missing.length === 0, missing }
}

export function canCloseJob(input: {
  completed?: Record<string, boolean>
  outstandingBalance?: number
  blockUnpaid?: boolean
}) {
  const missing = missingChecks(CLOSURE_CHECKS, input.completed)
  if (input.blockUnpaid !== false && Number(input.outstandingBalance || 0) > 0) {
    return { ok: false, missing, unpaid: Number(input.outstandingBalance) }
  }
  return { ok: missing.length === 0, missing, unpaid: 0 }
}

export const CHECKLIST_LABELS: Record<string, string> = {
  ownerAssigned: 'Delivery owner assigned',
  scopeConfirmed: 'Accepted scope confirmed',
  siteDetails: 'Site / contact details captured',
  scheduleSet: 'Schedule set',
  deliveryBudget: 'Delivery budget reviewed',
  tasksOrMilestones: 'Tasks or milestones listed',
  labourOrSubcontract: 'Labour / subcontract needs noted',
  materialsListed: 'Materials listed',
  equipmentReviewed: 'Equipment reviewed',
  dependenciesNoted: 'Dependencies noted',
  financialClearance: 'Financial clearance confirmed',
  operationalReadiness: 'Operational readiness confirmed',
  workEvidence: 'Work evidence attached or recorded',
  customerHandover: 'Customer handover checked',
  materialsReconciled: 'Materials reconciled',
  costsReconciled: 'Costs reconciled',
  financialChecklist: 'Financial closure checklist done',
}
