'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useHrStore } from '@/stores/hr-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { payrollRequest } from '@/lib/payroll/client'
import { allocateOldest, calculateMonthlyPayroll, type MonthlyPayrollPeer, payrollTotals, periodEnd, recognitionOpens, salaryDraftWindow, staffRateWindow, today, type Journal, type PayrollPolicy, type Settlement } from '@/lib/payroll/core'
import { downloadPayslipPDF, loadPayrollPostingsForPayslip } from '@/features/hr/utils/generatePayslipPdf'
import type { Payroll } from '@/stores/hr-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Row extends Payroll {
  hasAdjustments?: boolean
  id: string; schemaVersion?: number; recognized?: boolean; revision?: number; currency?: string
  effectiveDate?: string; dueDate?: string; outstanding?: number; paidAmount?: number
  statutory?: Record<string, number>; statutoryPaid?: Record<string, number>; policyId?: string
}
interface Review {
  from: string; asOf: string
  payrolls: Row[]; policies: PayrollPolicy[]; journals: Journal[]; payments: Array<Settlement & { reference: string; evidence: string; account: string }>
  totals: ReturnType<typeof payrollTotals>
  exceptions: { legacy: Array<{ id: string; employeeName: string; status: string }>; unapproved: string[]; missingEmployees: Array<{ id: string; name: string }>; duplicates: string[]; discrepancies: Array<{ recordId: string; message: string }>; unsupportedCurrencies: string[] }
  reconciliation: { ambiguousPayments: string[]; orphanExpenses: string[]; orphanPostings: string[] }
}

const WORKFLOW_STEPS = [
  { id: 1, title: 'Staff rates on the 15th', detail: 'Approved job rates stay unposted until HR posts them on the 15th' },
  { id: 2, title: 'Salaries on the 25th', detail: 'Accountant generates salary drafts on the 25th' },
  { id: 3, title: 'Manager recognises', detail: 'From the 25th this books Salaries Payable. Unpaid amounts stay payable into the next month.' },
  { id: 4, title: 'Accountant records payment', detail: 'Settle outstanding from Salaries / cash accounts' },
] as const

const format = (n = 0, currency = 'USD') => new Intl.NumberFormat('en', { style: 'currency', currency }).format(n)
const field = 'rounded border p-2 bg-background w-full'

function isLegacy(p: Row) {
  return p.schemaVersion !== 2
}

function statusLabel(p: Row) {
  if (isLegacy(p)) return 'Legacy — review required'
  if (p.recognized) return p.status || 'Recognised'
  if (p.generated) return 'Draft — ready to recognise'
  return 'Needs draft'
}

function nextActionHint(p: Row, canRecognise: boolean) {
  if (isLegacy(p)) return 'Reconcile legacy payroll before using accrual actions'
  if (!p.recognized && !p.generated) {
    return 'Open Prepare this payroll, pick statutory policy, Save draft'
  }
  if (!p.recognized && p.generated) {
    return canRecognise
      ? 'Manager: Approve and recognise (books payable; does not pay cash)'
      : `Manager: Approve and recognise from ${recognitionOpens(p.year, p.month)}`
  }
  if (p.recognized && (p.outstanding || 0) > 0) {
    return 'Accountant: Record payment'
  }
  if (p.recognized) return 'Done'
  return ''
}

function canRecogniseDate(p: Row) {
  return today() >= recognitionOpens(p.year, p.month)
}

