import { db } from '../config/firebase'
import { FieldValue } from 'firebase-admin/firestore'

async function backfillPendingGRNs(): Promise<void> {
  console.log('=== GRN Backfill ===')
  console.log('Finding CONFIRMED GRNs with PENDING posting status...')

  const snap = await db
    .collection('procurementGrns')
    .where('status', '==', 'CONFIRMED')
    .where('inventoryPostingStatus', '==', 'PENDING')
    .get()

  if (snap.empty) {
    console.log('No stuck GRNs found. Nothing to do.')
    process.exit(0)
  }

  console.log(`\nFound ${snap.size} stuck GRN(s):`)
  snap.docs.forEach(d => {
    const data = d.data()
    console.log(
      `  ${data.grnNumber ?? d.id} | ` +
      `PO: ${data.poNumber ?? data.poId} | ` +
      `Supplier: ${data.supplierName}`
    )
  })

  console.log('\nWriting no-op update in 3 seconds to re-trigger...')
  console.log('Press Ctrl+C now to abort.\n')
  await new Promise(r => setTimeout(r, 3000))

  let success = 0
  let failed = 0

  for (const grnDoc of snap.docs) {
    try {
      await db
        .collection('procurementGrns')
        .doc(grnDoc.id)
        .update({
          _backfillTrigger: FieldValue.serverTimestamp()
        })
      console.log(
        `  ✓ Triggered: ${grnDoc.data().grnNumber ?? grnDoc.id}`
      )
      success++
      // Small delay between writes to avoid hammering the function
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.error(
        `  ✗ Failed: ${grnDoc.data().grnNumber ?? grnDoc.id}`,
        e
      )
      failed++
    }
  }

  console.log(`\n=== Backfill complete ===`)
  console.log(`  Triggered: ${success}`)
  console.log(`  Failed:    ${failed}`)
  console.log(`\nMonitor with: firebase functions:log --only onGRNConfirmed`)
  console.log('inventoryPostingStatus should change PENDING → PROCESSING → COMPLETE')
  process.exit(0)
}

backfillPendingGRNs().catch(e => {
  console.error('Backfill script error:', e)
  process.exit(1)
})
