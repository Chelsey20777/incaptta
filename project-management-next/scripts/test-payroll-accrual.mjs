import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function moduleAt(path, imports = {}) { const exports = {}; new Function('require', 'exports', compile(path))(name => { if (!(name in imports)) throw new Error(`Unmocked dependency: ${name}`); return imports[name] }, exports); return exports }
const core = moduleAt('../src/lib/payroll/core.ts')
const { payrollTotals, calculatePayroll, allocateOldest, assertStaging, businessDate } = core
const zeroPolicy = { currency: 'USD', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', reference: 'TEST FIXTURE ONLY — no deductions', employeeNssaRate: 0, employerNssaRate: 0, nssaCap: 100000, aidsRate: 0, zimdefRate: 0, wcifRate: 0, payeBands: [{ upTo: 1000000000, rate: 0, deduct: 0 }] }
const manager = { uid: 'manager', name: 'Manager', roles: ['MANAGER'] }, accountant = { uid: 'accountant', name: 'Accountant', roles: ['ACCOUNTANT'] }
function store() {
  const records = new Map(), budgets = { BANK: 2000, CASH: 2000, SALARIES: 2000 }
  let queue = Promise.resolve()
  const clone = value => structuredClone(value)
  const ref = path => ({ path, id: path.split('/').at(-1), async create(data) { if (records.has(path)) throw new Error('Already exists'); records.set(path, clone(data)) } })
  const snap = r => ({ id: r.id, ref: r, exists: records.has(r.path), data: () => records.has(r.path) ? clone(records.get(r.path)) : undefined })
  function collection(name, filters = []) {
    return { name, filters, doc: key => ref(`${name}/${key || `auto${records.size}`}`), where: (field, op, value) => collection(name, [...filters, { field, op, value }]), async get() { return query(this) } }
  }
  function query(q) { const docs = [...records.keys()].filter(k => k.startsWith(`${q.name}/`) && !k.slice(q.name.length + 1).includes('/')).map(k => snap(ref(k))).filter(s => q.filters.every(f => f.op === '==' && s.data()[f.field] === f.value)); return { docs, empty: !docs.length } }
  const db = { collection, async runTransaction(fn) {
    const prior = queue; let release; queue = new Promise(r => { release = r }); await prior
    const writes = []; let wrote = false
    const tx = { async get(target) { if (wrote) throw new Error('Firestore reads must precede writes'); return target.path ? snap(target) : query(target) },
      create(r, data) { wrote = true; writes.push(() => { if (records.has(r.path)) throw new Error('Duplicate create'); records.set(r.path, clone(data)) }) },
      set(r, data, options) { wrote = true; writes.push(() => records.set(r.path, clone(options?.merge ? { ...records.get(r.path), ...data } : data))) },
      update(r, data) { wrote = true; writes.push(() => { if (!records.has(r.path)) throw new Error('Missing update'); const current = records.get(r.path); for (const [key, value] of Object.entries(clone(data))) { const parts = key.split('.'); if (parts.length === 1) current[key] = value; else { current[parts[0]] ||= {}; current[parts[0]][parts[1]] = value } } }) },
    }
    const before = clone(records)
    try { const result = await fn(tx); writes.forEach(w => w()); return result } catch (error) { records.clear(); for (const [k,v] of before) records.set(k,v); throw error } finally { release() }
  } }
  return { db, records, budgets, put: (name, key, value) => records.set(`${name}/${key}`, clone(value)), get: (name, key) => records.get(`${name}/${key}`), all: name => [...records.entries()].filter(([k]) => k.startsWith(`${name}/`)).map(([k,v]) => ({ ...v, id: k.split('/').at(-1) })) }
}
async function fixture() {
  process.env.DEPLOYMENT_ENV = 'staging'; process.env.FIREBASE_PROJECT_ID = 'incaptta-pro-staging'
  const s = store()
  const service = moduleAt('../src/lib/server/payroll.ts', {
    'node:crypto': await import('node:crypto'),
    'firebase-admin/app': { getApp: () => ({ options: { projectId: 'incaptta-pro-staging' } }) },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'SERVER_TIME' }, Timestamp: { fromDate: d => ({ seconds: d.getTime() / 1000 }) } },
    '@/lib/firebase-admin': { adminDb: s.db }, '@/lib/payroll/core': core,
    '@/lib/account-keys': { normalizeAccountKey: a => ['BANK','CASH','ECOCASH','SALARIES','RESERVE','IRD'].includes(a) ? a : 'UNKNOWN' },
    './account-balance': { getAccountBalanceInTransaction: async (_, account) => (s.budgets[account] || 0) - s.all('operationalExpenses').filter(e => e.paymentMethod === account).reduce((total, e) => total + e.amount, 0) },
  })
  s.put('employees', 'employee', { name: 'Employee', salary: 1000 })
  s.put('payrollPolicies', 'policy', zeroPolicy)
  const draft = { employeeId: 'employee', month: 9, year: 2025, basicSalary: 1000, allowances: 0, damagesDeduction: 0, uniformDeduction: 0, policyId: 'policy', dueDate: '2025-09-30', advanceInstallments: {} }
  const payrollId = 'employee_2025_9'
  process.env.PAYROLL_TODAY = '2025-09-25'
  const prepare = async (input = draft) => {
    process.env.PAYROLL_TODAY = `${input.year}-${String(input.month).padStart(2, '0')}-25`
    const result = await service.savePayrollDraft(input, accountant)
    await service.recognizePayroll(result.id, s.get('payroll', result.id).revision, manager)
    return result.id
  }
  const pay = (amount, requestId, extra = {}) => {
    const paymentDate = String(extra.paymentDate || '2025-10-10')
    if (paymentDate > (process.env.PAYROLL_TODAY || '') && paymentDate < '2026-01-01') process.env.PAYROLL_TODAY = paymentDate
    return service.settlePayroll({ requestId, employeeId: 'employee', currency: 'USD', amount, paymentDate: '2025-10-10', account: 'BANK', reference: `Bank ${requestId}`, evidence: `Receipt ${requestId}`, kind: 'EMPLOYEE', ...extra }, accountant)
  }
  return { ...s, ...service, draft, prepare, pay, payrollId }
}

