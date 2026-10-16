import * as admin from 'firebase-admin';
import { AdminUserTools } from '../services/adminUserTools';
import { db } from '../config/firebase';

// Use the path from metadata or default
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './incaptta-pro-firebase-adminsdk-fbsvc-45e8c324d9.json';
const adminEmail = 'faraimufambisi@gmail.com';

async function makeSuperAdmin() {
    console.log(`Promoting ${adminEmail} to SUPER_ADMIN...`);

    try {
        const user = await admin.auth().getUserByEmail(adminEmail);
        const uid = user.uid;

        await AdminUserTools.syncUser(
            uid,
            ['SUPER_ADMIN'],
            true,
            { uid: 'SYSTEM', email: 'bootstrap@incaptta.api' }
        );

        console.log('------------------------------------------------');
        console.log('SUCCESS: Super Admin Promoted');
        console.log(`UID: ${uid}`);
        console.log(`Roles: ["SUPER_ADMIN"]`);
        console.log(`isActive: true`);
        console.log('------------------------------------------------');
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error(`ERROR: User ${adminEmail} not found. Please create the user in Firebase Console first.`);
        } else {
            console.error('ERROR:', error.message);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    makeSuperAdmin().then(() => process.exit(0));
}
