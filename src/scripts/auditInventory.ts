import { db } from '../config/firebase';

const expectedSkus = [
    'PNFS-1','PNFS-2','PNFS-3','PNFS-4','PNFS-5','PNFS-6','PNFS-7','PNFS-8','PNFS-9','PNFS-10',
    'PNFS-11','PNFS-12','PNFS-13','PNFS-14','PNFS-15','PNFS-16','PNFS-17','PNFS-18','PNFS-19',
    'WTS-01','WAT-43',
    'WAT-08','WAT-09','WAT-10','WAT-11','WAT-12','WAT-13','WAT-14','WAT-15','WAT-16','WAT-17',
    'WAT-18','WAT-19','WAT-20','WAT-21','WAT-21B','WAT-22','WAT-22B','WAT-23','WAT-24','WAT-25',
    'WAT-26','WAT-26B','WAT-27','WAT-28','WAT-29','WAT-30','WAT-31','WAT-32','WAT-33','WAT-34',
    'WAT-35','WAT-36','WAT-37','WAT-38','WAT-39',
    'CTN-01','CTN-02','CTN-03',
];

(async () => {
    const snapshot = await db.collection('inventoryItems').get();
    const items = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    console.log(`\n=== INVENTORY AUDIT ===`);
    console.log(`Total items in Firestore: ${items.length}`);
    console.log(`Expected from CSV: ${expectedSkus.length}\n`);

    const importedSkus = items.map((i: any) => (i.sku || '').toUpperCase());

    // Missing from Firestore
    const missing = expectedSkus.filter(s => !importedSkus.includes(s.toUpperCase()));
    if (missing.length) {
        console.log(`MISSING (${missing.length} SKUs not in Firestore):`);
        missing.forEach(s => console.log(`  - ${s}`));
    } else {
        console.log('All expected SKUs are present.');
    }

    // Extra items in Firestore (not in our CSV)
    const extra = items.filter((i: any) => !expectedSkus.map(s => s.toUpperCase()).includes((i.sku || '').toUpperCase()));
    if (extra.length) {
        console.log(`\nEXTRA items in Firestore (${extra.length} not in CSV):`);
        extra.forEach((i: any) => console.log(`  - ${i.sku || '(no sku)'} | ${i.name || ''} | onHand: ${i.onHand ?? i.inStock ?? '?'} | category: ${i.categoryName || ''}`));
    }

    // Full imported list
    console.log(`\nIMPORTED ITEMS (${items.length}):`);
    const sorted = [...items].sort((a: any, b: any) => (a.sku || '').localeCompare(b.sku || ''));
    sorted.forEach((i: any) => {
        console.log(`  ${(i.sku || '').padEnd(10)} | ${(i.name || '').substring(0, 40).padEnd(40)} | qty: ${String(i.onHand ?? i.inStock ?? '?').padStart(6)} | category: ${i.categoryName || '(none)'}`);
    });
})().catch(console.error);