test('September recognition and October partial payments preserve expense period and historical balances', async () => {
  const f = await fixture(); f.budgets.BANK = 0
  await f.prepare()
  assert.equal(f.all('operationalExpenses').length, 0)
  await assert.rejects(f.pay(600, 'insufficient'), /Insufficient/)
  f.budgets.BANK = 2000
  await f.pay(600, 'first')
  assert.equal(f.get('payroll', f.payrollId).status, 'Partially paid')
  assert.equal(f.get('payroll', f.payrollId).outstanding, 400)
  await f.pay(400, 'second', { paymentDate: '2025-10-20' })
  await f.prepare({ ...f.draft, month: 10, dueDate: '2025-10-31' })
  const journals = f.all('payrollJournal'), payments = f.all('payrollPayments')
  assert.deepEqual(payrollTotals(journals, payments, '2025-09-30', '2025-09-01').USD, { expense: 1000, opening: 0, earnings: 1000, payments: 0, employeePayable: 1000, statutoryPayable: 0, jobEarnings: 0 })
  assert.equal(payrollTotals(journals, payments, '2025-10-10', '2025-10-01').USD.employeePayable, 400)
  const october = payrollTotals(journals, payments, '2025-10-31', '2025-10-01').USD
  assert.equal(october.expense, 1000); assert.equal(october.opening, 1000); assert.equal(october.payments, 1000); assert.equal(october.employeePayable, 1000)
})
test('same request retries once; changed payload and concurrent overpayment fail', async () => {
  const f = await fixture(); await f.prepare()
  await Promise.all([f.pay(600, 'same'), f.pay(600, 'same')])
  assert.equal(f.all('payrollPayments').length, 1)
  await assert.rejects(f.pay(500, 'same'), /different details/)
  const outcomes = await Promise.allSettled([f.pay(400, 'a'), f.pay(400, 'b')])
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(f.get('payroll', f.payrollId).outstanding, 0)
  assert.equal(f.all('operationalExpenses').length, 2)
})
test('deductions, employer costs and noncash advance recoveries balance, and payment does not recover twice', async () => {
  const f = await fixture()
  f.put('payrollPolicies','policy',{ ...zeroPolicy, employeeNssaRate: .04, employerNssaRate: .04, aidsRate: .03, zimdefRate: .01, wcifRate: .02, payeBands: [{ upTo: 1e9, rate: .1, deduct: 0 }] })
  f.put('salaryAdvances','advance',{ employeeId: 'employee', status: 'ACTIVE', outstandingBalance: 200, reservedBalance: 0, recoveredAmount: 0 })
  await f.prepare({ ...f.draft, advanceInstallments: { advance: 100 } })
  const p = f.get('payroll',f.payrollId), j = f.all('payrollJournal')[0]
  assert.equal(p.netPay, 761.12); assert.equal(p.employerCost, 70)
  assert.equal(j.lines.reduce((s,l)=>s+core.cents(l.debit)-core.cents(l.credit),0), 0)
  assert.equal(f.get('salaryAdvances','advance').outstandingBalance,100)
  await f.pay(100,'partial'); await f.pay(100,'partial2')
  assert.equal(f.get('salaryAdvances','advance').outstandingBalance,100)
  const statutory = payrollTotals(f.all('payrollJournal'), f.all('payrollPayments'), '2025-12-31').USD.statutoryPayable
  await f.pay(p.statutory.ZIMRA, 'tax', { kind: 'STATUTORY', authority: 'ZIMRA', payrollId: f.payrollId })
  assert.equal(core.money(payrollTotals(f.all('payrollJournal'), f.all('payrollPayments'), '2025-12-31').USD.statutoryPayable), core.money(statutory - p.statutory.ZIMRA))
  await assert.rejects(f.pay(1, 'tax-extra', { kind: 'STATUTORY', authority: 'ZIMRA', payrollId: f.payrollId }), /exceeds/)
})
test('oldest arrears allocated first; currencies never mix', () => {
  const rows = [{id:'oct',effectiveDate:'2025-10-31',currency:'USD',outstanding:500},{id:'sep',effectiveDate:'2025-09-30',currency:'USD',outstanding:200},{id:'other',effectiveDate:'2025-08-31',currency:'ZWG',outstanding:10000}]
  assert.deepEqual(allocateOldest(rows,300,'USD'),[{payrollId:'sep',amount:200},{payrollId:'oct',amount:100}])
  assert.throws(()=>allocateOldest(rows,800,'USD'), /exceeds/)
})
test('unpaid reversal restores advances and keeps balanced immutable history', async () => {
  const f = await fixture()
  f.put('salaryAdvances','advance',{ employeeId:'employee',status:'ACTIVE',outstandingBalance:100,reservedBalance:0,recoveredAmount:0 })
  await f.prepare({...f.draft,advanceInstallments:{advance:100}})
  await f.reversePayroll(f.payrollId,'Incorrect basic salary entered',manager)
  assert.equal(f.get('salaryAdvances','advance').outstandingBalance,100)
  assert.equal(f.get('salaryAdvances','advance').reservedBalance,100)
  assert.equal(payrollTotals(f.all('payrollJournal'),[], '2025-12-31').USD.expense,0)
  await f.prepare({...f.draft,basicSalary:1100,advanceInstallments:{advance:100}})
  assert.equal(payrollTotals(f.all('payrollJournal'),[], '2025-12-31').USD.expense,1100)
})
test('paid payroll can receive a delta adjustment but cannot be reduced below settlement', async () => {
  const f = await fixture(); await f.prepare(); await f.pay(600,'partial')
  const adjustment = {payrollId:f.payrollId,requestId:'adjust',revision:1,basicSalary:900,allowances:0,reason:'Correct the approved salary amount'}
  await f.adjustPayroll(adjustment,manager); await f.adjustPayroll(adjustment,manager)
  assert.equal(f.get('payroll',f.payrollId).outstanding,300)
  assert.equal(payrollTotals(f.all('payrollJournal'),f.all('payrollPayments'),'2025-12-31').USD.expense,900)
  await assert.rejects(f.adjustPayroll({...adjustment,requestId:'bad',revision:2,basicSalary:500},manager), /already paid/)
  await assert.rejects(f.reversePayroll(f.payrollId,'Reverse paid salary',manager), /adjustment/)
})
test('late job earnings stay in earning month and supplement a recognised month', async () => {
  const f = await fixture(); await f.prepare()
  f.put('jobCards','job',{ generalInfo:{jobNumber:'JC1'},staffRates:[{id:'rate',employeeId:'employee',jobRateAmount:150,approvalStatus:'APPROVED_MANAGER',earningPeriod:'2025-09',approvedAt:'2025-10-15'}] })
  const result = await f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true})
  assert.equal(result.month,9); assert.notEqual(result.payrollId,f.payrollId)
  assert.equal(f.get('payroll',f.payrollId).netPay,1000)
  await f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true})
  assert.equal(f.get('payroll',result.payrollId).jobCardEarnings,150)
  await f.prepare({...f.draft,payrollId:result.payrollId,basicSalary:0})
  assert.equal(payrollTotals(f.all('payrollJournal'),[],'2025-09-30').USD.expense,1150)
})
test('legacy payroll, missing earning dates, expired policy, wrong role and wrong project fail closed', async () => {
  const f = await fixture()
  f.put('payroll', f.payrollId, {employeeId:'employee',month:9,year:2025,status:'Unpaid'})
  await assert.rejects(f.savePayrollDraft(f.draft,accountant), /Legacy/)
  await assert.rejects(f.savePayrollDraft(f.draft,manager), /permissions/)
  f.put('jobCards','job',{staffRates:[{id:'rate',employeeId:'employee',jobRateAmount:100,approvalStatus:'APPROVED_MANAGER'}]})
  await assert.rejects(f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true}), /earning month/)
  process.env.PAYROLL_TODAY = '2024-09-25'
  await assert.rejects(f.savePayrollDraft({...f.draft,year:2024},accountant), /does not cover/)
  process.env.PAYROLL_TODAY = '2025-09-25'
  assert.throws(()=>assertStaging('production','incaptta-pro'), /restricted/)
  assert.throws(()=>assertStaging('staging','incaptta-pro'), /restricted/)
  assert.throws(()=>businessDate('2025-02-30'), /valid/)
  assert.throws(()=>calculatePayroll(100,200,0,zeroPolicy), /exceed/)
})

