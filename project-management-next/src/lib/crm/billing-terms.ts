export const BILLING_ARRANGEMENTS = ['FULL_UPFRONT', 'DEPOSIT_BALANCE', 'MILESTONES', 'CREDIT'] as const
export type BillingArrangement = (typeof BILLING_ARRANGEMENTS)[number]

export interface BillingTerms {
  arrangement: BillingArrangement
  netDays?: number
  depositPercent?: number
  milestones?: Array<{ id: string; label: string; percent: number; trigger: 'ACCEPTANCE' | 'START' | 'COMPLETION' | 'CUSTOM' }>
}

export const DEFAULT_BILLING_TERMS: BillingTerms = {
  arrangement: 'FULL_UPFRONT',
  netDays: 0,
  depositPercent: 30,
  milestones: [
    { id: 'accept', label: 'On acceptance', percent: 50, trigger: 'ACCEPTANCE' },
    { id: 'complete', label: 'On completion', percent: 50, trigger: 'COMPLETION' },
  ],
}

export function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days))
  return date.toISOString().slice(0, 10)
}

export function invoiceDueDate(issuedOn: string, terms: BillingTerms = DEFAULT_BILLING_TERMS) {
  const netDays = Number(terms.netDays)
  if (terms.arrangement === 'FULL_UPFRONT') return issuedOn
  if (terms.arrangement === 'DEPOSIT_BALANCE') return issuedOn
  if (terms.arrangement === 'CREDIT') return addDays(issuedOn, Number.isFinite(netDays) ? netDays : 30)
  return issuedOn
}

export function initialBillableAmount(customerTotal: number, terms: BillingTerms = DEFAULT_BILLING_TERMS) {
  const total = Number(customerTotal) || 0
  if (terms.arrangement === 'DEPOSIT_BALANCE') {
    const percent = Number(terms.depositPercent)
    return Number((total * ((Number.isFinite(percent) ? percent : 30) / 100)).toFixed(2))
  }
  if (terms.arrangement === 'MILESTONES') {
    const first = (terms.milestones || []).find(item => item.trigger === 'ACCEPTANCE') || (terms.milestones || [])[0]
    return Number((total * ((Number(first?.percent) || 0) / 100)).toFixed(2))
  }
  return Number(total.toFixed(2))
}

export function draftInvoiceIssuable(terms: BillingTerms = DEFAULT_BILLING_TERMS) {
  return terms.arrangement === 'FULL_UPFRONT' || terms.arrangement === 'CREDIT' || terms.arrangement === 'DEPOSIT_BALANCE'
}

export function billingHoldReason(terms: BillingTerms = DEFAULT_BILLING_TERMS) {
  if (terms.arrangement === 'MILESTONES') {
    return 'Milestone invoice is held until the agreed trigger. Finance must issue it.'
  }
  if (terms.arrangement === 'CREDIT') {
    return 'Credit arrangement requires finance clearance before issuance.'
  }
  return 'Draft billing stub. Finance issues the invoice separately from delivery.'
}

export function resolveBillingTerms(input?: Partial<BillingTerms> | null): BillingTerms {
  return {
    ...DEFAULT_BILLING_TERMS,
    ...input,
    milestones: input?.milestones?.length ? input.milestones : DEFAULT_BILLING_TERMS.milestones,
  }
}

export function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function issueInvoiceFields(terms: BillingTerms = DEFAULT_BILLING_TERMS, issuedOn = todayIsoDate()) {
  return {
    status: 'ISSUED' as const,
    issuable: true,
    issuedOn,
    dueDate: invoiceDueDate(issuedOn, terms),
    issuedAt: new Date().toISOString(),
  }
}

export function sendInvoiceFields() {
  return {
    status: 'SENT' as const,
    sentAt: new Date().toISOString(),
  }
}

export function canIssueInvoice(status?: string, issuable = true) {
  const current = String(status || 'DRAFT').toUpperCase()
  return issuable && (current === 'DRAFT' || current === 'ISSUED')
}

export function canSendInvoice(status?: string) {
  const current = String(status || 'DRAFT').toUpperCase()
  return current === 'ISSUED' || current === 'SENT'
}
