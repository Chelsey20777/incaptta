/** Payroll accounting uses integer cents internally; dates are Zimbabwe business dates. */
export type MoneyMap = Record<string, number>
export interface PayrollPolicy {
  id?: string; currency: string; effectiveFrom: string; effectiveTo: string; reference: string
  employeeNssaRate: number; employerNssaRate: number; nssaCap: number
  aidsRate: number; zimdefRate: number; wcifRate: number
  payeBands: Array<{ upTo: number; rate: number; deduct: number }>
}
export interface Journal {
  id?: string; payrollId: string; employeeId: string; currency: string; effectiveDate: string
  gross: number; employerCost: number; net: number; statutory: MoneyMap; recoveries: number
  sign: number; jobEarnings: number
}
export interface Settlement {
  id?: string; payrollId: string; employeeId: string; currency: string; paymentDate: string
  amount: number; kind: 'EMPLOYEE' | 'STATUTORY'; authority?: string
}
export function cents(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e10) throw new Error('Invalid monetary amount')
  return Math.round((n + Number.EPSILON) * 100)
}
export const money = (n: number) => cents(n) / 100
export function positive(n: unknown): number {
  const value = cents(n)
  if (value <= 0) throw new Error('Amount must be positive')
  return value / 100
}
export function businessDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Use a valid YYYY-MM-DD date')
  return value
}
export function today(): string {
  const override = process.env.PAYROLL_TODAY
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override
  return new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10)
}

export function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Salary drafts open on the 25th. Super Admin may catch up later in that same month. */
export function salaryDraftWindow(year: number, month: number, roles: string[] = [], now = today()) {
  const day = Number(now.slice(8, 10))
  if (now.slice(0, 7) !== periodKey(year, month)) {
    return { allowed: false, catchUp: false, reason: 'Salary drafts are generated on the 25th of the earning month.' }
  }
  if (day === 25) return { allowed: true, catchUp: false, reason: '' }
  if (roles.includes('SUPER_ADMIN') && day > 25) return { allowed: true, catchUp: true, reason: '' }
  return {
    allowed: false,
    catchUp: false,
    reason: day < 25
      ? 'Salary drafts can be generated on the 25th.'
      : 'Only a Super Admin can generate salary drafts after the 25th in the same month.',
  }
}

/** Approved staff rates post on the 15th. Super Admin may catch up later in that same month. */
export function staffRateWindow(year: number, month: number, roles: string[] = [], now = today()) {
  const day = Number(now.slice(8, 10))
  if (now.slice(0, 7) !== periodKey(year, month)) {
    return { allowed: false, catchUp: false, reason: 'Staff rates post into payroll on the 15th of the earning month.' }
  }
  if (day === 15) return { allowed: true, catchUp: false, reason: '' }
  if (roles.includes('SUPER_ADMIN') && day > 15) return { allowed: true, catchUp: true, reason: '' }
  return {
    allowed: false,
    catchUp: false,
    reason: day < 15
      ? 'Staff rates can be posted on the 15th.'
      : 'Only a Super Admin can post staff rates after the 15th in the same month.',
  }
}

