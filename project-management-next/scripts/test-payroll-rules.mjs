/** Local emulator only. Uses the REST API so no additional test dependencies are needed. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
const host = process.env.FIRESTORE_EMULATOR_HOST
if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('Set FIRESTORE_EMULATOR_HOST to a local 127.0.0.1 port; live Firebase is forbidden')
const project = 'incaptta-pro-staging'
const base = `http://${host}`
const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
const compiled = await fetch(`${base}/emulator/v1/projects/${project}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ content: rules }] } }) })
assert.equal(compiled.status, 200, await compiled.text())
const encode = value => typeof value === 'string' ? { stringValue: value } : typeof value === 'number' ? { integerValue: String(value) } : typeof value === 'boolean' ? { booleanValue: value } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encode(v)])) } }
function token(role, active = true) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: `https://securetoken.google.com/${project}`, aud: project, iat: now, exp: now + 3600, auth_time: now, sub: 'tester', user_id: 'tester', roles: [role], isActive: active, firebase: { sign_in_provider: 'custom', identities: {} } }
  return `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`
}
const prefix = `rules-${Date.now()}`
async function request(path, method, auth, data) {
  return fetch(`${base}/v1/projects/${project}/databases/(default)/documents/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, encode(v)])) }) } : {}) })
}
let assertions = 0
async function expect(path, method, auth, data, status) {
  const result = await request(path,method,auth,data)
  assertions++
  assert.equal(result.status,status,`${method} ${path}: ${await result.text()}`)
}
const payroll = `payroll/${prefix}`, journal = `payrollJournal/${prefix}`
await expect(payroll,'PATCH','owner',{ schemaVersion:2,status:'Unpaid',recognized:true,approvalStatus:'APPROVED_MANAGER',netPay:1000 },200)
await expect(journal,'PATCH','owner',{ amount:1000 },200)
for (const role of ['ACCOUNTANT','MANAGER','SUPER_ADMIN','TECHNICAL']) {
  await expect(payroll,'PATCH',token(role),{schemaVersion:2,status:'Paid',netPay:0},403)
  await expect(payroll,'PATCH',token(role),{schemaVersion:1,status:'Unpaid'},403)
  await expect(payroll,'DELETE',token(role),undefined,403)
  await expect(`payroll/${prefix}-${role}`,'PATCH',token(role),{status:'Unpaid',basicSalary:1000},403)
  for (const collection of ['payrollJournal','payrollPayments','payrollPolicies','payrollPaymentRequests','jobCardPayrollPostings','mbdiPayrollPostings']) await expect(`${collection}/${prefix}-${role}`,'PATCH',token(role),{amount:1000},403)
  await expect(`operationalExpenses/${prefix}-${role}`,'PATCH',token(role),{type:'PAYROLL_NET',payrollId:prefix,status:'APPROVED',amount:1000},403)
}
await expect(journal,'GET',token('ACCOUNTANT'),undefined,200)
await expect(journal,'GET',token('SALES'),undefined,403)
await expect(journal,'GET',token('ACCOUNTANT',false),undefined,403)
await expect(journal,'GET',undefined,undefined,403)
const expense=`operationalExpenses/payroll-${prefix}`, wallet=`salariesAccountTransactions/payroll-${prefix}`
await expect(expense,'PATCH','owner',{type:'PAYROLL_SETTLEMENT',paymentRequestId:prefix,status:'PAYMENT_PROCESSED',amount:100},200)
await expect(wallet,'PATCH','owner',{type:'PAYMENT',source:'PAYROLL_SETTLEMENT',amount:100},200)
await expect(expense,'PATCH',token('SUPER_ADMIN'),{type:'OTHER',status:'PAYMENT_PROCESSED',amount:1},403)
await expect(expense,'DELETE',token('SUPER_ADMIN'),undefined,403)
await expect(wallet,'PATCH',token('SUPER_ADMIN'),{type:'PAYMENT',amount:1},403)
await expect(wallet,'DELETE',token('SUPER_ADMIN'),undefined,403)
await expect(`operationalExpenses/${prefix}-ordinary`,'PATCH',token('ACCOUNTANT'),{type:'OTHER',status:'APPROVED',amount:10},200)
await expect(`operationalExpenses/${prefix}-manual-salary`,'PATCH',token('ACCOUNTANT'),{category:'Salaries & Wages',status:'APPROVED',amount:100},403)
await expect(`salaryAdvances/${prefix}`,'PATCH','owner',{status:'ACTIVE',outstandingBalance:100,reservedBalance:50,recoveredAmount:0},200)
await expect(`salaryAdvances/${prefix}`,'PATCH',token('ACCOUNTANT'),{status:'ACTIVE',outstandingBalance:50,reservedBalance:0,recoveredAmount:50},403)
await expect(`salaryAdvances/${prefix}`,'PATCH',token('MANAGER'),{status:'REVERSED',outstandingBalance:100,reservedBalance:50,recoveredAmount:0,reversedBy:{uid:'tester'},reversalReason:'test reversal'},403)
console.log(`Payroll rules compiled and all ${assertions} direct-write/access assertions passed against the local emulator.`)
