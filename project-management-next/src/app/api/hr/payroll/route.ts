import type { DocumentData } from 'firebase-admin/firestore'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { accrueUnpaidPayroll, adjustPayroll, guardPayrollEnvironment, postMonthlyStaffRates, postPayrollEarning, recognizePayroll, reversePayroll, savePayrollDraft, savePayrollPolicy, settlePayroll, type PayrollActor } from '@/lib/server/payroll'
import { businessDate, payrollTotals, reconcilePayrollControls, type PayrollControl, type CashSettlement, today, type Journal, type Settlement } from '@/lib/payroll/core'

const amount = z.number().finite().nonnegative().max(1e10)
const commands = z.discriminatedUnion('action', [
  z.object({ action: z.literal('adjust'), payrollId: z.string(), requestId: z.string(), revision: z.number().int(), basicSalary: amount, allowances: amount, reason: z.string().max(2000) }),
  z.object({ action: z.literal('earning'), source: z.enum(['JOB', 'MBDI']), sourceId: z.string(), lineId: z.string() }),
  z.object({ action: z.literal('draft'), payrollId: z.string().optional(), employeeId: z.string(), month: z.number().int(), year: z.number().int(), basicSalary: amount, allowances: amount, damagesDeduction: amount, uniformDeduction: amount, policyId: z.string(), dueDate: z.string(), advanceInstallments: z.record(z.string(), amount).default({}) }),
  z.object({ action: z.literal('recognize'), payrollId: z.string(), revision: z.number().int() }),
  z.object({ action: z.literal('staff-rates'), year: z.number().int(), month: z.number().int() }),
  z.object({ action: z.literal('accrue'), year: z.number().int(), month: z.number().int() }),
  z.object({ action: z.literal('reverse'), payrollId: z.string(), reason: z.string().max(2000) }),
  z.object({ action: z.literal('pay'), requestId: z.string(), employeeId: z.string(), currency: z.string(), amount, paymentDate: z.string(), account: z.string(), reference: z.string().max(500), evidence: z.string().max(2000), kind: z.enum(['EMPLOYEE', 'STATUTORY']), payrollId: z.string().optional(), authority: z.enum(['ZIMRA', 'NSSA', 'ZIMDEF', 'WCIF']).optional() }),
  z.object({ action: z.literal('policy'), policy: z.object({ currency: z.string(), effectiveFrom: z.string(), effectiveTo: z.string(), reference: z.string().max(2000), employeeNssaRate: amount, employerNssaRate: amount, nssaCap: amount, aidsRate: amount, zimdefRate: amount, wcifRate: amount, payeBands: z.array(z.object({ upTo: amount, rate: amount, deduct: amount })).min(1).max(50) }) }),
])
async function authenticate(request: NextRequest): Promise<PayrollActor> {
  guardPayrollEnvironment()
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) throw new Error('Authentication required')
  const claims = await adminAuth.verifyIdToken(token, true)
  const roles = (Array.isArray(claims.roles) ? claims.roles : [claims.roles]).map(String)
  if (claims.isActive !== true || !roles.some(r => ['ACCOUNTANT', 'MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(r))) throw new Error('Insufficient payroll permissions')
  return { uid: claims.uid, name: claims.name || claims.email || claims.uid, roles }
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Payroll operation failed'
  const status = /Authentication/.test(message) ? 401 : /permission|staging/.test(message) ? 403 : 400
  return NextResponse.json({ error: message }, { status })
}
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticate(request)
    const input = commands.parse(await request.json())
    switch (input.action) {
      case 'adjust': return NextResponse.json(await adjustPayroll(input, actor))
      case 'earning': return NextResponse.json(await postPayrollEarning(input.source, input.sourceId, input.lineId, actor))
      case 'draft': return NextResponse.json(await savePayrollDraft(input, actor))
      case 'recognize': return NextResponse.json(await recognizePayroll(input.payrollId, input.revision, actor))
      case 'staff-rates': return NextResponse.json(await postMonthlyStaffRates(input.year, input.month, actor))
      case 'accrue': return NextResponse.json(await accrueUnpaidPayroll(input.year, input.month, actor))
      case 'reverse': return NextResponse.json(await reversePayroll(input.payrollId, input.reason, actor))
      case 'pay': return NextResponse.json(await settlePayroll(input, actor))
      case 'policy': return NextResponse.json(await savePayrollPolicy(input.policy, actor))
    }
  } catch (error) { return failure(error) }
}
export async function GET(request: NextRequest) {
  try {
    await authenticate(request)
    const asOf = businessDate(request.nextUrl.searchParams.get('asOf') || today())
    const from = businessDate(request.nextUrl.searchParams.get('from') || `${asOf.slice(0, 7)}-01`)
    if (from > asOf) throw new Error('Start date is after the report date')
    const names = ['payroll', 'payrollPolicies', 'payrollJournal', 'payrollPayments', 'employees', 'operationalExpenses', 'salariesAccountTransactions', 'salaryAdvances', 'salaryAdvanceRecoveries', 'jobCardPayrollPostings', 'mbdiPayrollPostings', 'reserveAccountTransactions']
    const snapshots = await Promise.all(names.map(n => adminDb.collection(n).get()))
    const data = Object.fromEntries(names.map((n, i) => [n, snapshots[i].docs.map(d => ({ ...d.data(), id: d.id }))])) as Record<string, Array<DocumentData>>
    const journals = data.payrollJournal as Journal[], payments = data.payrollPayments as Settlement[]
    const legacy = data.payroll.filter(p => p.schemaVersion !== 2)
    const unapproved = data.payroll.filter(p => p.schemaVersion === 2 && !p.recognized && p.effectiveDate <= asOf)
    const missing = data.employees.filter(e => e.active !== false && e.isActive !== false && String(e.status || '').toLowerCase() !== 'inactive' && !data.payroll.some(p => p.employeeId === e.id && Number(p.year) === Number(asOf.slice(0, 4)) && Number(p.month) === Number(asOf.slice(5, 7))))
    const duplicateKeys = data.payroll.filter(p => !p.supplement).map(p => `${p.employeeId}/${p.year}/${p.month}`)
    const duplicates = [...new Set(duplicateKeys.filter((k, i) => duplicateKeys.indexOf(k) !== i))]
    const discrepancies = reconcilePayrollControls(journals, payments, data.payroll as PayrollControl[], data.operationalExpenses as CashSettlement[], [...data.salariesAccountTransactions, ...data.reserveAccountTransactions] as CashSettlement[])
    const unsupportedCurrencies = [...new Set(journals.map(j => j.currency).filter(c => c !== 'USD'))]
    return NextResponse.json({ asOf, from, payrolls: data.payroll, policies: data.payrollPolicies, journals, payments,
      totals: payrollTotals(journals, payments, asOf, from),
      exceptions: { legacy: legacy.map(p => ({ id: p.id, employeeName: p.employeeName, status: p.status })), unapproved: unapproved.map(p => p.id), missingEmployees: missing.map(e => ({ id: e.id, name: e.fullName || e.name || e.firstName })), duplicates, discrepancies, unsupportedCurrencies },
      reconciliation: { readOnly: true, counts: Object.fromEntries(names.map(n => [n, data[n].length])),
        orphanExpenses: data.operationalExpenses.filter(e => e.payrollId && !data.payroll.some(p => p.id === e.payrollId)).map(e => e.id),
        ambiguousPayments: data.operationalExpenses.filter(e => e.type === 'PAYROLL_NET' && !e.paymentDate && !e.paymentProcessedAt).map(e => e.id),
        orphanPostings: [...data.jobCardPayrollPostings, ...data.mbdiPayrollPostings].filter(e => e.payrollId && !data.payroll.some(p => p.id === e.payrollId)).map(e => e.id),
      },
    })
  } catch (error) { return failure(error) }
}
