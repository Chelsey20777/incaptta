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

const email = 'adonismuzataet@gmail.com';
const newPassword = 'ResetPass123!@#';

async function resetPassword() {
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(user.uid, {
            password: newPassword
        });
        console.log('Successfully updated password for', email);
        process.exit(0);
    } catch (error) {
        console.error('Error updating password:', error);
        process.exit(1);
    }
}

resetPassword();
