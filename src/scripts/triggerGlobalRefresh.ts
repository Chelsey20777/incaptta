import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, '../../incaptta-pro-firebase-adminsdk-fbsvc-45e8c324d9.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  projectId: 'incaptta-pro'
});

const db = admin.firestore();

async function triggerRefresh() {
  console.log('🚀 Triggering global refresh for Manager Portal...');
  
  const settingsRef = db.collection('appSettings').doc('general');
  const timestamp = Date.now();

  try {
    await settingsRef.set({
      forceRefreshTimestamp: timestamp
    }, { merge: true });
    
    console.log(`✅ Global refresh triggered successfully!`);
    console.log(`🕒 Timestamp: ${new Date(timestamp).toLocaleString()}`);
  } catch (error) {
    console.error('❌ Error triggering refresh:', error);
    process.exit(1);
  }
}

triggerRefresh().then(() => process.exit(0));
