import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyACvXyeSdEkpWXIPoV1sBXH8h84XNjBtSo",
    authDomain: "incaptta-pro.firebaseapp.com",
    projectId: "incaptta-pro",
    storageBucket: "incaptta-pro.firebasestorage.app",
    messagingSenderId: "408940478113",
    appId: "1:408940478113:web:8ea03252b84d1e29e7bae0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'adonismuzataet@gmail.com';
const password = 'ResetPass123!@#';

async function testAuth() {
    try {
        console.log('Attempting LOGIN as', email);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('SUCCESS: Logged in as', userCredential.user.email);
        process.exit(0);
    } catch (error) {
        console.error('FAILURE:', JSON.stringify(error, null, 2));
        process.exit(1);
    }
}

testAuth();

