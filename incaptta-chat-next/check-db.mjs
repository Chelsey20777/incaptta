import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
  authDomain: "incaptta-pro.firebaseapp.com",
  projectId: "incaptta-pro",
  storageBucket: "incaptta-pro.firebasestorage.app",
  messagingSenderId: "408940478113",
  appId: "1:408940478113:web:8ea03252b84d1e29e7bae0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching chats...");
  const chatsSnap = await getDocs(collection(db, 'chats'));
  for (const chatDoc of chatsSnap.docs) {
    const chatData = chatDoc.data();
    console.log(`Chat ID: ${chatDoc.id}, Group: ${chatData.isGroup ? chatData.groupName : 'Direct'}`);
    
    const q = query(collection(db, `chats/${chatDoc.id}/messages`), orderBy('createdAt', 'desc'), limit(5));
    const msgSnap = await getDocs(q);
    for (const msgDoc of msgSnap.docs) {
      const msgData = msgDoc.data();
      console.log(`  Message ID: ${msgDoc.id}`);
      console.log(`    Sender: ${msgData.senderName}`);
      console.log(`    Text: ${JSON.stringify(msgData.text)}`);
      console.log(`    CreatedAt:`, msgData.createdAt);
      if (msgData.createdAt && typeof msgData.createdAt.toDate === 'function') {
        console.log(`    toDate():`, msgData.createdAt.toDate().toISOString());
        console.log(`    Formatted:`, msgData.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
