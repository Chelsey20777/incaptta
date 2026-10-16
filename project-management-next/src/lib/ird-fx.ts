import { normalizeAccountKey, type CanonicalAccount } from '@/lib/account-keys'

/** True when either leg of a fund transfer is the IRD (ZAR) account. */
export function transferInvolvesIrd(fromAccount: unknown, toAccount: unknown): boolean {
  const from = normalizeAccountKey(fromAccount)
  const to = normalizeAccountKey(toAccount)
  return from === 'IRD' || to === 'IRD'
}

/**
 * USD amount × ZAR-per-USD rate, rounded to cents.
 * Example: $100 @ 16.60 → R1,660.00
 */
export function usdToZar(amountUsd: number, exchangeRate: number): number {
  const usd = Math.abs(Number(amountUsd || 0))
  const rate = Number(exchangeRate || 0)
  if (!(usd > 0) || !(rate > 0)) return 0
  return Math.round(usd * rate * 100) / 100
}

/**
 * Absolute amount to post on one transfer leg.
 * IRD uses amountZar when present; otherwise falls back to amount (legacy USD-era rows).
 */
export function transferLegAmount(
  account: CanonicalAccount | 'UNKNOWN',
  transfer: { amount?: unknown; amountZar?: unknown }
): number {
  const usd = Math.abs(Number(transfer.amount || 0))
  if (account === 'IRD') {
    const zar = Number(transfer.amountZar)
    if (Number.isFinite(zar) && zar !== 0) return Math.abs(zar)
    return usd
  }
  return usd
}
