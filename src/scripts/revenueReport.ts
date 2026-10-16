/**
 * revenueReport.ts
 *
 * Accrual-basis revenue analysis per client.
 * Revenue = sum of lockedTotalInvoiceValue (or totals.grandTotal) on
 *           APPROVED_MANAGER and COMPLETED job cards.
 * Expenses = sum of amount on operationalExpenses with status APPROVED.
 *
 * Run: npx ts-node -P tsconfig.scripts.json src/scripts/revenueReport.ts
 */

import { db } from '../config/firebase'

const REVENUE_STATUSES = ['APPROVED_MANAGER', 'COMPLETED']
const EXPENSE_STATUS   = 'APPROVED'

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pad(s: string, len: number) {
  return s.length >= len ? s.slice(0, len - 1) + '…' : s.padEnd(len)
}

;(async () => {
  // ── Fetch job cards ──────────────────────────────────────────────────────────
  const jcSnap = await db.collection('jobCards').get()
  const allJobCards = jcSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))

  // ── Fetch OPEX expenses ──────────────────────────────────────────────────────
  const expSnap = await db.collection('operationalExpenses')
    .where('status', '==', EXPENSE_STATUS)
    .get()
  const approvedExpenses = expSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))

  // ── Group job cards by client ────────────────────────────────────────────────
  interface ClientSummary {
    client: string
    jobs: { ref: string; status: string; invoiceValue: number; date: string }[]
    totalInvoiced: number
    // Expenses linked to this client's job cards (via jobCardId field on expense)
    linkedExpenses: number
  }

  const clientMap = new Map<string, ClientSummary>()

  // Build a set of jobCard IDs that count as revenue
  const revenueJobIds = new Set<string>()

  for (const jc of allJobCards) {
    const client: string =
      jc.generalInfo?.recipientName ||
      jc.clientName ||
      jc.preparedFor?.name ||
      'Unknown Client'

    const status: string = jc.status || 'UNKNOWN'
    const ref: string = jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase()
    const date: string = jc.generalInfo?.dateIssued
      ? new Date(jc.generalInfo.dateIssued).toLocaleDateString('en-US')
      : jc.createdAt?.toDate
        ? jc.createdAt.toDate().toLocaleDateString('en-US')
        : 'N/A'

    const invoiceValue = REVENUE_STATUSES.includes(status)
      ? Number(
          jc.lockedTotalInvoiceValue ||
          jc.totals?.grandTotal ||
          jc.summary?.grandTotal ||
          0,
        )
      : 0

    if (invoiceValue > 0) revenueJobIds.add(jc.id)

    if (!clientMap.has(client)) {
      clientMap.set(client, { client, jobs: [], totalInvoiced: 0, linkedExpenses: 0 })
    }
    const entry = clientMap.get(client)!
    entry.jobs.push({ ref, status, invoiceValue, date })
    entry.totalInvoiced += invoiceValue
  }

  // ── Link expenses to clients (via jobCardId) ─────────────────────────────────
  // Expenses that have no jobCardId are treated as "Unallocated" overhead.
  let unallocatedExpenses = 0
  const jobCardToClient = new Map<string, string>()
  for (const jc of allJobCards) {
    const client: string =
      jc.generalInfo?.recipientName ||
      jc.clientName ||
      jc.preparedFor?.name ||
      'Unknown Client'
    jobCardToClient.set(jc.id, client)
  }

  for (const exp of approvedExpenses) {
    const linkedJobId: string | undefined = exp.jobCardId || exp.linkedJobCardId
    if (linkedJobId && jobCardToClient.has(linkedJobId)) {
      const client = jobCardToClient.get(linkedJobId)!
      if (clientMap.has(client)) {
        clientMap.get(client)!.linkedExpenses += Number(exp.amount || 0)
      } else {
        unallocatedExpenses += Number(exp.amount || 0)
      }
    } else {
      unallocatedExpenses += Number(exp.amount || 0)
    }
  }

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalInvoiced = Array.from(clientMap.values()).reduce((s, c) => s + c.totalInvoiced, 0)
  const totalExpenses = approvedExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const netRevenue    = totalInvoiced - totalExpenses

  // ── Draft job cards (not yet in revenue) ────────────────────────────────────
  const draftCards = allJobCards.filter(jc => !REVENUE_STATUSES.includes(jc.status || ''))
  const draftPotential = draftCards.reduce((s, jc) =>
    s + Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0), 0)

  // ── Print report ─────────────────────────────────────────────────────────────
  const LINE = '─'.repeat(90)
  const DLINE = '═'.repeat(90)

  console.log('\n' + DLINE)
  console.log('  INCAPTTA PRO — NET REVENUE ANALYSIS REPORT')
  console.log(`  Generated: ${new Date().toLocaleString('en-US')}`)
  console.log(DLINE)

  // Summary header
  console.log('\n  EXECUTIVE SUMMARY')
  console.log(LINE)
  console.log(`  Total Invoiced Revenue (accrual)  : ${fmt(totalInvoiced)}`)
  console.log(`  Total Approved OPEX Expenses      : ${fmt(totalExpenses)}`)
  console.log(`  NET REVENUE                       : ${fmt(netRevenue)}  ${netRevenue < 0 ? '⚠ DEFICIT' : '✓ SURPLUS'}`)
  console.log(`  Unallocated Overhead Expenses     : ${fmt(unallocatedExpenses)}`)
  console.log(`  Pipeline (draft/unapproved cards) : ${fmt(draftPotential)}  (not yet in revenue)`)

  // ── Per-client breakdown ──────────────────────────────────────────────────────
  const clients = Array.from(clientMap.values())
    .sort((a, b) => (a.totalInvoiced - a.linkedExpenses) - (b.totalInvoiced - b.linkedExpenses))

  console.log('\n\n  PER-CLIENT BREAKDOWN  (sorted by net contribution, worst first)')
  console.log(DLINE)
  console.log(
    `  ${'CLIENT'.padEnd(32)} ${'INVOICED'.padStart(14)} ${'LINKED EXP'.padStart(14)} ${'CLIENT NET'.padStart(14)} ${'JOBS'.padStart(5)}`
  )
  console.log(LINE)

  for (const c of clients) {
    const clientNet = c.totalInvoiced - c.linkedExpenses
    const flag = clientNet < 0 ? ' ⚠' : ''
    console.log(
      `  ${pad(c.client, 32)} ${fmt(c.totalInvoiced).padStart(14)} ${fmt(c.linkedExpenses).padStart(14)} ${(fmt(clientNet) + flag).padStart(16)} ${String(c.jobs.length).padStart(5)}`
    )
  }

  if (unallocatedExpenses > 0) {
    console.log(LINE)
    console.log(
      `  ${'[Unallocated overhead]'.padEnd(32)} ${''.padStart(14)} ${fmt(unallocatedExpenses).padStart(14)} ${fmt(-unallocatedExpenses).padStart(16)}`
    )
  }

  console.log(LINE)
  console.log(
    `  ${'TOTAL'.padEnd(32)} ${fmt(totalInvoiced).padStart(14)} ${fmt(totalExpenses).padStart(14)} ${fmt(netRevenue).padStart(16)}`
  )

  // ── Detailed job card list per client ─────────────────────────────────────────
  console.log('\n\n  DETAILED JOB CARD BREAKDOWN PER CLIENT')
  console.log(DLINE)

  for (const c of clients) {
    const clientNet = c.totalInvoiced - c.linkedExpenses
    console.log(`\n  CLIENT: ${c.client}`)
    console.log(`  Invoiced: ${fmt(c.totalInvoiced)}  |  Linked Expenses: ${fmt(c.linkedExpenses)}  |  Net: ${fmt(clientNet)}${clientNet < 0 ? '  ⚠ DEFICIT' : ''}`)
    console.log('  ' + '─'.repeat(70))
    console.log(`  ${'JOB REF'.padEnd(20)} ${'STATUS'.padEnd(20)} ${'DATE'.padEnd(14)} ${'INVOICE VALUE'.padStart(14)}`)
    console.log('  ' + '─'.repeat(70))

    // Show revenue-generating jobs
    const revenueJobs = c.jobs.filter(j => j.invoiceValue > 0)
    const nonRevenueJobs = c.jobs.filter(j => j.invoiceValue === 0)

    if (revenueJobs.length === 0 && c.totalInvoiced === 0) {
      console.log('  (No approved/completed job cards — no recognised revenue)')
    }
    for (const j of revenueJobs) {
      console.log(`  ${pad(j.ref, 20)} ${pad(j.status, 20)} ${j.date.padEnd(14)} ${fmt(j.invoiceValue).padStart(14)}`)
    }
    if (nonRevenueJobs.length > 0) {
      console.log(`\n  Pending/Draft (not in revenue):`)
      for (const j of nonRevenueJobs) {
        console.log(`    ${pad(j.ref, 20)} ${j.status}`)
      }
    }
  }

  // ── Draft pipeline ────────────────────────────────────────────────────────────
  if (draftCards.length > 0) {
    console.log('\n\n  PIPELINE — JOBS NOT YET APPROVED (potential future revenue)')
    console.log(DLINE)
    console.log(`  ${'JOB REF'.padEnd(20)} ${'CLIENT'.padEnd(32)} ${'STATUS'.padEnd(20)} ${'POTENTIAL VALUE'.padStart(16)}`)
    console.log(LINE)
    for (const jc of draftCards) {
      const ref    = jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase()
      const client = jc.generalInfo?.recipientName || jc.clientName || jc.preparedFor?.name || 'Unknown'
      const val    = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)
      if (val > 0) {
        console.log(`  ${pad(ref, 20)} ${pad(client, 32)} ${pad(jc.status || 'UNKNOWN', 20)} ${fmt(val).padStart(16)}`)
      }
    }
    console.log(LINE)
    console.log(`  ${'TOTAL PIPELINE'.padEnd(72)} ${fmt(draftPotential).padStart(16)}`)
  }

  // ── Diagnosis ────────────────────────────────────────────────────────────────
  console.log('\n\n  DIAGNOSIS')
  console.log(DLINE)

  if (netRevenue < 0) {
    console.log(`\n  Net revenue is NEGATIVE by ${fmt(Math.abs(netRevenue))}.\n`)

    if (totalInvoiced === 0) {
      console.log('  ► No job cards have been approved or completed yet.')
      console.log('    All expenses are being counted against zero recognised revenue.')
      console.log('    ACTION: Ensure job cards are progressed to APPROVED_MANAGER or COMPLETED status.')
    } else {
      const expenseRatio = (totalExpenses / totalInvoiced * 100).toFixed(1)
      console.log(`  ► Approved OPEX expenses are ${expenseRatio}% of invoiced revenue.`)

      if (unallocatedExpenses > 0) {
        const unallocPct = (unallocatedExpenses / totalExpenses * 100).toFixed(1)
        console.log(`  ► ${fmt(unallocatedExpenses)} (${unallocPct}% of expenses) are not linked to any job card.`)
        console.log('    These are overhead costs with no corresponding revenue.')
        console.log('    ACTION: Review unlinked expenses and assign them to job cards where possible.')
      }

      const deficitClients = clients.filter(c => c.totalInvoiced > 0 && (c.totalInvoiced - c.linkedExpenses) < 0)
      if (deficitClients.length > 0) {
        console.log(`\n  ► ${deficitClients.length} client(s) show expenses exceeding their invoiced revenue:`)
        for (const c of deficitClients) {
          console.log(`    - ${c.client}: invoiced ${fmt(c.totalInvoiced)}, spent ${fmt(c.linkedExpenses)}`)
        }
      }

      if (draftPotential > 0) {
        const projectedNet = netRevenue + draftPotential
        console.log(`\n  ► If all ${draftCards.length} pipeline job(s) (${fmt(draftPotential)}) were approved,`)
        console.log(`    projected net revenue would be: ${fmt(projectedNet)}  ${projectedNet >= 0 ? '✓ SURPLUS' : '⚠ STILL DEFICIT'}`)
      }
    }
  } else {
    console.log(`\n  ✓ Net revenue is POSITIVE at ${fmt(netRevenue)}.`)
  }

  console.log('\n' + DLINE + '\n')
  process.exit(0)
})()
