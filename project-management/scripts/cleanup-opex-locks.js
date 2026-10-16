const admin = require('firebase-admin');
const { crypto } = require('crypto');

// Initialize admin with your credentials or let it use default GCP credentials if running in a cloud shell environment.
// For a local script, you would typically need a service account key.
// Usage: node scripts/cleanup-opex-locks.js
// WARNING: Ensure you have backups and are running against the correct environment.

const serviceAccount = require('../serviceAccountKey.json'); // You need to provide this file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupOpexPdfLocks() {
    console.log('--- STARTING OPEX PDF LOCK CLEANUP ---');
    
    const jobCardsSnapshot = await db.collection('jobCards').get();
    console.log(`Found ${jobCardsSnapshot.size} Job Cards to analyze.`);
    
    let totalLocked = 0;
    
    for (const jobDoc of jobCardsSnapshot.docs) {
        const jobData = jobDoc.data();
        const adHocExpenses = jobData.adHocExpenses || [];
        
        // Find expenses that were already downloaded in the Job Card
        const lockedInJob = adHocExpenses.filter(e => e.isLockedAgainstPdf === true);
        
        if (lockedInJob.length === 0) continue;
        
        console.log(`Job Card ${jobData.generalInfo?.jobNumber || jobDoc.id} has ${lockedInJob.length} locked expenses.`);
        
        for (const lockedItem of lockedInJob) {
            const amount = Number(lockedItem.totalAmount || 0);
            const desc = lockedItem.description || '';
            
            // Fuzzy search in operationalExpenses
            // 1. Same amount
            // 2. Contains the same description substring
            const opexSnap = await db.collection('operationalExpenses')
                .where('amount', '==', amount)
                .get();
                
            for (const opexDoc of opexSnap.docs) {
                const opexData = opexDoc.data();
                
                // If it's already generated, skip
                if (opexData.pdfGenerated === true) continue;
                
                // Fuzzy description match
                // OPEX descriptions often look like: "Job Card JC-2026-0001 - Dinner"
                // Original description would just be: "Dinner"
                const opexDesc = opexData.description || '';
                const isMatch = opexDesc.includes(desc) || desc.includes(opexDesc);
                
                if (isMatch) {
                    console.log(`   MATCH FOUND! Locking OPEX Doc: ${opexDoc.id} (${opexDesc})`);
                    await opexDoc.ref.update({
                        pdfGenerated: true,
                        pdfLockedAt: admin.firestore.FieldValue.serverTimestamp(),
                        migrationSourceJobId: jobDoc.id,
                        migrationNote: 'Locked by retroactive cleanup script based on Job Card download status.'
                    });
                    totalLocked++;
                }
            }
        }
    }
    
    console.log(`--- CLEANUP FINISHED! ---`);
    console.log(`Total OPEX records locked: ${totalLocked}`);
}

cleanupOpexPdfLocks()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
