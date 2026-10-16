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

async function listUsers() {
    try {
        const listUsersResult = await admin.auth().listUsers(10);
        console.log('--- USERS IN PROJECT ---');
        listUsersResult.users.forEach((userRecord) => {
            console.log(userRecord.email, '(', userRecord.uid, ')');
        });
        console.log('------------------------');
        process.exit(0);
    } catch (error) {
        console.error('Error listing users:', error);
        process.exit(1);
    }
}

listUsers();
