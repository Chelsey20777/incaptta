import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/features/inventory/utils/stock-additions.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
const { stockQuantity, submitStockAdditions } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
for (const value of ['', ' ', '0']) assert.equal(stockQuantity(value), 0)
assert.equal(stockQuantity('1.25'), 1.25)
for (const value of ['-1', 'NaN', 'Infinity', 'bad']) assert.throws(() => stockQuantity(value))
let next = 0
let balance = 4
const requests = new Set()
let failResponse = true
const submit = async (id, qty, key) => {
  if (!requests.has(key)) { balance += qty; requests.add(key) }
  if (id === 'retry' && failResponse) throw new Error('Response lost')
}
const remaining = await submitStockAdditions({ first: { value: '10' }, retry: { value: '2.5' }, blank: { value: '' } }, submit, () => `request-${++next}`)
assert.equal(balance, 16.5)
assert.deepEqual(Object.keys(remaining), ['retry'])
assert.equal(remaining.retry.requestId, 'request-2')
failResponse = false
assert.deepEqual(await submitStockAdditions(remaining, submit, () => { throw Error('Must reuse request ID') }), {})
assert.equal(balance, 16.5)
let called = false
await assert.rejects(submitStockAdditions({ good: { value: '1' }, bad: { value: '-2' } }, async () => { called = true }, () => 'x'))
assert.equal(called, false)
console.log('Stock additions: validation, decimals, partial failures and idempotent retries passed')
