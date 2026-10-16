/**
 * deleteJobCards.ts
 *
 * Hard-deletes specified job cards and ALL related records from Firestore.
 * Bypasses status guards — use only when explicitly instructed.
 *
 * Cleans up:
 *   - jobCards/{id}                  (main document)
 *   - jobCards/{id}/items            (subcollection)
 *   - jobCards/{id}/expenses         (subcollection)
 *   - jobPayments   where jobCardId == id
 *   - operationalExpenses where jobCardId == id
 *   - fundTransfers  where relatedJobCardId == id
 *
 * Run: npx ts-node src/scripts/deleteJobCards.ts
 */

import { db } from '../config/firebase'

const JOB_NUMBERS_TO_DELETE = [
    'JC-2026-0186',
    'JC-2026-0195',
    'JC-2026-0192',
    'JC-2026-0190',
    'JC-2026-0194',
]

async function deleteJobCard(jobNumber: string) {
    console.log(`\n── Processing ${jobNumber} ──`)

    // 1. Find the job card by job number
    const snap = await db.collection('jobCards')
        .where('generalInfo.jobNumber', '==', jobNumber)
        .get()

    if (snap.empty) {
        console.log(`  ⚠️  Not found — skipping`)
        return
    }

    for (const jobDoc of snap.docs) {
        const id = jobDoc.id
        const status = jobDoc.data()?.status || 'UNKNOWN'
        console.log(`  Found: ${id}  [${status}]`)

        const batch = db.batch()
        let deletedCount = 0

        // 2. Delete items subcollection
        const itemsSnap = await db.collection('jobCards').doc(id).collection('items').get()
        itemsSnap.forEach(d => { batch.delete(d.ref); deletedCount++ })
        console.log(`  items subcollection: ${itemsSnap.size} docs`)

        // 3. Delete expenses subcollection
        const expensesSnap = await db.collection('jobCards').doc(id).collection('expenses').get()
        expensesSnap.forEach(d => { batch.delete(d.ref); deletedCount++ })
        console.log(`  expenses subcollection: ${expensesSnap.size} docs`)

        // 4. Delete jobPayments linked to this job card
        const paymentsSnap = await db.collection('jobPayments')
            .where('jobCardId', '==', id).get()
        paymentsSnap.forEach(d => { batch.delete(d.ref); deletedCount++ })
        console.log(`  jobPayments: ${paymentsSnap.size} docs`)

        // 5. Delete operationalExpenses linked to this job card
        const opexSnap = await db.collection('operationalExpenses')
            .where('jobCardId', '==', id).get()
        opexSnap.forEach(d => { batch.delete(d.ref); deletedCount++ })
        console.log(`  operationalExpenses: ${opexSnap.size} docs`)

        // 6. Delete fundTransfers linked to this job card
        const transfersSnap = await db.collection('fundTransfers')
            .where('relatedJobCardId', '==', id).get()
        transfersSnap.forEach(d => { batch.delete(d.ref); deletedCount++ })
        console.log(`  fundTransfers: ${transfersSnap.size} docs`)

        // 7. Delete the main job card document
        batch.delete(db.collection('jobCards').doc(id))
        deletedCount++

        await batch.commit()
        console.log(`  ✅ Deleted ${deletedCount} total records for ${jobNumber}`)
    }
}

;(async () => {
    console.log('=== Job Card Hard Delete ===')
    console.log(`Targets: ${JOB_NUMBERS_TO_DELETE.join(', ')}`)
    console.log('Starting in 3 seconds... Ctrl+C to abort.')
    await new Promise(r => setTimeout(r, 3000))

    for (const jn of JOB_NUMBERS_TO_DELETE) {
        await deleteJobCard(jn)
    }

    console.log('\n=== Done ===')
    process.exit(0)
})()
