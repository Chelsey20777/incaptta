import { Employee, Payroll, PayrollApprovalStatus } from './hr-types'

function normalizeHumanName(value?: string | null): string {
  const v = (value || '').trim()
  if (!v) return ''

  // Filter out obvious machine identifiers accidentally saved in name fields.
  const noSpaces = !/\s/.test(v)
  const hasBothCases = /[a-z]/.test(v) && /[A-Z]/.test(v)
  const hasDigits = /\d/.test(v)
  const longToken = v.length >= 12
  const looksLikeUuid = /^[a-f0-9-]{20,}$/i.test(v)
  const looksLikeOpaqueToken = noSpaces && longToken && (hasBothCases || hasDigits)
  if (looksLikeUuid || looksLikeOpaqueToken) return ''

  return v
}

export const getEmpName = (emp?: Employee | null | any): string => {
  if (!emp) return '—'

  const combined = [emp.firstName, emp.lastName]
    .map((x: unknown) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')

  const candidates = [
    normalizeHumanName(emp.name),
    normalizeHumanName(emp.fullName),
    normalizeHumanName(emp.displayName),
    normalizeHumanName(combined),
  ]

  return candidates.find(Boolean) || 'Unnamed Employee'
}

/**
 * Basic salary or manual (non-job-card) allowances need a manager to approve
 * before payment. Pure job-card earnings were already approved on the job card.
 */
export function payrollNeedsManagerApproval(p: {
  basicSalary?: number
  allowances?: number
  jobCardEarnings?: number
}): boolean {
  const basic = Number(p.basicSalary || 0)
  const job = Number(p.jobCardEarnings || 0)
  const allowances = Number(p.allowances || 0)
  const manualAllowances = allowances - job
  return basic > 0.01 || manualAllowances > 0.01
}

/** Approval status to stamp when HR generates/regenerates a payroll record. */
export function approvalStatusOnGenerate(p: {
  basicSalary?: number
  allowances?: number
  jobCardEarnings?: number
  deductions?: number
}): { approvalStatus: PayrollApprovalStatus; approvalSource: 'JOB_CARD' | 'MANAGER' } {
  if (payrollNeedsManagerApproval(p) || Number(p.deductions || 0) > 0.01) {
    return { approvalStatus: 'PENDING_MANAGER', approvalSource: 'MANAGER' }
  }
  return { approvalStatus: 'APPROVED_MANAGER', approvalSource: 'JOB_CARD' }
}

export function manualPayrollAllowances(p: {
  allowances?: number
  jobCardEarnings?: number
}): number {
  return Math.max(0, Number(p.allowances || 0) - Number(p.jobCardEarnings || 0))
}

export function payrollGrossEarnings(p: {
  basicSalary?: number
  manualAllowances?: number
  jobCardEarnings?: number
}): number {
  return Number(p.basicSalary || 0) + Number(p.manualAllowances || 0) + Number(p.jobCardEarnings || 0)
}

/** Effective approval for UI / pay gate, including legacy records with no field. */
export function effectivePayrollApproval(p: Payroll): PayrollApprovalStatus {
  if (p.approvalStatus === 'APPROVED_MANAGER' || p.approvalStatus === 'PENDING_MANAGER') {
    return p.approvalStatus
  }
  // Legacy: treat basic/manual as pending; job-earnings-only as already approved.
  return payrollNeedsManagerApproval(p) ? 'PENDING_MANAGER' : 'APPROVED_MANAGER'
}

export const fmt = (n?: number | null): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

export const daysBetween = (start: string, end: string): number => {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000
  return isNaN(d) ? 0 : Math.round(d) + 1
}

export const calculateTaxDeductions = (gross: number) => {
  const nssa = Number((Math.min(gross, 700) * 0.045).toFixed(2))
  const taxable = gross - nssa

  let paye = 0
  if (taxable <= 100) {
    paye = 0
  } else if (taxable <= 300) {
    paye = (taxable * 0.20) - 20
  } else if (taxable <= 1000) {
    paye = (taxable * 0.25) - 35
  } else if (taxable <= 2000) {
    paye = (taxable * 0.30) - 85
  } else if (taxable <= 3000) {
    paye = (taxable * 0.35) - 185
  } else {
    paye = (taxable * 0.40) - 335
  }
  paye = Math.max(0, Number(paye.toFixed(2)))

  const aidsLevy = Number((paye * 0.03).toFixed(2))
  const zimdef = Number((gross * 0.01).toFixed(2))
  const wcif = Number((gross * 0.0125).toFixed(2))

  return { paye, aidsLevy, nssa, zimdef, wcif }
}
