import { toast } from 'sonner'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'

/** Soft warn when selecting an underfunded liquid account. Does not block. */
export function toastIfUnderfunded(opts: {
  accountRaw: unknown
  amount: number
  balances?: Record<string, number>
  balancesLoaded?: boolean
  context?: string
}): void {
  if (!opts.balancesLoaded) return
  const account = normalizeAccountKey(opts.accountRaw)
  if (account === 'UNKNOWN') return
  if (!LIQUID_ACCOUNTS.includes(account)) return
  const amount = Math.abs(Number(opts.amount || 0))
  if (amount <= 0) return
  const available = Number(opts.balances?.[account] || 0)
  if (available >= amount) return
  toast.warning(`Insufficient funds in ${account}`, {
    description: `Available: $${available.toFixed(2)}, Required: $${amount.toFixed(2)}.${
      opts.context ? ` ${opts.context}` : ' Choose a funded account before Approve/Post.'
    }`,
  })
}

/** Hard block before money moves. Returns true when the action should abort. */
export function blockIfUnderfunded(opts: {
  accountRaw: unknown
  amount: number
  balances?: Record<string, number>
  balancesLoaded?: boolean
}): boolean {
  if (!opts.balancesLoaded) {
    toast.error('Account balances are still loading. Wait a moment and try again.')
    return true
  }
  const account = normalizeAccountKey(opts.accountRaw)
  if (account === 'UNKNOWN') {
    toast.error('Select a valid payment account before approval')
    return true
  }
  if (!LIQUID_ACCOUNTS.includes(account)) {
    toast.error('Select a valid payment account before approval')
    return true
  }
  const amount = Math.abs(Number(opts.amount || 0))
  if (amount <= 0) return false
  const available = Number(opts.balances?.[account] || 0)
  if (available < amount) {
    toast.error(`Insufficient funds in ${account}`, {
      description: `Available: $${available.toFixed(2)}, Required: $${amount.toFixed(2)}.`,
    })
    return true
  }
  return false
}
