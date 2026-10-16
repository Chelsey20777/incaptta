import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

// Whitelist of collections to KEEP
const KEEP_COLLECTIONS = [
    'users',
    'inventoryItems',
    'stockLedger',
    'departments',
    'jobCategories',
    'expenseCategories',
    'counters',        // Incremental numbering master
    'systemCounters'   // Any other critical system state
];

/**
 * Deletes all documents in a collection
 */
async function deleteCollection(collectionPath: string, batchSize: number = 500) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(query: admin.firestore.Query, resolve: any) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}

/**
 * Resets all counters to 0
 */
async function resetCounters() {
    console.log('Resetting counters...');
    const snapshot = await db.collection('counters').get();
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { lastNumber: 0 });
    });

    await batch.commit();
    console.log(`Reset ${snapshot.size} counters.`);
}

export const cleanupDatabase = async () => {
    console.log('--- Comprehensive Database Cleanup Started ---');

    const collections = await db.listCollections();
    const collectionIds = collections.map(c => c.id);

    console.log('Detected collections:', collectionIds.join(', '));

    for (const collectionId of collectionIds) {
        if (KEEP_COLLECTIONS.includes(collectionId)) {
            console.log(`[SKIP] Keeping whitelisted collection: ${collectionId}`);
            continue;
        }

        console.log(`[DELETE] Deleting collection: ${collectionId}...`);
        await deleteCollection(collectionId);
        console.log(`Finished deleting ${collectionId}.`);
    }

    await resetCounters();

    console.log('--- Database Cleanup Finished ---');
};

if (require.main === module) {
    cleanupDatabase()
        .then(() => {
            console.log('Cleanup successful.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Cleanup failed:', err);
            process.exit(1);
        });
}
