import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'
register('./resolve-ts-extension.mjs', import.meta.url)

import {
  PMO_ACKNOWLEDGEMENT_EMAIL,
  buildPmoAcknowledgementEmail,
  buildPmoReceiptEmail,
  buildPmoReceiptPostedEmail,
  receiptEntryPdfFilename,
  reportAcknowledgementEmail,
  reportPostedReceiptEmail,
  reportReceiptEmail,
} from '../src/lib/server/pmo-acknowledgement-email.ts'

const notice = {
  jobNumber: 'JC-2026-0004',
  recipient: 'Adonis Muzata',
  issuedBy: 'Project Manager Officer',
  issuedAt: '2026-10-09T00:00:00.000Z',
  lines: [
    { name: 'PVC Curtains 3m x 1m', sku: 'PVC3M', quantity: 3 },
    { name: 'Pan', sku: '', quantity: 4 },
  ],
}

test('issue email lists the job and released lines', () => {
  const message = buildPmoAcknowledgementEmail(notice)
  assert.equal(message.to, PMO_ACKNOWLEDGEMENT_EMAIL)
  assert.equal(message.to, 'inv-incaptta@deltorkesmak.co.zw')
  assert.match(message.subject, /JC-2026-0004/)
  assert.match(message.text, /Adonis Muzata/)
  assert.match(message.text, /Project Manager Officer/)
  assert.match(message.text, /At: 9 Oct 2026, 02:00 CAT/)
  assert.doesNotMatch(message.text, /2026-10-09T00:00:00.000Z/)
  assert.match(
    buildPmoAcknowledgementEmail({ ...notice, issuedAt: 'not-a-date' }).text,
    /At: not-a-date/,
  )
  assert.match(message.text, /PVC Curtains 3m x 1m \(PVC3M\) × 3/)
  assert.match(message.text, /Pan × 4/)
})

test('receipt email uses the same notice address', () => {
  const message = buildPmoReceiptEmail({
    itemName: 'PVC Curtains 3m x 1m',
    sku: 'PVC3M',
    quantity: 3,
    uom: 'PCS',
    reference: 'DN-44',
    note: 'Arrived this morning',
    submittedBy: 'Project Manager Officer',
    submittedAt: '2026-10-09T00:00:00.000Z',
  })
  assert.equal(message.to, PMO_ACKNOWLEDGEMENT_EMAIL)
  assert.equal(message.subject, 'Stock receipt awaiting approval')
  assert.match(message.text, /PVC Curtains 3m x 1m \(PVC3M\)/)
  assert.match(message.text, /3 PCS/)
  assert.match(message.text, /DN-44/)
  assert.match(message.text, /Arrived this morning/)
  assert.match(message.text, /Project Manager Officer/)
  assert.match(message.text, /At: 9 Oct 2026, 02:00 CAT/)
  assert.match(message.text, /Stock has not changed/)
})

test('a skipped or failed receipt send does not throw', async () => {
  const failed = await reportReceiptEmail({
    itemName: 'Pan',
    quantity: 1,
    reference: 'DN-1',
    submittedBy: 'PMO',
    submittedAt: '2026-10-09T00:00:00.000Z',
  }, async () => {
    throw new Error('Resend unavailable')
  })
  assert.equal(failed.sent, false)
  assert.equal(failed.error, 'Resend unavailable')
})

const posted = {
  itemName: 'PVC Curtains 3m x 1m',
  sku: 'PVC3M',
  quantity: 3,
  uom: 'PCS',
  reference: 'DN-44',
  note: 'Arrived this morning',
  submittedBy: 'Technical Officer',
  pmoApprovedBy: 'Project Manager Officer',
  approvedBy: 'Warehouse Manager',
  approvedAt: '2026-10-09T00:00:00.000Z',
  qtyBefore: 10,
  qtyAfter: 13,
}

test('posted receipt email attaches the new inventory entry', async () => {
  const filename = receiptEntryPdfFilename(posted.reference)
  assert.equal(filename, 'New_inventory_entry_DN-44.pdf')
  const message = buildPmoReceiptPostedEmail({
    ...posted,
    attachment: { filename, content: 'QQ==' },
  })
  assert.equal(message.to, PMO_ACKNOWLEDGEMENT_EMAIL)
  assert.equal(message.subject, 'New inventory entry DN-44')
  assert.equal(message.attachments[0].filename, filename)
  assert.match(message.text, /Stock has been updated/)
  assert.match(message.text, /Stock after: 13/)
  assert.match(message.text, /At: 9 Oct 2026, 02:00 CAT/)
  const failed = await reportPostedReceiptEmail({
    ...posted,
    attachment: { filename, content: 'QQ==' },
  }, async () => {
    throw new Error('Resend unavailable')
  })
  assert.equal(failed.sent, false)
  assert.equal(failed.error, 'Resend unavailable')
})

test('new inventory entry pdf is a pdf', async () => {
  const { buildPmoReceiptEntryPdf } = await import('../src/lib/server/pmo-receipt-entry-pdf.ts')
  const pdf = await buildPmoReceiptEntryPdf(posted)
  assert.equal(pdf.filename, 'New_inventory_entry_DN-44.pdf')
  assert.equal(Buffer.from(pdf.content, 'base64').subarray(0, 5).toString(), '%PDF-')
})

test('a skipped or failed send does not throw', async () => {
  const skipped = await reportAcknowledgementEmail(notice, async () => ({
    success: false,
    error: 'Outbound email is disabled in this environment.',
  }))
  assert.equal(skipped.sent, false)
  assert.match(skipped.error, /disabled/)

  const failed = await reportAcknowledgementEmail(notice, async () => {
    throw new Error('Resend unavailable')
  })
  assert.equal(failed.sent, false)
  assert.equal(failed.error, 'Resend unavailable')
})
