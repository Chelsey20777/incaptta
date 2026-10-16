import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const load = (relative) => {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const enquiry = await load('../src/lib/crm/enquiry.ts')
const quote = await load('../src/lib/crm/quotation-commercial.ts')
const jobs = await load('../src/lib/jobs/stages.ts')
const stock = await load('../src/lib/inventory/locations.ts')

assert.equal(enquiry.normalizeLeadPriority('Medium'), 'MEDIUM')
assert.deepEqual(enquiry.validateEnquiryCapture({
  contactName: 'Ada',
  partyType: 'individual',
  channel: 'WhatsApp',
  phone: '0771',
  requirementSummary: 'Tank',
  nextActionSummary: 'Call back',
  nextActionDueAt: '2026-09-27T09:00',
}), [])
assert.ok(enquiry.validateEnquiryCapture({ contactName: 'Ada', partyType: 'individual' }).length > 0)
assert.equal(enquiry.canAdvanceLeadStage('New', 'Proposal', {}).ok, false)
assert.equal(enquiry.canAdvanceLeadStage('New', 'Proposal', { sentApprovedQuote: true }).ok, true)
assert.equal(enquiry.closedLeadStats([{ stage: 'Won' }, { stage: 'New' }, { stage: 'Lost' }]).winRate, 50)

const commercials = quote.calculateQuoteCommercials({
  materials: [{ qtyRequired: 2, irdSellingPrice: 100, markupPercent: 10 }],
  services: [{ qty: 1, price: 50 }],
  vatEnabled: true,
  vatRate: 15,
  internalCosting: { labourEstimate: 20 },
})
assert.equal(commercials.irdCharge, 200)
assert.equal(commercials.twidMarkup, 20)
assert.equal(commercials.services, 50)
assert.equal(commercials.subtotal, 270)
assert.equal(commercials.customerTotal, 310.5)
assert.equal(commercials.estimatedProfit, 50)
assert.ok(quote.customerFacingQuote({ internalCosting: { labourEstimate: 1 }, grandTotal: 10 }).internalCosting == null)
assert.deepEqual(quote.acceptanceDocumentIds('abc'), {
  jobCardId: 'job_from_quote_abc',
  invoiceId: 'inv_from_quote_abc_r1',
})
assert.equal(quote.reviewAfterCommercialEdit('APPROVED_TO_SEND', true), 'PENDING_MANAGER')
assert.equal(jobs.jobStatusLabel('APPROVED_MANAGER'), 'Approved')
assert.equal(jobs.jobStatusLabel('APPROVED_MANAGER', '2026-01-01'), 'In Progress')
assert.equal(stock.availableStock({ onHand: 100, reserved: 30 }), 70)
assert.equal(stock.openingSnapshotForDefaultLocation(12).locationId, 'default')

const fulfilment = await load('../src/lib/inventory/fulfilment.ts')
const reserved = fulfilment.applyReserve({ onHand: 100, reserved: 0 }, 30)
assert.equal(reserved.onHand, 100)
assert.equal(reserved.reserved, 30)
assert.equal(reserved.available, 70)
const dispatched = fulfilment.applyDispatch(reserved, { reservedQty: 30, issuedQty: 0 }, 20)
assert.equal(dispatched.onHand, 80)
assert.equal(dispatched.reserved, 10)
const released = fulfilment.applyRelease(dispatched, { reservedQty: 30, issuedQty: 20 })
assert.equal(released.onHand, 80)
assert.equal(released.reserved, 0)
await assert.rejects(async () => fulfilment.applyReserve({ onHand: 3, reserved: 0 }, 4))
assert.throws(
  () => fulfilment.applyDispatch(reserved, { qtyRequired: 30, reservedQty: 30, issuedQty: 0 }, 31),
  /remaining required quantity/,
)
assert.throws(
  () => fulfilment.applyDispatch(reserved, { qtyRequired: 30, reservedQty: 20, issuedQty: 0 }, 25),
  /exceeds reservation/,
)
const fullyIssued = fulfilment.applyDispatch(reserved, { qtyRequired: 30, reservedQty: 30, issuedQty: 0 }, 30)
assert.equal(fullyIssued.onHand, 70)
assert.equal(fullyIssued.reserved, 0)
assert.throws(
  () => fulfilment.applyDispatch(fullyIssued, { qtyRequired: 30, reservedQty: 30, issuedQty: 30, fulfilmentState: 'ISSUED' }, 1),
  /already been issued/,
)
assert.throws(
  () => fulfilment.applyDispatch(fullyIssued, { qtyRequired: 30, reservedQty: 30, issuedQty: 30 }, 1),
  /already been released/,
)
const sessionLines = fulfilment.planFulfilmentSession([
  { id: 'pipe', itemName: 'Pipe', qtyRequired: 10, reservedQty: 10, issuedQty: 0 },
  { id: 'valve', itemName: 'Valve', qtyRequired: 2, reservedQty: 2, issuedQty: 0 },
  { id: 'bolt', itemName: 'Bolt', qtyRequired: 5, reservedQty: 5, issuedQty: 5, fulfilmentState: 'ISSUED' },
])
assert.equal(sessionLines.length, 2)
assert.equal(sessionLines[0].quantity, 10)
assert.equal(sessionLines[1].quantity, 2)
assert.throws(
  () => fulfilment.planFulfilmentSession([
    { id: 'bolt', itemName: 'Bolt', qtyRequired: 5, reservedQty: 5, issuedQty: 5, fulfilmentState: 'ISSUED' },
  ]),
  /No remaining reserved items/,
)

const activities = await load('../src/lib/crm/enquiry-activities.ts')
assert.equal(activities.validateNextActionReplacement({ completing: true }), 'Completing the current action requires another action or a recorded closure')
assert.equal(activities.classifyFollowUps([
  { stage: 'New', nextActionDueAt: '2000-01-01T00:00', owner: { uid: 'me' } },
], 'me').overdue.length, 1)

const calendar = await load('../src/lib/ops/business-calendar.ts')
const monday = new Date('2026-09-28T07:00:00')
const first = calendar.firstResponseDue(monday, monday, { firstResponseHours: 2, openHour: 8, closeHour: 17, weekdays: [1,2,3,4,5] })
assert.ok(first.dueAt.startsWith('2026-09-28'))
const timers = calendar.enquiryTimerState({
  receivedAt: '2026-09-28T08:00:00',
  capturedAt: '2026-09-28T08:00:00',
  nextActionDueAt: '2026-09-28T10:00:00',
  now: new Date('2026-09-28T09:40:00'),
  calendar: { reminderMinutes: 30, firstResponseHours: 2, escalationHours: 4, openHour: 8, closeHour: 17, weekdays: [1,2,3,4,5] },
})
assert.equal(timers.reminderDue, true)

const billing = await load('../src/lib/crm/billing-terms.ts')
assert.equal(billing.invoiceDueDate('2026-09-26', { arrangement: 'FULL_UPFRONT', netDays: 30 }), '2026-09-26')
assert.equal(billing.invoiceDueDate('2026-09-26', { arrangement: 'CREDIT', netDays: 14 }), '2026-10-10')
assert.equal(billing.initialBillableAmount(1000, { arrangement: 'DEPOSIT_BALANCE', depositPercent: 30 }), 300)
assert.equal(billing.draftInvoiceIssuable({ arrangement: 'MILESTONES' }), false)
assert.equal(billing.canSendInvoice('DRAFT'), false)
assert.equal(billing.canSendInvoice('ISSUED'), true)

const checks = await load('../src/lib/jobs/checklists.ts')
assert.equal(checks.canSubmitJob({}).ok, false)
assert.equal(checks.canCloseJob({ completed: { materialsReconciled: true, costsReconciled: true, financialChecklist: true }, outstandingBalance: 10, blockUnpaid: true }).ok, false)
assert.equal(checks.canCloseJob({ completed: { materialsReconciled: true, costsReconciled: true, financialChecklist: true }, outstandingBalance: 10, blockUnpaid: false }).ok, true)
assert.equal(jobs.jobStatusLabel('APPROVED_MANAGER', null, '2026-09-26'), 'Ready to Start')

const policies = await load('../src/lib/inventory/open-policies.ts')
assert.equal(policies.usableOnHand({ onHand: 10, damagedQty: 3 }), 7)
assert.equal(policies.canSelfApproveAdjustment('a', 'a'), false)
assert.equal(policies.reservationExpired('2000-01-01T00:00:00.000Z', Date.parse('2000-01-04T01:00:00.000Z'), 72), true)

const costs = await load('../src/lib/jobs/cost-status.ts')
const buckets = costs.jobCostBuckets({
  adHocExpenses: [{ totalAmount: 50 }, { totalAmount: 20, approvalStatus: 'APPROVED_MANAGER', opexId: 'x' }],
})
assert.equal(buckets.expenses.budget, 70)
assert.equal(buckets.expenses.committed, 20)
assert.equal(buckets.expenses.paid, 20)
assert.equal(buckets.missingStatusNotCountedAsApproved, true)

const damagedReserve = fulfilment.applyReserve({ onHand: 10, reserved: 0, damagedQty: 4 }, 6)
assert.equal(damagedReserve.reserved, 6)
await assert.rejects(async () => fulfilment.applyReserve({ onHand: 10, reserved: 0, damagedQty: 5 }, 6))

console.log('Architecture workflow: enquiry, quote commercial, job labels, location, fulfilment, calendar, billing, checklists and cost status passed')