export function recognitionOpens(year: number, month: number) {
  return `${periodKey(year, month)}-25`
}
export function periodEnd(year: number, month: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid earning period')
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}
export function assertStaging(environment?: string, project?: string) {
  if (environment !== 'staging' || project !== 'incaptta-pro-staging') throw new Error('Payroll accrual operations are restricted to incaptta-pro-staging')
}
export function validatePolicy(p: PayrollPolicy) {
  businessDate(p.effectiveFrom); businessDate(p.effectiveTo)
  if (p.effectiveFrom > p.effectiveTo || !/^[A-Z]{3}$/.test(p.currency) || !p.reference?.trim()) throw new Error('A currency, effective period and accountant review reference are required')
  for (const rate of [p.employeeNssaRate, p.employerNssaRate, p.aidsRate, p.zimdefRate, p.wcifRate]) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('Rates must be between zero and one')
  }
  if (cents(p.nssaCap) < 0 || !p.payeBands?.length) throw new Error('A nonnegative NSSA cap and PAYE bands are required')
  let prior = -1
  for (const b of p.payeBands) {
    if (!Number.isFinite(b.upTo) || b.upTo <= prior || !Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1 || cents(b.deduct) < 0) throw new Error('Invalid PAYE bands')
    prior = b.upTo
  }
}
export function calculatePayroll(gross: number, advance: number, other: number, policy: PayrollPolicy) {
  validatePolicy(policy)
  if ([gross, advance, other].some(n => cents(n) < 0)) throw new Error('Payroll amounts cannot be negative')
  const nssa = money(Math.min(gross, policy.nssaCap) * policy.employeeNssaRate)
  const taxable = Math.max(0, money(gross - nssa))
  const band = policy.payeBands.find(b => taxable <= b.upTo)
  if (!band) throw new Error('The reviewed PAYE bands do not cover these earnings')
  const paye = money(Math.max(0, taxable * band.rate - band.deduct))
  const aidsLevy = money(paye * policy.aidsRate)
  const employerNssa = money(Math.min(gross, policy.nssaCap) * policy.employerNssaRate)
  const zimdef = money(gross * policy.zimdefRate)
  const wcif = money(gross * policy.wcifRate)
  const deductions = money(nssa + paye + aidsLevy + advance + other)
  const netPay = money(gross - deductions)
  if (netPay < 0) throw new Error('Deductions exceed gross earnings')
  return { nssa, paye, aidsLevy, employerNssa, zimdef, wcif, deductions, netPay,
    employerCost: money(employerNssa + zimdef + wcif),
    statutory: { ZIMRA: money(paye + aidsLevy), NSSA: money(nssa + employerNssa), ZIMDEF: zimdef, WCIF: wcif } }
}
export function paymentStatus(net: number, paid: number): 'Unpaid' | 'Partially paid' | 'Paid' {
  if (cents(paid) > cents(net) || cents(paid) < 0) throw new Error('Settlement exceeds employee entitlement')
  return cents(paid) === cents(net) ? 'Paid' : cents(paid) > 0 ? 'Partially paid' : 'Unpaid'
}
export function allocateOldest(rows: Array<{ id: string; outstanding: number; effectiveDate: string; currency: string }>, amount: number, currency: string) {
  let remaining = cents(positive(amount))
  const allocations: Array<{ payrollId: string; amount: number }> = []
  for (const row of [...rows].filter(r => r.currency === currency).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id))) {
    const take = Math.min(remaining, Math.max(0, cents(row.outstanding)))
    if (take > 0) allocations.push({ payrollId: row.id, amount: take / 100 })
    remaining -= take
    if (!remaining) break
  }
  if (remaining) throw new Error('Payment exceeds outstanding arrears in this currency')
  return allocations
}
export function payrollTotals(journals: Journal[], payments: Settlement[], asOf: string, from = '2000-01-01') {
  businessDate(asOf); businessDate(from)
  const currencies: Record<string, { expense: number; opening: number; earnings: number; payments: number; employeePayable: number; statutoryPayable: number; jobEarnings: number }> = {}
  const bucket = (currency: string) => currencies[currency] ||= { expense: 0, opening: 0, earnings: 0, payments: 0, employeePayable: 0, statutoryPayable: 0, jobEarnings: 0 }
  for (const j of journals) {
    if (j.effectiveDate > asOf) continue
    const b = bucket(j.currency), sign = j.sign
    b.employeePayable += cents(j.net) * sign
    b.statutoryPayable += Object.values(j.statutory).reduce((s, v) => s + cents(v), 0) * sign
    if (j.effectiveDate < from) b.opening += cents(j.net) * sign
    else { b.expense += cents(j.gross + j.employerCost) * sign; b.earnings += cents(j.net) * sign; b.jobEarnings += cents(j.jobEarnings || 0) * sign }
  }
  for (const p of payments) {
    if (p.paymentDate > asOf) continue
    const b = bucket(p.currency)
    if (p.kind === 'STATUTORY') b.statutoryPayable -= cents(p.amount)
    else {
      b.employeePayable -= cents(p.amount)
      if (p.paymentDate < from) b.opening -= cents(p.amount)
      else b.payments += cents(p.amount)
    }
  }
  for (const b of Object.values(currencies)) for (const key of Object.keys(b) as Array<keyof typeof b>) b[key] /= 100
  return currencies
}

