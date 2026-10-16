/**
 * inspectJobCardItems.ts
 * Prints costSnapshot, irdSellingPrice, qty for every item on a job card.
 * Run: npx ts-node src/scripts/inspectJobCardItems.ts
 */

import { db } from '../config/firebase'

const JOB_NUMBER = 'JC-2026-0190'

;(async () => {
    const snap = await db.collection('jobCards')
        .where('generalInfo.jobNumber', '==', JOB_NUMBER)
        .get()
    if (snap.empty) { console.log('Not found'); process.exit(1) }

    const jobDoc = snap.docs[0]
    const data = jobDoc.data() as any
    const jobNumber = data.generalInfo?.jobNumber || jobDoc.id
    console.log(`\nJob: ${jobNumber}  [${data.status}]`)
    console.log(`ID: ${jobDoc.id}`)
    console.log(`lockedTotalInvoiceValue: ${data.lockedTotalInvoiceValue ?? 'not set'}\n`)

    const sections = data.requisitionSections || []
    let i = 0
    for (const section of sections) {
        for (const item of (section.items || [])) {
            i++
            console.log(`Item ${i}: ${item.itemName || item.description || 'unknown'}`)
            console.log(`  qty:              ${item.qty}`)
            console.log(`  irdSellingPrice:  ${item.irdSellingPrice}`)
            console.log(`  costSnapshot:     ${item.costSnapshot}`)
            console.log(`  inventoryItemId:  ${item.inventoryItemId}`)
            console.log(`  twidMarkupPercent:${item.twidMarkupPercent}`)
            console.log(`  rowGrandTot:      ${item.rowGrandTot}`)
            console.log(`  isAdjustment:     ${item.isAdjustment || false}`)
            console.log()
        }
    }
    if (i === 0) console.log('No items in requisitionSections')

    process.exit(0)
})()
