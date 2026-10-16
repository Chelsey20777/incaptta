/**
 * paymentVerification.ts
 *
 * Cross-references job card approval status against received payments.
 * Identifies pipeline job cards (not yet APPROVED_MANAGER / COMPLETED)
 * that already have client funds recorded — these are the highest priority
 * cards to push through the approval workflow.
 *
 * READ-ONLY — makes no changes to Firestore.
 *
 * Run: npx ts-node src/scripts/paymentVerification.ts
 */

import { db } from '../config/firebase'

const APPROVED_STATUSES = ['APPROVED_MANAGER', 'COMPLETED']

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pad(s: string, len: number) {
  return s.length >= len ? s.slice(0, len - 1) + '…' : s.padEnd(len)
}

;(async () => {
  // ── Fetch all job cards ──────────────────────────────────────────────────────
  const jcSnap = await db.collection('jobCards').get()
  const allJobCards = jcSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))

  // ── Fetch all payments ───────────────────────────────────────────────────────
  const pymSnap = await db.collection('jobPayments').get()
  const allPayments = pymSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))

  // ── Group payments by jobCardId ──────────────────────────────────────────────
  const paymentsByJob = new Map<string, { total: number; count: number; payments: any[] }>()
  for (const p of allPayments) {
    const jid = String(p.jobCardId || '')
    if (!jid) continue
    if (!paymentsByJob.has(jid)) paymentsByJob.set(jid, { total: 0, count: 0, payments: [] })
    const entry = paymentsByJob.get(jid)!
    entry.total  += Number(p.amount || 0)
    entry.count  += 1
    entry.payments.push(p)
  }

  // ── Pipeline cards (not yet approved) ───────────────────────────────────────
  const pipelineCards = allJobCards.filter(jc => !APPROVED_STATUSES.includes(jc.status || ''))

  // ── Cards with payments ──────────────────────────────────────────────────────
  interface CardWithPayments {
    ref: string
    client: string
    status: string
    invoiceValue: number
    totalPaid: number
    balance: number
    paymentCount: number
    fullyPaid: boolean
  }

  const cardsWithPayments: CardWithPayments[] = []
  const cardsWithoutPayments: any[] = []

  for (const jc of pipelineCards) {
    const ref     = jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase()
    const client  = jc.generalInfo?.recipientName || jc.clientName || jc.preparedFor?.name || 'Unknown'
    const status  = jc.status || 'UNKNOWN'
    const invoice = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)

    const pymInfo = paymentsByJob.get(jc.id)
    if (pymInfo && pymInfo.total > 0) {
      const balance = invoice - pymInfo.total
      cardsWithPayments.push({
        ref,
        client,
        status,
        invoiceValue: invoice,
        totalPaid: pymInfo.total,
        balance,
        paymentCount: pymInfo.count,
        fullyPaid: pymInfo.total >= invoice && invoice > 0,
      })
    } else {
      cardsWithoutPayments.push({ ref, client, status, invoiceValue: invoice })
    }
  }

  // Sort: fully paid first, then by total paid descending
  cardsWithPayments.sort((a, b) => {
    if (a.fullyPaid && !b.fullyPaid) return -1
    if (!a.fullyPaid && b.fullyPaid) return 1
    return b.totalPaid - a.totalPaid
  })

  const LINE  = '─'.repeat(100)
  const DLINE = '═'.repeat(100)

  console.log('\n' + DLINE)
  console.log('  INCAPTTA PRO — PAYMENT VERIFICATION REPORT')
  console.log(`  Generated: ${new Date().toLocaleString('en-US')}`)
  console.log(DLINE)

  // ── Summary ──────────────────────────────────────────────────────────────────
  const fullyPaidCount   = cardsWithPayments.filter(c => c.fullyPaid).length
  const partialCount     = cardsWithPayments.filter(c => !c.fullyPaid).length
  const totalPaidOnPipeline = cardsWithPayments.reduce((s, c) => s + c.totalPaid, 0)
  const totalInvoicePipeline = cardsWithPayments.reduce((s, c) => s + c.invoiceValue, 0)

  console.log('\n  SUMMARY')
  console.log(LINE)
  console.log(`  Pipeline job cards (not yet approved)          : ${pipelineCards.length}`)
  console.log(`  ├─ Cards WITH payments received                : ${cardsWithPayments.length}`)
  console.log(`  │   ├─ FULLY PAID but unapproved (urgent!)     : ${fullyPaidCount}`)
  console.log(`  │   └─ Partially paid, unapproved              : ${partialCount}`)
  console.log(`  └─ Cards with NO payments yet                  : ${cardsWithoutPayments.length}`)
  console.log(`\n  Total funds received on unapproved cards       : ${fmt(totalPaidOnPipeline)}`)
  console.log(`  Total invoice value of those cards             : ${fmt(totalInvoicePipeline)}`)
  console.log(`  Outstanding balance                            : ${fmt(totalInvoicePipeline - totalPaidOnPipeline)}`)

  // ── Cards with payments ───────────────────────────────────────────────────────
  if (cardsWithPayments.length > 0) {
    console.log('\n\n  JOB CARDS WITH FUNDS RECEIVED (sorted by priority)')
    console.log(DLINE)
    console.log(
      `  ${'JOB REF'.padEnd(20)} ${'CLIENT'.padEnd(28)} ${'STATUS'.padEnd(28)} ${'INVOICE'.padStart(12)} ${'PAID'.padStart(12)} ${'BALANCE'.padStart(12)}  FLAG`
    )
    console.log(LINE)

    for (const c of cardsWithPayments) {
      const flag = c.fullyPaid
        ? '*** FULLY PAID - APPROVE NOW ***'
        : `${((c.totalPaid / c.invoiceValue) * 100).toFixed(0)}% paid`
      console.log(
        `  ${pad(c.ref, 20)} ${pad(c.client, 28)} ${pad(c.status, 28)} ${fmt(c.invoiceValue).padStart(12)} ${fmt(c.totalPaid).padStart(12)} ${fmt(c.balance).padStart(12)}  ${flag}`
      )
    }
  } else {
    console.log('\n  No pipeline job cards have payments recorded.')
  }

  // ── Cards without payments ────────────────────────────────────────────────────
  if (cardsWithoutPayments.length > 0) {
    console.log('\n\n  PIPELINE CARDS WITH NO PAYMENTS (standard approval queue)')
    console.log(DLINE)
    console.log(`  ${'JOB REF'.padEnd(20)} ${'CLIENT'.padEnd(32)} ${'STATUS'.padEnd(30)} ${'INVOICE VALUE'.padStart(14)}`)
    console.log(LINE)
    for (const c of cardsWithoutPayments) {
      console.log(
        `  ${pad(c.ref, 20)} ${pad(c.client, 32)} ${pad(c.status, 30)} ${fmt(c.invoiceValue).padStart(14)}`
      )
    }
  }

  // ── Approved cards — payment status for reference ─────────────────────────────
  const approvedCards = allJobCards.filter(jc => APPROVED_STATUSES.includes(jc.status || ''))
  console.log('\n\n  APPROVED CARDS — COLLECTION STATUS')
  console.log(DLINE)
  console.log(`  ${'JOB REF'.padEnd(20)} ${'CLIENT'.padEnd(28)} ${'STATUS'.padEnd(18)} ${'INVOICE'.padStart(12)} ${'COLLECTED'.padStart(12)} ${'OUTSTANDING'.padStart(12)}`)
  console.log(LINE)

  let totalApprovedInvoice = 0
  let totalApprovedCollected = 0

  for (const jc of approvedCards) {
    const ref     = jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase()
    const client  = jc.generalInfo?.recipientName || jc.clientName || jc.preparedFor?.name || 'Unknown'
    const invoice = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)
    const pymInfo = paymentsByJob.get(jc.id)
    const collected = pymInfo?.total || 0
    const outstanding = invoice - collected

    totalApprovedInvoice   += invoice
    totalApprovedCollected += collected

    console.log(
      `  ${pad(ref, 20)} ${pad(client, 28)} ${pad(jc.status, 18)} ${fmt(invoice).padStart(12)} ${fmt(collected).padStart(12)} ${fmt(outstanding).padStart(12)}`
    )
  }

  console.log(LINE)
  console.log(
    `  ${'TOTAL'.padEnd(66)} ${fmt(totalApprovedInvoice).padStart(12)} ${fmt(totalApprovedCollected).padStart(12)} ${fmt(totalApprovedInvoice - totalApprovedCollected).padStart(12)}`
  )

  console.log('\n' + DLINE + '\n')
  process.exit(0)
})()