export interface PayrollControl {
  id: string; currency: string; recognized?: boolean; outstanding?: number
  statutory?: MoneyMap; statutoryPaid?: MoneyMap
}
export interface CashSettlement { id: string; amount: number; paymentRequestId?: string; paymentMethod?: string }
/** Independent control totals; never repairs records while reading a report. */
export function reconcilePayrollControls(
  journals: Array<Journal & { lines?: Array<{ debit: number; credit: number }> }>,
  payments: Array<Settlement & { requestId?: string; account?: string }>,
  payrolls: PayrollControl[], expenses: CashSettlement[], wallets: CashSettlement[],
) {
  const issues: Array<{ recordId: string; message: string }> = []
  for (const p of payrolls.filter(p => p.recognized)) {
    const total = payrollTotals(journals.filter(j => j.payrollId === p.id), payments.filter(s => s.payrollId === p.id), '2100-12-31')[p.currency]
    if (cents(total?.employeePayable || 0) !== cents(p.outstanding || 0)) issues.push({ recordId: p.id, message: 'Employee balance differs from journals and settlements' })
    const statutory = Object.entries(p.statutory || {}).reduce((s, [a, n]) => s + cents(n) - cents(p.statutoryPaid?.[a] || 0), 0)
    if (cents(total?.statutoryPayable || 0) !== statutory) issues.push({ recordId: p.id, message: 'Statutory balance differs from journals and remittances' })
  }
  for (const j of journals) if (j.lines && j.lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0) !== 0) issues.push({ recordId: j.id || j.payrollId, message: 'Payroll journal is unbalanced' })
  const requests = new Set(payments.map(p => p.requestId).filter((s): s is string => !!s))
  for (const requestId of requests) {
    const allocated = payments.filter(p => p.requestId === requestId)
    const sum = allocated.reduce((s, p) => s + cents(p.amount), 0)
    const expense = expenses.find(e => e.paymentRequestId === requestId)
    if (!expense || cents(expense.amount) !== sum) issues.push({ recordId: requestId, message: 'Payment allocations differ from funding-account cash entry' })
    if (allocated.some(p => p.account === 'SALARIES' || p.account === 'RESERVE')) {
      const wallet = wallets.find(w => w.id === `payroll-${requestId}`)
      if (!wallet || cents(wallet.amount) !== sum) issues.push({ recordId: requestId, message: 'Payment allocations differ from wallet movement' })
    }
  }
  for (const expense of expenses.filter(e => e.paymentRequestId)) if (!requests.has(expense.paymentRequestId!)) issues.push({ recordId: expense.id, message: 'Payroll cash entry has no settlement allocations' })
  return issues
}

export interface MonthlyPayrollPeer {
  gross: number; advanceDeduction: number; damagesDeduction: number; uniformDeduction: number
  nssa: number; paye: number; aidsLevy: number; employerNssa: number; zimdef: number; wcif: number
}
/** A supplement must not receive a second tax-free band or NSSA cap for the same employee/month. */
export function calculateMonthlyPayroll(gross: number, advance: number, other: number, policy: PayrollPolicy, peers: MonthlyPayrollPeer[]) {
  if (!peers.length) return calculatePayroll(gross, advance, other, policy)
  const sum = (key: keyof MonthlyPayrollPeer) => money(peers.reduce((n, p) => n + Number(p[key] || 0), 0))
  const total = calculatePayroll(money(gross + sum('gross')), money(advance + sum('advanceDeduction')), money(other + sum('damagesDeduction') + sum('uniformDeduction')), policy)
  const amounts = { nssa: money(total.nssa - sum('nssa')), paye: money(total.paye - sum('paye')), aidsLevy: money(total.aidsLevy - sum('aidsLevy')), employerNssa: money(total.employerNssa - sum('employerNssa')), zimdef: money(total.zimdef - sum('zimdef')), wcif: money(total.wcif - sum('wcif')) }
  if (Object.values(amounts).some(n => n < 0)) throw new Error('Monthly payroll adjustment needs coordinated statutory reconciliation')
  const deductions = money(amounts.nssa + amounts.paye + amounts.aidsLevy + advance + other)
  const netPay = money(gross - deductions)
  if (netPay < 0) throw new Error('Monthly deductions exceed this payroll entitlement')
  return { ...amounts, deductions, netPay, employerCost: money(amounts.employerNssa + amounts.zimdef + amounts.wcif), statutory: { ZIMRA: money(amounts.paye + amounts.aidsLevy), NSSA: money(amounts.nssa + amounts.employerNssa), ZIMDEF: amounts.zimdef, WCIF: amounts.wcif } }
}
