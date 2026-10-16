import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

const serviceAccount = JSON.parse(
    await readFile(new URL('../incaptta-pro-firebase-adminsdk-fbsvc-45e8c324d9.json', import.meta.url))
);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkUser(email) {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (snapshot.empty) {
        console.log('User not found');
        process.exit(0);
    }
    const doc = snapshot.docs[0];
    const data = doc.data();
    console.log('--- USER DATA ---');
    console.log('Email:', data.email);
    console.log('Roles Type:', typeof data.roles);
    console.log('Is Roles Array:', Array.isArray(data.roles));
    console.log('Roles Value:', JSON.stringify(data.roles));
    console.log('-----------------');
    process.exit(0);
}

checkUser('sales@incaptta.co.zw');
