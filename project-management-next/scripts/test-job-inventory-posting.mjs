import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/server/job-inventory-posting-core.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
const {
  inventoryLedgerId,
  isEligibleForManagerStockPost,
  listInventoryLines,
  postJobInventoryLineInTransaction,
} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

const actor = { uid: 'manager-1', name: 'Manager' }

function createStore({ onHand = 10, job, ledger } = {}) {
  const inventory = new Map([['inv-1', { onHand, uom: 'ea' }]])
  const jobs = new Map([['job-1', job]])
  const ledgers = new Map(ledger ? [[ledger.id, ledger.record]] : [])

  const snapshot = () => ({
    onHand: inventory.get('inv-1')?.onHand,
    job: jobs.get('job-1'),
    ledgerCount: ledgers.size,
  })

  const run = input => {
    const writes = []
    const tx = {
      getJob: async id => jobs.get(id) ?? null,
      getLedger: async id => ledgers.get(id) ?? null,
      getInventory: async id => inventory.get(id) ?? null,
      updateInventory: (id, nextOnHand) => writes.push(() => {
        inventory.set(id, { ...inventory.get(id), onHand: nextOnHand })
      }),
      createLedger: (id, record) => writes.push(() => {
        if (ledgers.has(id)) throw new Error('Ledger already exists')
        ledgers.set(id, record)
      }),
      updateJob: (id, data) => writes.push(() => {
        jobs.set(id, { ...jobs.get(id), ...data })
      }),
    }
    return postJobInventoryLineInTransaction(tx, input).then(result => {
      writes.forEach(write => write())
      return result
    })
  }

  return { run, snapshot, ledgers, jobs, inventory }
}

function issueJob(overrides = {}) {
  return {
    generalInfo: { jobNumber: 'JC-1' },
    requisitionSections: [{
      id: 'sec-1',
      items: [{
        id: 'line-1',
        inventoryItemId: 'inv-1',
        itemName: 'Pipe',
        qtyRequired: 4,
        approvalStatus: 'APPROVED_ACCOUNTANT',
        uom: 'ea',
        ...overrides,
      }],
    }],
    requisitionItems: [],
    inventoryReturns: [],
  }
}

function returnJob({ issuedQty = 4, returnQty = 50, issuedPosted = true, extraReturns = [] } = {}) {
  return {
    generalInfo: { jobNumber: 'JC-1' },
    requisitionSections: [{
      id: 'sec-1',
      items: [{
        id: 'line-1',
        inventoryItemId: 'inv-1',
        itemName: 'Pipe',
        qtyRequired: issuedQty,
        approvalStatus: issuedPosted ? 'APPROVED_MANAGER' : 'APPROVED_ACCOUNTANT',
        postingState: issuedPosted ? 'POSTED' : undefined,
        inventoryDeducted: issuedPosted,
      }],
    }],
    inventoryReturns: [{
      id: 'ret-1',
      inventoryItemId: 'inv-1',
      itemName: 'Pipe',
      qtyReturned: returnQty,
      approvalStatus: 'APPROVED_ACCOUNTANT',
    }, ...extraReturns],
  }
}

const issueInput = {
  jobCardId: 'job-1',
  lineId: 'line-1',
  movementType: 'ISSUE',
  actor,
}

{
  const store = createStore({ onHand: 10, job: issueJob() })
  const posted = await store.run(issueInput)
  assert.equal(posted.idempotent, false)
  assert.equal(store.snapshot().onHand, 6)
}

{
  const store = createStore({ onHand: 6, job: issueJob() })
  const first = await store.run(issueInput)
  assert.equal(first.idempotent, false)
  assert.equal(store.snapshot().onHand, 2)
  const retry = await store.run(issueInput)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.ledgerId, first.ledgerId)
  assert.equal(store.snapshot().onHand, 2)
  assert.equal(store.ledgers.size, 1)
}

{
  const store = createStore({ onHand: 3, job: issueJob() })
  await assert.rejects(() => store.run(issueInput), /Insufficient stock/)
  assert.equal(store.snapshot().onHand, 3)
  assert.equal(store.ledgers.size, 0)
}

{
  const store = createStore({
    onHand: 2,
    job: issueJob({ approvalStatus: 'APPROVED_ACCOUNTANT' }),
    ledger: {
      id: inventoryLedgerId('ISSUE', 'job-1', 'line-1'),
      record: {
        inventoryItemId: 'inv-1',
        movementType: 'ISSUE',
        qtyDelta: -4,
        qtyBefore: 6,
        qtyAfter: 2,
      },
    },
  })
  const retry = await store.run(issueInput)
  assert.equal(retry.idempotent, true)
  assert.equal(store.snapshot().onHand, 2)
}

{
  const store = createStore({ onHand: 10, job: returnJob({ issuedPosted: false, returnQty: 50 }) })
  await assert.rejects(() => store.run({
    jobCardId: 'job-1',
    lineId: 'ret-1',
    movementType: 'RETURN',
    actor,
  }), /No posted issue/)
  assert.equal(store.snapshot().onHand, 10)
}