test('reconciliation detects missing cash movements, unbalanced journals and statutory drift', async () => {
  const f = await fixture(); await f.prepare(); await f.pay(100,'audit')
  const args = [f.all('payrollJournal'),f.all('payrollPayments'),f.all('payroll'),f.all('operationalExpenses'),[]]
  assert.deepEqual(core.reconcilePayrollControls(...args),[])
  assert.match(core.reconcilePayrollControls(args[0],args[1],args[2],[],[])[0].message,/funding-account/)
  args[0][0].lines[0].debit += 10
  args[2][0].statutory = { ZIMRA: 10 }
  const problems = core.reconcilePayrollControls(...args)
  assert.ok(problems.some(p=>/unbalanced/.test(p.message)))
  assert.ok(problems.some(p=>/Statutory/.test(p.message)))
})
test('no arbitrary duplicate draft IDs or silent edits to posted source earnings', async () => {
  const f = await fixture()
  await assert.rejects(f.savePayrollDraft({...f.draft,payrollId:'duplicate'},accountant),/supplement/)
  f.put('jobCards','job',{staffRates:[{id:'rate',employeeId:'employee',jobRateAmount:100,approvalStatus:'APPROVED_MANAGER',earningPeriod:'2025-09'}]})
  await f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true})
  f.get('jobCards','job').staffRates[0].jobRateAmount = 200
  await assert.rejects(f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true}),/changed/)
})
test('future, wrong-currency and pre-earning-period payments cannot post', async () => {
  const f = await fixture(); await f.prepare()
  await assert.rejects(f.pay(10,'future',{paymentDate:'2099-01-01'}),/future/)
  await assert.rejects(f.pay(10,'currency',{currency:'ZWG'}),/USD/)
  await assert.rejects(f.pay(10,'early',{paymentDate:'2025-08-01'}),/outstanding/)
  assert.equal(f.all('payrollPayments').length,0)
})
test('MBDI reward requires an earning period and keeps it after late approval', async () => {
  const f = await fixture()
  f.put('employees','employee',{name:'Employee',email:'employee@example.test'})
  f.put('mbdiInitiatives','initiative',{ownerEmail:'employee@example.test',mbdiNo:'M1',rewardAmount:300,claims:[{id:'claim',stage:'COMPLETION',status:'PENDING',earningPeriod:'2025-08'}]})
  const p = await f.postPayrollEarning('MBDI','initiative','claim',manager)
  assert.equal(p.month,8); assert.equal(p.amount,150)
  await f.postPayrollEarning('MBDI','initiative','claim',manager)
  assert.equal(f.all('mbdiPayrollPostings').length,1)
})

test('late supplements share one monthly tax band and NSSA cap', async () => {
  const f=await fixture()
  f.put('payrollPolicies','policy',{...zeroPolicy,employeeNssaRate:.1,employerNssaRate:.1,nssaCap:1000,payeBands:[{upTo:1000,rate:0,deduct:0},{upTo:1e9,rate:.2,deduct:200}]})
  await f.prepare()
  f.put('jobCards','job',{staffRates:[{id:'rate',employeeId:'employee',jobRateAmount:1000,approvalStatus:'APPROVED_MANAGER',earningPeriod:'2025-09'}]})
  const supplement=await f.postPayrollEarning('JOB','job','rate',manager,{scheduled:true})
  await f.prepare({...f.draft,payrollId:supplement.payrollId,basicSalary:0})
  const extra=f.get('payroll',supplement.payrollId)
  assert.equal(extra.nssa,0);assert.equal(extra.employerNssa,0)
  assert.equal(extra.paye,180);assert.equal(extra.netPay,820)
})
