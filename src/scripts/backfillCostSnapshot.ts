/**
 * backfillCostSnapshot.ts
 *
 * For job card items where costSnapshot is undefined/null/0,
 * looks up the current totalCost from the inventory master
 * and writes it back onto the item.
 *
 * Run: npx ts-node src/scripts/backfillCostSnapshot.ts
 */

import { db } from '../config/firebase'

// Target one job card or set to null to scan ALL job cards
const TARGET_JOB_CARD_ID: string | null = null

;(async () => {
    // Load inventory master for cost lookups
    console.log('Loading inventory master...')
    const invSnap = await db.collection('inventoryItems').get()
    const inventory: Record<string, any> = {}
    invSnap.docs.forEach(d => { inventory[d.id] = d.data() })
    // Also index by SKU for name-based fallback
    const invBySku: Record<string, any> = {}
    invSnap.docs.forEach(d => {
        const data = d.data()
        if (data.sku) invBySku[data.sku] = { id: d.id, ...data }
    })
    console.log(`  ${invSnap.size} inventory items loaded\n`)

    // Fetch target job cards
    let jobSnap
    if (TARGET_JOB_CARD_ID) {
        const doc = await db.collection('jobCards').doc(TARGET_JOB_CARD_ID).get()
        jobSnap = { docs: doc.exists ? [doc] : [] }
    } else {
        jobSnap = await db.collection('jobCards').get()
    }

    let totalFixed = 0

    for (const jobDoc of jobSnap.docs) {
        const data = jobDoc.data() as any
        const jobNumber = data.generalInfo?.jobNumber || jobDoc.id
        const sections: any[] = data.requisitionSections || []

        let jobHasMissing = false
        const updatedSections = sections.map((section: any) => {
            const updatedItems = (section.items || []).map((item: any) => {
                const hasCost = item.costSnapshot !== undefined && item.costSnapshot !== null && item.costSnapshot !== 0

                if (hasCost) return item  // already set

                jobHasMissing = true

                // Try lookup: by inventoryItemId first, then by SKU extracted from label
                let invItem: any = null
                if (item.inventoryItemId && inventory[item.inventoryItemId]) {
                    invItem = inventory[item.inventoryItemId]
                } else {
                    // Extract SKU from itemName pattern "Name (SKU) — X in stock"
                    const skuMatch = (item.itemName || '').match(/\(([^)]+)\)/)
                    if (skuMatch) invItem = invBySku[skuMatch[1]]
                }

                const costSnapshot = invItem
                    ? (invItem.totalCost ?? (invItem.purchasePrice ?? 0) + (invItem.freightDuty ?? 0))
                    : 0

                console.log(`  ${jobNumber} — "${item.itemName}": costSnapshot was undefined → backfilled ${costSnapshot} (from ${invItem ? 'inventory' : 'no match, set 0'})`)
                return { ...item, costSnapshot }
            })
            return { ...section, items: updatedItems }
        })

        if (!jobHasMissing) continue

        await db.collection('jobCards').doc(jobDoc.id).update({
            requisitionSections: updatedSections,
            updatedAt: new Date()
        })
        totalFixed++
    }

    console.log(`\nDone — backfilled costSnapshot on ${totalFixed} job card(s).`)
    process.exit(0)
})()
