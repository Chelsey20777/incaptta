import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Error: Please provide the target user UID as an argument.');
    console.error('Usage: npx ts-node scripts/assign-super-admin.ts <UID>');
    process.exit(1);
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not defined.');
    process.exit(1);
  }

  try {
    const config = JSON.parse(serviceAccountKey);
    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
  } catch (err) {
    console.error('Failed to parse service account key or initialize Firebase:', err);
    process.exit(1);
  }

  const auth = admin.auth();
  const db = admin.firestore();

  try {
    // 1. Fetch user record from auth to check existence and get email
    const userRecord = await auth.getUser(uid);
    console.log(`Found user: ${userRecord.email} (UID: ${uid})`);

    // 2. Fetch current custom claims
    const currentClaims = userRecord.customClaims || {};
    const currentRoles: string[] = Array.isArray(currentClaims.roles)
      ? currentClaims.roles
      : typeof currentClaims.roles === 'string'
      ? [currentClaims.roles]
      : [];

    console.log('Current roles:', currentRoles);

    // 3. Add SUPER_ADMIN to roles if not already present
    if (!currentRoles.includes('SUPER_ADMIN')) {
      currentRoles.push('SUPER_ADMIN');
    }

    const updatedClaims = {
      ...currentClaims,
      roles: currentRoles,
      isActive: true // Make sure the user is active
    };

    // 4. Update Firestore user document
    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.set({
      roles: currentRoles,
      isActive: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Updated Firestore user document.');

    // 5. Update Firebase Auth Custom Claims
    await auth.setCustomUserClaims(uid, updatedClaims);
    console.log('Updated Firebase Auth custom claims.');

    // 6. Force Token Revocation
    await auth.revokeRefreshTokens(uid);
    console.log('Revoked user refresh tokens to force client re-authentication.');

    console.log('\n--- SUCCESS ---');
    console.log(`User email: ${userRecord.email}`);
    console.log(`User UID: ${uid}`);
    console.log('Updated claims:', JSON.stringify(updatedClaims, null, 2));

  } catch (err: any) {
    console.error('Execution failed:', err.message);
    process.exit(1);
  }
}

run();
