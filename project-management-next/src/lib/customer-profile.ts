export type CustomerType = 'COMPANY' | 'INDIVIDUAL'
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED'

const CRM_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DIRECTOR', 'SALES', 'ACCOUNTANT', 'TECHNICAL'])

export function isCrmStaff(roles: string[]): boolean {
  return roles.some((role) => CRM_ROLES.has(role))
}

export function isLeadConvertedToCustomer(lead?: {
  customerId?: string | null
  identityStatus?: string | null
} | null): boolean {
  if (!lead) return false
  return lead.identityStatus === 'CUSTOMER' || Boolean(String(lead.customerId || '').trim())
}

export function mapLeadToCustomerInput(
  lead: Record<string, unknown>,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const value = (key: string, fallback = '') => {
    if (extras[key] !== undefined && extras[key] !== null && String(extras[key]).trim() !== '') {
      return extras[key]
    }
    return lead[key] ?? fallback
  }
  const partyType = String(lead.partyType || (lead.companyName ? 'business' : 'individual')).toLowerCase()
  const isBusiness = partyType === 'business'
  const contactName = String(lead.contactName || '').trim()
  const companyName = String(lead.companyName || '').trim()
  const mappedName = isBusiness ? (companyName || contactName) : (contactName || companyName)
  const notes = extras.notes !== undefined
    ? extras.notes
    : (lead.requirementSummary || lead.notes || '')

  return {
    name: extras.name !== undefined && String(extras.name).trim() !== '' ? extras.name : mappedName,
    customerType: extras.customerType || (isBusiness ? 'COMPANY' : 'INDIVIDUAL'),
    email: value('email'),
    phone: value('phone'),
    primaryContactName: extras.primaryContactName !== undefined
      ? extras.primaryContactName
      : (isBusiness ? contactName : ''),
    address: extras.address ?? '',
    siteAddress: extras.siteAddress ?? '',
    taxId: extras.taxId ?? '',
    registrationNumber: extras.registrationNumber ?? '',
    creditLimit: extras.creditLimit ?? 0,
    notes,
    status: 'ACTIVE',
  }
}

export interface CustomerProfileInput {
  name: string
  customerType?: CustomerType
  email: string
  phone: string
  address: string
  siteAddress: string
  primaryContactName: string
  taxId: string
  registrationNumber: string
  creditLimit: number
  status: CustomerStatus
  notes: string
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

export function normalizeCustomerProfile(raw: Record<string, unknown>, creating: boolean): CustomerProfileInput {
  const value = (key: string) => String(raw[key] ?? '').trim()
  const name = value('name')
  if (!name) invalid('Customer name is required')

  const type = value('customerType')
  if (creating && type !== 'COMPANY' && type !== 'INDIVIDUAL') {
    invalid('Choose Company or Individual')
  }
  if (type && type !== 'COMPANY' && type !== 'INDIVIDUAL') {
    invalid('Invalid customer type')
  }

  const status = value('status') || 'ACTIVE'
  if (!['ACTIVE', 'INACTIVE', 'BLACKLISTED'].includes(status)) invalid('Invalid customer status')
  const creditLimit = Number(raw.creditLimit ?? 0)
  if (!Number.isFinite(creditLimit) || creditLimit < 0) invalid('Credit limit must be a non-negative number')
  const email = value('email').toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address')

  return {
    name,
    ...(type ? { customerType: type as CustomerType } : {}),
    email,
    phone: value('phone'),
    address: value('address'),
    siteAddress: value('siteAddress'),
    primaryContactName: value('primaryContactName'),
    taxId: value('taxId'),
    registrationNumber: value('registrationNumber'),
    creditLimit,
    status: status as CustomerStatus,
    notes: value('notes'),
  }
}

export function assertCustomerCanReceiveInvoice(status: unknown): void {
  // Historic customers without a status remain active until explicitly classified.
  if (status === undefined || status === null || status === '' || status === 'ACTIVE') return
  throw Object.assign(new Error('Only ACTIVE customers can receive a newly issued invoice'), { status: 409 })
}

export function recordBelongsToCustomer(
  record: { customerId?: string | null; customerName?: string | null },
  customerId: string,
  customerName: string | undefined,
  legacyNameIsUnique: boolean,
): boolean {
  if (record.customerId) return record.customerId === customerId
  return !!legacyNameIsUnique && !!customerName && record.customerName === customerName
}

export function sensitiveCustomerChanges(
  before: Record<string, unknown>,
  after: CustomerProfileInput,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  const oldStatus = before.status || 'ACTIVE'
  const oldLimit = Number(before.creditLimit || 0)
  if (oldStatus !== after.status) changes.status = { before: oldStatus, after: after.status }
  if (oldLimit !== after.creditLimit) changes.creditLimit = { before: oldLimit, after: after.creditLimit }
  return changes
}
