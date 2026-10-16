/**
 * approvePayedJobCards.ts
 *
 * Progresses job cards that have already received client payments
 * to APPROVED_MANAGER status. Locks the invoice value at the point
 * of approval, matching the behaviour of approveJobCard() in jobCardsStore.ts.
 *
 * JC-2026-0141 (Franciscan Friars) is explicitly excluded — pending
 * accountant review of the payment discrepancy.
 *
 * Run: npx ts-node src/scripts/approvePayedJobCards.ts
 */

import { db } from '../config/firebase'
import { FieldValue } from 'firebase-admin/firestore'

// Job numbers to approve — Franciscan Friars deliberately omitted
const TARGET_JOB_NUMBERS = [
  'JC-2026-0145', // Mrs Kaukonde          — APPROVAL_PENDING_MANAGER  — fully paid
  'JC-2026-0144', // World Vision Feeders  — APPROVAL_PENDING_MANAGER  — 50% paid
  'JC-2026-0140', // Africa University     — APPROVAL_PENDING_MANAGER  — 25% paid
  'JC-2026-0137', // World Vision Const.   — APPROVAL_PENDING_ACCOUNTANT — 50% paid
]

const SKIPPED = 'JC-2026-0141' // Franciscan Friars — DO NOT TOUCH

;(async () => {
  const LINE  = '─'.repeat(80)
  const DLINE = '═'.repeat(80)

  console.log('\n' + DLINE)
  console.log('  APPROVE PAID JOB CARDS')
  console.log(`  Run at: ${new Date().toLocaleString('en-US')}`)
  console.log(`  Note: ${SKIPPED} (Franciscan Friars) is excluded from this run`)
  console.log(DLINE + '\n')

  // Fetch all targeted job cards by job number
  const snap = await db.collection('jobCards').get()
  const allCards = snap.docs.map(d => ({ docId: d.id, ...(d.data() as any) }))

  const targets = allCards.filter(jc =>
    TARGET_JOB_NUMBERS.includes(jc.generalInfo?.jobNumber)
  )

  if (targets.length === 0) {
    console.log('  No matching job cards found. Check job numbers.')
    process.exit(1)
  }

  console.log(`  Found ${targets.length} job card(s) to process:\n`)

  for (const jc of targets) {
    const jobNumber = jc.generalInfo?.jobNumber || jc.docId
    const client    = jc.generalInfo?.recipientName || 'Unknown'
    const status    = jc.status || 'UNKNOWN'

    // Resolve invoice value from stored totals (already computed by the UI)
    const invoiceValue = Number(
      jc.lockedTotalInvoiceValue ||
      jc.totals?.grandTotal ||
      jc.summary?.grandTotal ||
      0
    )

    console.log(`  Processing: ${jobNumber} — ${client}`)
    console.log(`  Current status : ${status}`)
    console.log(`  Invoice value  : $${invoiceValue.toFixed(2)}`)

    try {
      const docRef = db.collection('jobCards').doc(jc.docId)

      const approvalEntry = {
        user:   'System (Script)',
        role:   'SYSTEM',
        status: 'Approved → APPROVED_MANAGER',
        note:   'Auto-approved: client payment verified. Franciscan Friars excluded pending accountant review.',
        date:   new Date().toISOString(),
      }

      await docRef.update({
        status:                  'APPROVED_MANAGER',
        lockedTotalInvoiceValue: invoiceValue,
        updatedAt:               FieldValue.serverTimestamp(),
        approvalTimeline:        FieldValue.arrayUnion(approvalEntry),
      })

      console.log(`  ✓ Status updated to APPROVED_MANAGER`)
      console.log(`  ✓ Invoice value locked at $${invoiceValue.toFixed(2)}`)

    } catch (err: any) {
      console.error(`  ✗ Failed to update ${jobNumber}: ${err.message}`)
    }

    console.log(LINE)
  }

  console.log('\n  Done.\n')
  process.exit(0)
})()
