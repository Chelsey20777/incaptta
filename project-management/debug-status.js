const admin = require('firebase-admin');

// Initialize with application default credentials or explicitly if needed
// Assuming we are running this in an authenticated dev environment where firebase tools work
// If not, we might need a service account key. Using a minimal read structure.

async function checkJobStatuses() {
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });

        const db = admin.firestore();
        const snapshot = await db.collection('jobCards').orderBy('createdAt', 'desc').limit(5).get();

        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Job: ${doc.id}`);
            console.log(`  Title: ${data.generalInfo?.jobTitle}`);
            console.log(`  Status: "${data.status}"`);
            console.log(`  Timeline Last:`, data.approvalTimeline ? data.approvalTimeline[data.approvalTimeline.length - 1] : 'None');
            console.log('------------------------');
        });
    } catch (e) {
        console.error("Failed to read from Firestore natively:", e);
    }
}

checkJobStatuses();
