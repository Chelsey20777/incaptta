export const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export type LeadStage = (typeof LEAD_STAGES)[number]

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]

export const ENQUIRY_CHANNELS = [
  'WhatsApp',
  'Facebook',
  'email',
  'phone',
  'website',
  'walk-in',
  'other',
] as const
export type EnquiryChannel = (typeof ENQUIRY_CHANNELS)[number]

export const PARTY_TYPES = ['individual', 'business'] as const
export type PartyType = (typeof PARTY_TYPES)[number]

export interface EnquiryOwner {
  uid: string
  name: string
}

export interface EnquiryNextAction {
  summary: string
  dueAt: string
  ownerUid?: string
}

export function normalizeLeadPriority(value: unknown): LeadPriority {
  const raw = String(value || '').trim().toUpperCase()
  if (raw === 'HIGH') return 'HIGH'
  if (raw === 'LOW') return 'LOW'
  return 'MEDIUM'
}

export function hasResponseMethod(input: { email?: string; phone?: string; channel?: string }) {
  const email = String(input.email || '').trim()
  const phone = String(input.phone || '').trim()
  const channel = String(input.channel || '').trim()
  return Boolean(email || phone || channel === 'walk-in' || channel === 'other')
}

export function validateEnquiryCapture(input: {
  contactName?: string
  companyName?: string
  partyType?: string
  email?: string
  phone?: string
  channel?: string
  requirementSummary?: string
  nextActionSummary?: string
  nextActionDueAt?: string
}) {
  const errors: string[] = []
  if (!String(input.contactName || '').trim()) errors.push('Contact name is required')
  const partyType = String(input.partyType || 'individual')
  if (!PARTY_TYPES.includes(partyType as PartyType)) errors.push('Choose individual or business')
  if (partyType === 'business' && !String(input.companyName || '').trim()) {
    errors.push('Company is required for a business enquiry')
  }
  if (!ENQUIRY_CHANNELS.includes(String(input.channel || '') as EnquiryChannel)) {
    errors.push('A capture channel is required')
  }
  if (!hasResponseMethod(input)) {
    errors.push('At least one response method is required (email, phone, or walk-in/other channel)')
  }
  if (!String(input.requirementSummary || '').trim()) errors.push('Requirement summary is required')
  if (!String(input.nextActionSummary || '').trim()) errors.push('A next action is required')
  if (!String(input.nextActionDueAt || '').trim()) errors.push('Next action due date and time are required')
  return errors
}

export function canAdvanceLeadStage(current: string, next: string, evidence: {
  sentApprovedQuote?: boolean
  recordedNegotiation?: boolean
  recordedAcceptance?: boolean
  lostReason?: string
  contactAttempted?: boolean
  qualified?: boolean
}) {
  if (current === next) return { ok: true }
  if (next === 'Lost') {
    return String(evidence.lostReason || '').trim()
      ? { ok: true }
      : { ok: false, reason: 'A lost reason is required' }
  }
  if (next === 'Won' && !evidence.recordedAcceptance) {
    return { ok: false, reason: 'Won requires recorded customer acceptance of an approved quotation' }
  }
  if (next === 'Proposal' && !evidence.sentApprovedQuote) {
    return { ok: false, reason: 'Proposal requires an approved quotation that has actually been sent' }
  }
  if (next === 'Negotiation' && !evidence.recordedNegotiation) {
    return { ok: false, reason: 'Negotiation requires a recorded discussion of scope, price or terms' }
  }
  if (next === 'Contacted' && !evidence.contactAttempted) {
    return { ok: false, reason: 'Contacted requires a recorded contact attempt' }
  }
  if (next === 'Qualified' && !evidence.qualified) {
    return { ok: false, reason: 'Qualified requires confirmed requirement and quotation information' }
  }
  return { ok: true }
}

export function findCustomerMatches(
  customers: Array<{ id: string; name?: string; company?: string; companyName?: string; email?: string; phone?: string }>,
  input: { contactName?: string; companyName?: string; email?: string; phone?: string }
) {
  const email = String(input.email || '').trim().toLowerCase()
  const phone = String(input.phone || '').replace(/\D/g, '')
  const names = [input.contactName, input.companyName].map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
  return customers.filter(customer => {
    const customerEmail = String(customer.email || '').trim().toLowerCase()
    const customerPhone = String(customer.phone || '').replace(/\D/g, '')
    const customerNames = [customer.name, customer.company, customer.companyName]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
    if (email && customerEmail && email === customerEmail) return true
    if (phone && customerPhone && phone === customerPhone) return true
    return names.some(name => customerNames.includes(name))
  }).slice(0, 5)
}

export function closedLeadStats(leads: Array<{ stage?: string }>) {
  const closed = leads.filter(lead => lead.stage === 'Won' || lead.stage === 'Lost')
  const won = leads.filter(lead => lead.stage === 'Won')
  return {
    closedCount: closed.length,
    wonCount: won.length,
    winRate: closed.length > 0 ? Math.round((won.length / closed.length) * 100) : 0,
  }
}
