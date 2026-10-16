const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

if (!serviceAccount.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY env variable not set or invalid.");
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  console.log("Fetching chats...");
  const chatsSnap = await db.collection('chats').get();
  for (const chatDoc of chatsSnap.docs) {
    const chatData = chatDoc.data();
    console.log(`Chat ID: ${chatDoc.id}, Group: ${chatData.isGroup ? chatData.groupName : 'Direct'}`);
    
    const msgSnap = await db.collection(`chats/${chatDoc.id}/messages`).orderBy('createdAt', 'desc').limit(10).get();
    for (const msgDoc of msgSnap.docs) {
      const msgData = msgDoc.data();
      console.log(`  Message ID: ${msgDoc.id}`);
      console.log(`    Sender: ${msgData.senderName}`);
      console.log(`    Text: ${JSON.stringify(msgData.text)}`);
      console.log(`    CreatedAt:`, msgData.createdAt);
      if (msgData.createdAt && typeof msgData.createdAt.toDate === 'function') {
        console.log(`    Formatted (Server):`, msgData.createdAt.toDate().toISOString());
      } else if (msgData.createdAt) {
        console.log(`    Date Value:`, msgData.createdAt);
      }
    }
  }
}

run().catch(console.error);
