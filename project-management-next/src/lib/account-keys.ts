/**
 * Canonical cashbook account keys and payment-method normalization.
 *
 * Balances are aggregated by account key, but historically writers stored
 * many spellings ("cash", "CASH", "EcoCash", "Bank", "eco cash", ...).
 * A value that fails to normalize must land in UNKNOWN — never silently in a
 * liquid account — so bad data is visible instead of mis-bucketed.
 */

export const CANONICAL_ACCOUNTS = [
  'BANK',
  'CASH',
  'ECOCASH',
  'IRD',
  'SALARIES',
  'RESERVE',
  'CREDIT',
  'INVENTORY',
] as const

export type CanonicalAccount = (typeof CANONICAL_ACCOUNTS)[number]

export const LIQUID_ACCOUNTS: CanonicalAccount[] = ['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES', 'RESERVE']

/** OPEX statuses that affect cash balances (deduct-at-approval model). */
export const COMMITTED_OPEX_STATUSES = ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'] as const

/** Accounts that may receive customer invoice payments. */
export const INVOICE_PAYMENT_ACCOUNTS = ['CASH', 'BANK', 'ECOCASH', 'RESERVE'] as const
export type InvoicePaymentAccount = (typeof INVOICE_PAYMENT_ACCOUNTS)[number]

const ALIASES: Record<string, CanonicalAccount> = {
  BANK: 'BANK',
  BANKACCOUNT: 'BANK',
  BANKTRANSFER: 'BANK',
  CASH: 'CASH',
  PETTYCASH: 'CASH',
  ECOCASH: 'ECOCASH',
  MOBILEMONEY: 'ECOCASH',
  IRD: 'IRD',
  IRDACCOUNT: 'IRD',
  SALARIES: 'SALARIES',
  SALARIESACCOUNT: 'SALARIES',
  RESERVE: 'RESERVE',
  RESERVEACCOUNT: 'RESERVE',
  CREDIT: 'CREDIT',
  INVENTORY: 'INVENTORY',
  CHEQUE: 'BANK',
}

/**
 * Normalize an invoice payment method to a receivable account.
 * Maps legacy spellings (BANK_TRANSFER, MOBILE_MONEY, CHEQUE) into the four
 * invoice payment accounts. Returns null when unrecognized.
 */
export function normalizeInvoicePaymentMethod(raw: unknown): InvoicePaymentAccount | null {
  const key = normalizeAccountKey(raw)
  if (key === 'CASH' || key === 'BANK' || key === 'ECOCASH' || key === 'RESERVE') return key
  return null
}

/**
 * Normalize a stored payment method / account name to a canonical account key.
 * Returns 'UNKNOWN' for empty or unrecognized values.
 */
export function normalizeAccountKey(raw: unknown): CanonicalAccount | 'UNKNOWN' {
  if (raw === null || raw === undefined) return 'UNKNOWN'
  const key = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '')
  if (!key) return 'UNKNOWN'
  return ALIASES[key] ?? 'UNKNOWN'
}

/** True when an entry's currency should be excluded from USD balance math. */
export function isNonUsd(currency: unknown): boolean {
  if (!currency) return false
  return String(currency).trim().toUpperCase() !== 'USD'
}
