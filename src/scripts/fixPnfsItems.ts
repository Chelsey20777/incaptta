import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

const fixes: Record<string, any> = {
    'PNFS-1': {
        name: 'Storage Silo',
        categoryName: 'Pan Feeders',
        uom: 'PCS',
        onHand: 2,
        purchasePrice: 1696.90,
        freightDuty: 164.305,
        totalCost: 1861.205,
        markupPercent: 110,
        sellingPrice: 3908.53,
        isActive: true,
    },
    'PNFS-2': {
        name: 'PNFS 01 Full Spec Line (Auger Pipe Base Antiroost)',
        categoryName: 'Pan Feeders',
        uom: 'Meters',
        onHand: 2520,
        purchasePrice: 8.21,
        freightDuty: 0.0006,
        totalCost: 8.2106,
        markupPercent: 110,
        sellingPrice: 17.24,
        isActive: true,
    },
};

(async () => {
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Resolve categoryId for Pan Feeders
    const catSnap = await db.collection('inventoryCategories').where('name', '==', 'Pan Feeders').limit(1).get();
    const categoryId = catSnap.empty ? '' : catSnap.docs[0].id;
    console.log(`Resolved categoryId for "Pan Feeders": ${categoryId || '(not found)'}`);

    const itemsSnap = await db.collection('inventoryItems').get();

    for (const [sku, data] of Object.entries(fixes)) {
        const doc = itemsSnap.docs.find(d => (d.data().sku || '').toUpperCase() === sku.toUpperCase());
        if (!doc) {
            console.log(`  SKIP ${sku} — not found in Firestore`);
            continue;
        }
        await db.collection('inventoryItems').doc(doc.id).update({
            ...data,
            categoryId,
            updatedAt: now,
        });
        console.log(`  FIXED ${sku} — category="${data.categoryName}", onHand=${data.onHand}`);
    }
    console.log('\nDone.');
})().catch(console.error);
