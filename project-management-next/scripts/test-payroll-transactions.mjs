/** Integration test: real Firestore transactions against a named LOCAL emulator database. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local FIRESTORE_EMULATOR_HOST required; live tests forbidden')
process.env.DEPLOYMENT_ENV='staging';process.env.FIREBASE_PROJECT_ID='incaptta-pro-staging';process.env.PAYROLL_TODAY='2025-09-25'
const db = new Firestore({projectId:'incaptta-pro-staging',databaseId:'payroll-tests'})
const cleared = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/incaptta-pro-staging/databases/payroll-tests/documents`,{method:'DELETE'})
assert.ok(cleared.ok,await cleared.text())
function load(path,imports={}) {const result={};const js=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(key=>{if(!(key in imports))throw new Error(`Unexpected import ${key}`);return imports[key]},result);return result}
const core=load('../src/lib/payroll/core.ts')
const accountKeys=load('../src/lib/account-keys.ts')
const fx=load('../src/lib/ird-fx.ts',{'@/lib/account-keys':accountKeys})
const balances=load('../src/lib/server/account-balance.ts',{'@/lib/firebase-admin':{adminDb:db},'@/lib/account-keys':accountKeys,'@/lib/ird-fx':fx})
const service=load('../src/lib/server/payroll.ts',{'node:crypto':crypto,'firebase-admin/app':{getApp:()=>({options:{projectId:'incaptta-pro-staging'}})},'firebase-admin/firestore':{FieldValue,Timestamp},'@/lib/firebase-admin':{adminDb:db},'@/lib/account-keys':accountKeys,'./account-balance':balances,'@/lib/payroll/core':core})
const accountant={uid:'accountant',name:'Accountant',roles:['ACCOUNTANT']},manager={uid:'manager',name:'Manager',roles:['MANAGER']}
await db.collection('employees').doc('employee').set({name:'Test Employee'})
await db.collection('ledgerTopUps').doc('funding').set({account:'BANK',amount:1000,status:'COMPLETED'})
await db.collection('payrollPolicies').doc('policy').set({currency:'USD',effectiveFrom:'2025-01-01',effectiveTo:'2025-12-31',reference:'LOCAL TEST ONLY',employeeNssaRate:0,employerNssaRate:0,nssaCap:100000,aidsRate:0,zimdefRate:0,wcifRate:0,payeBands:[{upTo:1e9,rate:0,deduct:0}]})
const {id}=await service.savePayrollDraft({employeeId:'employee',month:9,year:2025,basicSalary:1000,allowances:0,damagesDeduction:0,uniformDeduction:0,policyId:'policy',dueDate:'2025-09-30',advanceInstallments:{}},accountant)
await Promise.all([service.recognizePayroll(id,1,manager),service.recognizePayroll(id,1,manager)])
assert.equal((await db.collection('payrollJournal').get()).size,1)
const payment={employeeId:'employee',currency:'USD',amount:400,paymentDate:'2025-10-10',account:'BANK',reference:'TEST',evidence:'TEST RECEIPT',kind:'EMPLOYEE'}
await Promise.all([service.settlePayroll({...payment,requestId:'same'},accountant),service.settlePayroll({...payment,requestId:'same'},accountant)])
assert.equal((await db.collection('payrollPayments').get()).size,1)
const results=await Promise.allSettled([service.settlePayroll({...payment,requestId:'second'},accountant),service.settlePayroll({...payment,requestId:'third'},accountant)])
assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
assert.equal((await db.collection('payroll').doc(id).get()).data().outstanding,200)
assert.equal((await db.collection('operationalExpenses').get()).size,2)
const before=(await db.collection('accountPostingGuards').doc('BANK').get()).data().version
assert.equal(before,2)
await service.settlePayroll({...payment,requestId:'final',amount:200},accountant)
assert.equal((await db.collection('payroll').doc(id).get()).data().status,'Paid')
await assert.rejects(service.settlePayroll({...payment,requestId:'overpay',amount:1},accountant),/exceeds/)
const journals=(await db.collection('payrollJournal').get()).docs.map(d=>d.data())
const payments=(await db.collection('payrollPayments').get()).docs.map(d=>d.data())
assert.equal(core.payrollTotals(journals,payments,'2025-09-30').USD.employeePayable,1000)
assert.equal(core.payrollTotals(journals,payments,'2025-10-31','2025-10-01').USD.expense,0)
assert.equal(core.payrollTotals(journals,payments,'2025-10-31').USD.employeePayable,0)
await db.terminate()
console.log('Real Firestore emulator transactions passed: concurrent recognition, duplicate requests, partial payments, account guard, overpayment rejection and historical balances.')