export function AccrualPayrollTab() {
  const hr = useHrStore(), auth = useAuthStore(), admin = useAdminStore()
  const roles = auth.getRoles()
  const canPrepare = roles.some(r => ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(r))
  const canApprove = roles.some(r => ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(r))
  const [review, setReview] = useState<Review | null>(null)
  const [asOf, setAsOf] = useState(today())
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [policyForm, setPolicyForm] = useState<PayrollPolicy>({ currency: 'USD', effectiveFrom: `${today().slice(0, 4)}-01-01`, effectiveTo: `${today().slice(0, 4)}-12-31`, reference: '', employeeNssaRate: 0, employerNssaRate: 0, nssaCap: 0, aidsRate: 0, zimdefRate: 0, wcifRate: 0, payeBands: [{ upTo: 0, rate: 0, deduct: 0 }] })
  const [policyConfirmed, setPolicyConfirmed] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const [draft, setDraft] = useState({ payrollId: '', employeeId: '', month: Number(today().slice(5, 7)), year: Number(today().slice(0, 4)), basicSalary: 0, allowances: 0, damagesDeduction: 0, uniformDeduction: 0, policyId: '', dueDate: today(), advanceInstallments: {} as Record<string, number> })
  const [showDraft, setShowDraft] = useState(false)
  const [payment, setPayment] = useState<null | { requestId: string; employeeId: string; currency: string; amount: number; paymentDate: string; account: string; reference: string; evidence: string; kind: 'EMPLOYEE' | 'STATUTORY'; payrollId?: string; authority?: string; forceSalaries?: boolean }>(null)
  const [adjustment, setAdjustment] = useState<{ payrollId: string; requestId: string; revision: number; basicSalary: number; allowances: number; reason: string } | null>(null)
  const [correction, setCorrection] = useState<{ payrollId: string; reason: string } | null>(null)
  const refresh = useCallback(async () => {
    try { const result = await payrollRequest(undefined, `?from=${from}&asOf=${asOf}`); setReview(result); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load payroll') }
  }, [asOf, from])
  useEffect(() => {
    let active = true
    payrollRequest(undefined, `?from=${from}&asOf=${asOf}`).then(result => {
      if (active) { setReview(result); setError('') }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load payroll') })
    return () => { active = false }
  }, [from, asOf])
  const command = async (body: Record<string, unknown>) => {
    setBusy(true)
    try { await payrollRequest(body); toast.success('Payroll record saved'); await refresh(); return true }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Payroll operation failed'); return false }
    finally { setBusy(false) }
  }
  const edit = (p?: Row) => {
    if (p) setDraft({ payrollId: p.id, employeeId: p.employeeId, month: p.month, year: p.year, basicSalary: p.basicSalary, allowances: Math.max(0, p.allowances - Number(p.jobCardEarnings || 0)), damagesDeduction: p.damagesDeduction || 0, uniformDeduction: p.uniformDeduction || 0, policyId: p.policyId || '', dueDate: p.dueDate || periodEnd(p.year, p.month), advanceInstallments: p.advanceInstallments || {} })
    else setDraft({ payrollId: '', employeeId: '', month: Number(asOf.slice(5, 7)), year: Number(asOf.slice(0, 4)), basicSalary: 0, allowances: 0, damagesDeduction: 0, uniformDeduction: 0, policyId: '', dueDate: asOf, advanceInstallments: {} })
    setShowDraft(true)
  }
  const openPayment = (p: Row, authority?: string) => {
    const jobCardOnly = Number(p.jobCardEarnings || 0) > 0 && Number(p.basicSalary || 0) === 0
    const defaultAccount = authority ? 'BANK' : (jobCardOnly || Number(p.jobCardEarnings || 0) > 0 ? 'SALARIES' : 'BANK')
    setPayment({
      requestId: crypto.randomUUID(),
      employeeId: p.employeeId,
      currency: p.currency || 'USD',
      amount: authority ? (p.statutory?.[authority] || 0) - (p.statutoryPaid?.[authority] || 0) : p.outstanding || 0,
      paymentDate: today(),
      account: defaultAccount,
      reference: '',
      evidence: '',
      kind: authority ? 'STATUTORY' : 'EMPLOYEE',
      forceSalaries: !authority && jobCardOnly,
      ...(authority ? { payrollId: p.id, authority } : {}),
    })
  }
  const download = async (p: Row) => {
    try {
      const emp = hr.employees.find(e => e.id === p.employeeId) || null
      await downloadPayslipPDF(p, emp, p.id, admin.appSettings, await loadPayrollPostingsForPayslip(p))
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Payslip failed') }
  }

  const activeStep = useMemo(() => {
    if (!review) return canPrepare ? 2 : 1
    const rows = review.payrolls.filter((p) => !isLegacy(p))
    if (rows.some((p) => p.recognized && (p.outstanding || 0) > 0)) return 4
    if (rows.some((p) => !p.recognized && p.generated)) return 3
    if (rows.some((p) => !p.recognized && !p.generated)) return 2
    if (rows.some((p) => p.recognized)) return 4
    return 1
  }, [review, canPrepare])

  const policy = review?.policies.find(p => p.id === draft.policyId)
  const existing = review?.payrolls.find(p => draft.payrollId ? p.id === draft.payrollId : p.employeeId === draft.employeeId && p.month === draft.month && p.year === draft.year && !p.id.includes('_JOB_') && !p.id.includes('_MBDI_'))
  let preview: ReturnType<typeof calculateMonthlyPayroll> | null = null, previewError = ''
  if (policy) try { preview = calculateMonthlyPayroll(draft.basicSalary + draft.allowances + Number(existing?.jobCardEarnings || 0), Object.values(draft.advanceInstallments).reduce((s, n) => s + n, 0), draft.damagesDeduction + draft.uniformDeduction, policy, (review?.payrolls.filter(p => p.recognized && p.id !== existing?.id && p.employeeId === draft.employeeId && p.month === draft.month && p.year === draft.year && p.currency === policy.currency) || []) as unknown as MonthlyPayrollPeer[]) } catch (e) { previewError = String(e) }
  let allocations: Array<{ payrollId: string; amount: number }> = [], allocationError = ''
  if (payment?.kind === 'EMPLOYEE' && review) try {
    allocations = allocateOldest(review.payrolls.filter(p => p.recognized && p.employeeId === payment.employeeId && p.effectiveDate! <= payment.paymentDate).map(p => ({ id: p.id, outstanding: p.outstanding || 0, currency: p.currency!, effectiveDate: p.effectiveDate! })), payment.amount, payment.currency)
  } catch (e) { allocationError = String(e) }

  const draftEmployee = hr.employees.find((e) => e.id === draft.employeeId)
  const draftEmployeeName = draftEmployee
    ? hr.getEmpName(draftEmployee)
    : existing?.employeeName || ''
  const draftFormTitle = draft.payrollId || existing
    ? `Prepare payroll — ${draftEmployeeName || 'Employee'} · ${draft.month}/${draft.year}`
    : 'New payroll draft'

  return <div className="space-y-6">
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Payroll and salary arrears</h2>
        <p className="text-sm text-muted-foreground">Staging only. Earn → draft → recognise (books) → pay (cash) are separate steps.</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {WORKFLOW_STEPS.map((step) => {
          const active = activeStep === step.id
          const done = activeStep > step.id
          return (
            <li
              key={step.id}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                active && 'border-emerald-500/50 bg-emerald-500/10 shadow-sm',
                done && !active && 'border-border/60 bg-muted/30',
                !active && !done && 'border-border/40 opacity-80'
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[10px] font-black',
                  active ? 'bg-emerald-600 text-white' : done ? 'bg-muted-foreground/30 text-foreground' : 'bg-muted text-muted-foreground'
                )}>{step.id}</span>
                <span className="font-semibold">{step.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground pl-7">{step.detail}</p>
            </li>
          )
        })}
      </ol>
    </div>

    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">Period start<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="text-sm">As at<Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
      <Button variant="outline" onClick={refresh}>Refresh</Button>
      {canPrepare && (
        <>
          <Button variant="outline" onClick={() => edit()} disabled={!salaryDraftWindow(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), roles).allowed} title={salaryDraftWindow(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), roles).reason || 'Generate a salary draft'}>New payroll draft</Button>
          <Button variant="outline" disabled={busy || !staffRateWindow(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), roles).allowed} title={staffRateWindow(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), roles).reason || 'Post approved staff rates'} onClick={() => command({ action: 'staff-rates', year: Number(asOf.slice(0, 4)), month: Number(asOf.slice(5, 7)) })}>Post staff rates</Button>
          <Button variant="outline" onClick={() => setShowPolicy(!showPolicy)}>Statutory policies</Button>
        </>
      )}
      {canApprove && today() >= periodEnd(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))) && (
        <Button variant="outline" disabled={busy} onClick={() => command({ action: 'accrue', year: Number(asOf.slice(0, 4)), month: Number(asOf.slice(5, 7)) })}>Accrue unpaid salaries</Button>
      )}
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {showPolicy && canPrepare && <form className="border rounded p-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (policyConfirmed && await command({ action: 'policy', policy: policyForm })) { setShowPolicy(false); setPolicyConfirmed(false) } }}>
      <h3 className="font-semibold">Publish an accountant-reviewed statutory policy</h3><p className="text-sm">Enter the applicable official rates and limits. Published versions remain attached to the payrolls that use them. Percentage inputs use ordinary percentages, for example 4.5 for 4.5%.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label>Currency<Input required pattern="[A-Z]{3}" value={policyForm.currency} onChange={e => setPolicyForm({ ...policyForm, currency: e.target.value.toUpperCase() })} /></label>
        <label>Official source and review reference<Input required value={policyForm.reference} onChange={e => setPolicyForm({ ...policyForm, reference: e.target.value })} /></label>
        <label>Effective from<Input required type="date" value={policyForm.effectiveFrom} onChange={e => setPolicyForm({ ...policyForm, effectiveFrom: e.target.value })} /></label>
        <label>Effective to<Input required type="date" value={policyForm.effectiveTo} onChange={e => setPolicyForm({ ...policyForm, effectiveTo: e.target.value })} /></label>
        {([{ key: 'employeeNssaRate', label: 'Employee NSSA (%)' }, { key: 'employerNssaRate', label: 'Employer NSSA (%)' }, { key: 'aidsRate', label: 'AIDS levy on PAYE (%)' }, { key: 'zimdefRate', label: 'Employer ZIMDEF (%)' }, { key: 'wcifRate', label: 'Employer WCIF (%)' }] as const).map(({ key, label }) => <label key={key}>{label}<Input required type="number" min="0" max="100" step="0.0001" value={policyForm[key] * 100} onChange={e => setPolicyForm({ ...policyForm, [key]: Number(e.target.value) / 100 })} /></label>)}
        <label>NSSA monthly earnings cap<Input required type="number" min="0" step="0.01" value={policyForm.nssaCap} onChange={e => setPolicyForm({ ...policyForm, nssaCap: Number(e.target.value) })} /></label>
      </div>
      <h4 className="font-semibold">Monthly PAYE bands</h4><p className="text-sm">List increasing upper limits. PAYE is taxable earnings × rate minus the band deduction. Include a final band covering your highest salary.</p>
      {policyForm.payeBands.map((band, i) => <div key={i} className="grid grid-cols-3 gap-3">{(['upTo', 'rate', 'deduct'] as const).map(key => <label key={key}>{({ upTo: 'Taxable earnings up to', rate: 'Rate (%)', deduct: 'Deduct from tax' })[key]}<Input required type="number" min="0" step="0.01" value={key === 'rate' ? band.rate * 100 : band[key]} onChange={e => setPolicyForm({ ...policyForm, payeBands: policyForm.payeBands.map((b, idx) => idx === i ? { ...b, [key]: Number(e.target.value) / (key === 'rate' ? 100 : 1) } : b) })} /></label>)}</div>)}
      <Button type="button" variant="outline" onClick={() => setPolicyForm({ ...policyForm, payeBands: [...policyForm.payeBands, { upTo: 0, rate: 0, deduct: 0 }] })}>Add PAYE band</Button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={policyConfirmed} onChange={e => setPolicyConfirmed(e.target.checked)} />I have checked these rates, including every zero value, against the applicable guidance.</label>
      <Button type="submit" disabled={busy || !policyConfirmed}>Publish reviewed policy</Button>
    </form>}
    {showDraft && canPrepare && <form className="border rounded p-4 space-y-4" onSubmit={async e => { e.preventDefault(); if (await command({ action: 'draft', ...draft, payrollId: draft.payrollId || undefined })) setShowDraft(false) }}>
      <div>
        <h3 className="font-semibold">{draftFormTitle}</h3>
        <p className="text-sm text-muted-foreground">Saving a draft calculates net pay. It does not book expense or pay the employee yet.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label>Employee<select required className={field} value={draft.employeeId} onChange={e => { const emp = hr.employees.find(p => p.id === e.target.value); setDraft({ ...draft, employeeId: e.target.value, basicSalary: emp?.salary || 0, advanceInstallments: {} }) }}><option value="">Select employee</option>{hr.employees.map(e => <option key={e.id} value={e.id}>{hr.getEmpName(e)}</option>)}</select></label>
        <label>Statutory policy<select required className={field} value={draft.policyId} onChange={e => setDraft({ ...draft, policyId: e.target.value })}><option value="">Select reviewed policy</option>{review?.policies.map(p => <option key={p.id} value={p.id}>{p.currency} · {p.effectiveFrom}–{p.effectiveTo} · {p.reference}</option>)}</select></label>
        {(['year', 'month', 'basicSalary', 'allowances', 'damagesDeduction', 'uniformDeduction'] as const).map(key => <label key={key}>{({ year: 'Earning year', month: 'Earning month', basicSalary: 'Basic salary', allowances: 'Manual allowances', damagesDeduction: 'Damages recovery', uniformDeduction: 'Uniform recovery' })[key]}<Input type="number" min={0} step={key === 'year' || key === 'month' ? '1' : '0.01'} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: Number(e.target.value) })} /></label>)}
        <label>Salary due date<Input required type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></label>
      </div>
      <p className="text-sm rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        Job earnings already included: <strong>{format(existing?.jobCardEarnings || 0, policy?.currency)}</strong>
        <span className="text-muted-foreground"> (from approved staff rates / MBDI)</span>
      </p>
      {hr.salaryAdvances.filter(a => a.employeeId === draft.employeeId && a.status === 'ACTIVE').map(a => <label key={a.id} className="block text-sm">Advance instalment ({format(a.outstandingBalance)} outstanding)<Input type="number" min="0" step="0.01" value={draft.advanceInstallments[a.id!] || 0} onChange={e => { const amounts = { ...draft.advanceInstallments }; const n = Number(e.target.value); if (n > 0) amounts[a.id!] = n; else delete amounts[a.id!]; setDraft({ ...draft, advanceInstallments: amounts }) }} /></label>)}
      {preview && <p>Employee deductions: {format(preview.deductions, policy?.currency)} · Net pay: {format(preview.netPay, policy?.currency)} · Employer contributions: {format(preview.employerCost, policy?.currency)}</p>}
      {previewError && <p role="alert">{previewError}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !preview || !!existing?.recognized || !salaryDraftWindow(draft.year, draft.month, roles).allowed} title={salaryDraftWindow(draft.year, draft.month, roles).reason || 'Save the salary draft'}>Save draft</Button><Button type="button" variant="outline" onClick={() => setShowDraft(false)}>Cancel</Button></div>
      {!salaryDraftWindow(draft.year, draft.month, roles).allowed && <p className="text-sm">{salaryDraftWindow(draft.year, draft.month, roles).reason}</p>}
    </form>}
    {payment && <form className="border rounded p-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (await command({ action: 'pay', ...payment })) setPayment(null) }}>
      <h3 className="font-semibold">Record {payment.kind === 'EMPLOYEE' ? 'employee payment' : `${payment.authority} remittance`}</h3>
      <p className="text-sm">Record a payment that actually occurred. Employee payments settle the oldest arrears first in the selected currency. Funding accounts currently support USD.</p>
      <label>Amount ({payment.currency})<Input required type="number" min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: Number(e.target.value) })} /></label>
      <label>Actual payment date<Input required type="date" max={today()} value={payment.paymentDate} onChange={e => setPayment({ ...payment, paymentDate: e.target.value })} /></label>
      <label>Funding account<select className={field} value={payment.forceSalaries ? 'SALARIES' : payment.account} onChange={e => setPayment({ ...payment, account: e.target.value })} disabled={!!payment.forceSalaries}>{(payment.forceSalaries ? ['SALARIES'] : payment.kind === 'EMPLOYEE' ? ['SALARIES', 'BANK', 'CASH', 'ECOCASH', 'RESERVE'] : ['BANK', 'CASH', 'ECOCASH', 'SALARIES', 'RESERVE']).map(a => <option key={a}>{a}</option>)}</select></label>
      {payment.forceSalaries && <p className="text-sm text-muted-foreground">Job-card staff rates fulfill from the Salaries account.</p>}
      <label>Payment reference<Input required value={payment.reference} onChange={e => setPayment({ ...payment, reference: e.target.value })} /></label>
      <label>Evidence (bank proof link or signed receipt reference)<Input required value={payment.evidence} onChange={e => setPayment({ ...payment, evidence: e.target.value })} /></label>
      {allocations.map(a => <p className="text-sm" key={a.payrollId}>Allocation: {a.payrollId} — {format(a.amount, payment.currency)}</p>)}
      {allocationError && <p role="alert">{allocationError}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !!allocationError || payment.currency !== 'USD'}>Record settlement</Button><Button type="button" variant="outline" onClick={() => setPayment(null)}>Cancel</Button></div>
    </form>}
    {adjustment && <form className="border rounded p-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (await command({ action: 'adjust', ...adjustment })) setAdjustment(null) }}><h3 className="font-semibold">Audited earnings adjustment</h3><p className="text-sm">Post only the difference to the original earning period. Previous journals and payments remain intact. Entitlements cannot fall below amounts already settled.</p><label>Correct basic salary<Input type="number" min="0" step="0.01" value={adjustment.basicSalary} onChange={e => setAdjustment({ ...adjustment, basicSalary: Number(e.target.value) })} /></label><label>Correct manual allowances<Input type="number" min="0" step="0.01" value={adjustment.allowances} onChange={e => setAdjustment({ ...adjustment, allowances: Number(e.target.value) })} /></label><Input required minLength={10} placeholder="Reason and supporting reference" value={adjustment.reason} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} /><Button type="submit" disabled={busy}>Post adjustment</Button></form>}
    {correction && <form className="border rounded p-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (await command({ action: 'reverse', ...correction })) setCorrection(null) }}><h3 className="font-semibold">Reverse unpaid recognition for correction</h3><p className="text-sm">The original journal remains. A linked reversal restores advance reservations; edit and approve the corrected draft afterwards.</p><Input required minLength={10} placeholder="Reason for correction" value={correction.reason} onChange={e => setCorrection({ ...correction, reason: e.target.value })} /><Button type="submit" disabled={busy}>Record reversal</Button></form>}
    {review && <>
      {Object.entries(review.totals).map(([currency, t]) => <div key={currency} className="border rounded p-4 space-y-1 text-sm">
        <h3 className="font-semibold">{currency} · {review.from} to {review.asOf}</h3>
        <p>Opening employee arrears {format(t.opening, currency)} + net earnings {format(t.earnings, currency)} − payments {format(t.payments, currency)} = <strong>{format(t.employeePayable, currency)} outstanding</strong></p>
        <p>Payroll expense: {format(t.expense, currency)} · Statutory payable: {format(t.statutoryPayable, currency)}</p>
      </div>)}
      <details className="rounded border p-3" open={!!(review.exceptions.legacy.length || review.exceptions.unapproved.length || review.exceptions.missingEmployees.length || review.exceptions.discrepancies.length)}>
        <summary className="font-semibold">Month-end reconciliation and exceptions</summary>
        <p className="text-sm my-2">{review.exceptions.legacy.length} legacy payroll records need review; {review.exceptions.unapproved.length} drafts await recognition; {review.exceptions.missingEmployees.length} employees have no payroll for the selected month. Legacy amounts are excluded from accrual totals until reconciled.</p>
        {review.exceptions.missingEmployees.length > 0 && <p className="text-sm">Missing payroll: {review.exceptions.missingEmployees.map(e => e.name || e.id).join(', ')}</p>}
        {review.exceptions.discrepancies.map((issue, i) => <p className="text-sm text-red-600" key={i}>{issue.message} · Reference: {issue.recordId}</p>)}
        {review.exceptions.unsupportedCurrencies.length > 0 && <p className="text-sm">Payroll in {review.exceptions.unsupportedCurrencies.join(', ')} is reported separately. Cash settlements and the general financial statements currently support USD.</p>}
        {([
          ['Legacy payroll awaiting reconciliation', review.exceptions.legacy.map(p => `${p.employeeName || p.id} · ${p.status} · ${p.id}`)],
          ['Drafts awaiting recognition', review.exceptions.unapproved],
          ['Duplicate employee months', review.exceptions.duplicates],
          ['Historical payments needing date evidence', review.reconciliation.ambiguousPayments],
          ['Expenses with missing payroll records', review.reconciliation.orphanExpenses],
          ['Earnings with missing payroll records', review.reconciliation.orphanPostings],
        ] as Array<[string, string[]]>).filter(([, items]) => items.length > 0).map(([label, items]) => <details key={label} className="mt-2 text-sm"><summary>{label} ({items.length})</summary><ul className="list-disc pl-5 mt-1">{items.map((item, i) => <li key={i}>{item}</li>)}</ul></details>)}
      </details>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <caption className="text-left mb-2">
            Employee balances as at {review.asOf}. <strong>Recognised net</strong> is blank until recognition; use <strong>Draft net</strong> for the saved payslip figure.
          </caption>
          <thead>
            <tr className="border-b text-left">
              {['Employee / month', 'Currency / due', 'Current status', 'Draft net', 'Recognised net', 'Paid', 'Outstanding', 'Actions'].map(h => (
                <th className="p-2" key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {review.payrolls.slice().sort((a, b) => a.year - b.year || a.month - b.month).map(p => {
              const historical = payrollTotals(review.journals.filter(j => j.payrollId === p.id), review.payments.filter(s => s.payrollId === p.id), review.asOf)[p.currency || 'USD']
              const recognizedNet = review.journals.filter(j => j.payrollId === p.id && j.effectiveDate <= review.asOf).reduce((s, j) => s + j.net * j.sign, 0)
              const legacy = isLegacy(p)
              const recogniseReady = canRecogniseDate(p)
              const draftNet = Number(p.netPay || 0)
              const showDraftNet = !legacy && !p.recognized && (p.generated || draftNet > 0)
              return (
                <tr className="border-b align-top" key={p.id}>
                  <td className="p-2">
                    {p.employeeName}<br />
                    <span className="text-muted-foreground">{p.month}/{p.year}</span>
                  </td>
                  <td className="p-2">{p.currency || 'Unverified'}<br />{p.dueDate || '—'}</td>
                  <td className="p-2">
                    <div className="font-medium">{statusLabel(p)}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                      {nextActionHint(p, recogniseReady)}
                    </p>
                  </td>
                  <td className="p-2">
                    {legacy || p.recognized ? '—' : showDraftNet ? format(draftNet, p.currency) : '—'}
                  </td>
                  <td className="p-2">
                    {legacy ? '—' : p.recognized ? format(recognizedNet, p.currency) : '—'}
                  </td>
                  <td className="p-2">
                    {legacy ? '—' : p.recognized ? format(recognizedNet - (historical?.employeePayable || 0), p.currency) : '—'}
                  </td>
                  <td className="p-2">
                    {legacy ? '—' : p.recognized ? format(historical?.employeePayable || 0, p.currency) : '—'}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => download(p)}>Payslip</Button>
                      {!legacy && !p.recognized && canPrepare && (
                        <Button
                          size="sm"
                          variant={p.generated ? 'outline' : 'default'}
                          onClick={() => edit(p)}
                        >
                          {p.generated ? 'Edit draft' : 'Prepare this payroll'}
                        </Button>
                      )}
                      {!legacy && !p.recognized && p.generated && canApprove && (
                        <Button
                          size="sm"
                          disabled={busy || !recogniseReady}
                          title={
                            recogniseReady
                              ? 'Books salaries payable. Does not pay cash.'
                              : `Available from ${recognitionOpens(p.year, p.month)}`
                          }
                          onClick={() => command({ action: 'recognize', payrollId: p.id, revision: p.revision })}
                        >
                          Approve and recognise
                        </Button>
                      )}
                      {p.recognized && canApprove && <Button size="sm" variant="outline" onClick={() => setAdjustment({ payrollId: p.id, requestId: crypto.randomUUID(), revision: p.revision!, basicSalary: p.basicSalary, allowances: p.allowances - Number(p.jobCardEarnings || 0), reason: '' })}>Adjust earnings</Button>}
                      {p.recognized && (p.outstanding || 0) > 0 && canPrepare && <Button size="sm" onClick={() => openPayment(p)}>Record payment</Button>}
                      {p.recognized && !p.hasAdjustments && !p.paidAmount && !Object.values(p.statutoryPaid || {}).some(Boolean) && canApprove && <Button size="sm" variant="outline" onClick={() => setCorrection({ payrollId: p.id, reason: '' })}>Reverse for correction</Button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h3 className="font-semibold">Statutory liabilities — current outstanding balances</h3>
      {review.payrolls.filter(p => p.recognized).map(p => <div key={p.id} className="text-sm border rounded p-3"><p className="font-semibold">{p.employeeName} · {p.month}/{p.year}</p><div className="flex flex-wrap gap-4">{Object.entries(p.statutory || {}).filter(([, n]) => n > 0).map(([authority, n]) => <div key={authority}>{authority}: {format(n - (p.statutoryPaid?.[authority] || 0), p.currency)} outstanding {canPrepare && n > (p.statutoryPaid?.[authority] || 0) && <Button size="sm" variant="outline" onClick={() => openPayment(p, authority)}>Record remittance</Button>}</div>)}</div></div>)}
      {review.payments.length > 0 && <details className="border rounded p-3"><summary className="font-semibold">Payment evidence and allocations</summary><ul className="text-sm space-y-2 mt-2">{review.payments.filter(p => p.paymentDate <= asOf).map(p => <li key={p.id}>{p.paymentDate} · {p.payrollId} · {p.kind} · {format(p.amount, p.currency)} · {p.account} · {p.reference}<br />Evidence: {p.evidence}</li>)}</ul></details>}
    </>}

  </div>
}