{
  const store = createStore({ onHand: 6, job: returnJob({ issuedQty: 4, returnQty: 5 }) })
  await assert.rejects(() => store.run({
    jobCardId: 'job-1',
    lineId: 'ret-1',
    movementType: 'RETURN',
    actor,
  }), /Return exceeds issued quantity/)
  assert.equal(store.snapshot().onHand, 6)
}

{
  const store = createStore({
    onHand: 6,
    job: returnJob({
      issuedQty: 4,
      returnQty: 2,
      extraReturns: [{
        id: 'ret-0',
        inventoryItemId: 'inv-1',
        qtyReturned: 3,
        approvalStatus: 'APPROVED_MANAGER',
        postingState: 'POSTED',
        inventoryReturned: true,
      }],
    }),
  })
  await assert.rejects(() => store.run({
    jobCardId: 'job-1',
    lineId: 'ret-1',
    movementType: 'RETURN',
    actor,
  }), /Returnable: 1/)
}

{
  const store = createStore({ onHand: 6, job: returnJob({ issuedQty: 4, returnQty: 2 }) })
  const posted = await store.run({
    jobCardId: 'job-1',
    lineId: 'ret-1',
    movementType: 'RETURN',
    actor,
  })
  assert.equal(posted.idempotent, false)
  assert.equal(store.snapshot().onHand, 8)
}

{
  const store = createStore({
    onHand: 6,
    job: issueJob({ qtyRequired: 5 }),
    ledger: {
      id: inventoryLedgerId('ISSUE', 'job-1', 'line-1'),
      record: {
        inventoryItemId: 'inv-1',
        movementType: 'ISSUE',
        qtyDelta: -4,
        qtyBefore: 10,
        qtyAfter: 6,
      },
    },
  })
  await assert.rejects(() => store.run(issueInput), /Conflicting reuse of movement ID/)
  assert.equal(store.snapshot().onHand, 6)
}

{
  const store = createStore({ onHand: 10, job: issueJob({ qtyRequired: 0 }) })
  await assert.rejects(() => store.run(issueInput), /finite quantity/)
  assert.equal(store.snapshot().onHand, 10)
}

{
  const store = createStore({ onHand: 10, job: issueJob({ approvalStatus: 'PENDING' }) })
  await assert.rejects(() => store.run(issueInput), /Accountant approval/)
}

{
  const job = {
    requisitionSections: [{
      items: [
        { id: 'a', approvalStatus: 'APPROVED_ACCOUNTANT', itemName: 'One' },
        { id: 'b', approvalStatus: 'APPROVED_MANAGER', postingState: 'POSTED', itemName: 'Two' },
        { id: 'c', approvalStatus: 'APPROVED_ACCOUNTANT', postingState: 'FAILED', itemName: 'Three' },
      ],
    }],
  }
  const eligible = listInventoryLines(job, 'ISSUE').filter(isEligibleForManagerStockPost).map(row => row.id)
  assert.deepEqual(eligible, ['a', 'c'])
}

{
  const job = issueJob()
  job.requisitionSections[0].items.push({
    id: 'line-2',
    inventoryItemId: 'inv-1',
    itemName: 'Extra',
    qtyRequired: 100,
    approvalStatus: 'APPROVED_ACCOUNTANT',
  })
  const store = createStore({ onHand: 10, job })
  const results = { approved: 0, alreadyPosted: 0, failed: [] }
  for (const row of listInventoryLines(job, 'ISSUE').filter(isEligibleForManagerStockPost)) {
    try {
      const posted = await store.run({
        jobCardId: 'job-1',
        lineId: row.id,
        movementType: 'ISSUE',
        actor,
      })
      if (posted.idempotent) results.alreadyPosted += 1
      else results.approved += 1
    } catch (error) {
      results.failed.push({ lineId: row.id, reason: error.message })
    }
  }
  assert.equal(results.approved, 1)
  assert.equal(results.failed.length, 1)
  assert.equal(results.failed[0].lineId, 'line-2')
  assert.equal(store.snapshot().onHand, 6)
  const retry = { approved: 0, alreadyPosted: 0, failed: [] }
  const remaining = listInventoryLines(store.snapshot().job, 'ISSUE').filter(isEligibleForManagerStockPost)
  assert.deepEqual(remaining.map(row => row.id), ['line-2'])
  for (const row of remaining) {
    try {
      const posted = await store.run({
        jobCardId: 'job-1',
        lineId: row.id,
        movementType: 'ISSUE',
        actor,
      })
      if (posted.idempotent) retry.alreadyPosted += 1
      else retry.approved += 1
    } catch (error) {
      retry.failed.push({ lineId: row.id, reason: error.message })
    }
  }
  assert.equal(retry.approved, 0)
  assert.equal(retry.alreadyPosted, 0)
  assert.equal(retry.failed.length, 1)
  assert.equal(store.snapshot().onHand, 6)
  assert.equal(store.ledgers.size, 1)
}

console.log('Job inventory posting: idempotent retries, conflicts, return caps and bulk partials passed')
