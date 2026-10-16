import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
  resolveCredentialProjectId,
  validateProjectMatch,
} from './deployment-config';

const deploymentEnvironment = parseDeploymentEnvironment(process.env.DEPLOYMENT_ENV);
const configuredProjectId = requireConfigValue('FIREBASE_PROJECT_ID', process.env.FIREBASE_PROJECT_ID);
const credentialProjectId = resolveCredentialProjectId();

assertEnvironmentIsolation(deploymentEnvironment, {
  FIREBASE_PROJECT_ID: configuredProjectId,
  ...(credentialProjectId ? { GOOGLE_CLOUD_PROJECT: credentialProjectId } : {}),
});

if (!getApps().length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      const config = JSON.parse(serviceAccountKey);
      validateProjectMatch(configuredProjectId, config.project_id);
      initializeApp({
        credential: cert(config),
        projectId: configuredProjectId,
      });
    } else {
      // App Hosting build workers do not always inject GOOGLE_CLOUD_PROJECT
      // while collecting page data. FIREBASE_PROJECT_ID remains the isolation
      // source of truth; a present Cloud project ID must still match it.
      validateProjectMatch(configuredProjectId, credentialProjectId);
      initializeApp({ projectId: configuredProjectId });
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
    throw err;
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
