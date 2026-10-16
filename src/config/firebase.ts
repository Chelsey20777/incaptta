import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

if (process.env.npm_lifecycle_event === 'dev' || process.env.LOCAL_SERVER === 'true') {
    dotenv.config();
}

const PRODUCTION_PROJECT_ID = 'incaptta-pro';
const STAGING_PROJECT_ID = 'incaptta-pro-staging';
const PRODUCTION_SERVICE_ACCOUNT_FILE = 'incaptta-pro-firebase-adminsdk-fbsvc-45e8c324d9.json';

function readFirebaseConfigProjectId(): string | undefined {
    const raw = process.env.FIREBASE_CONFIG;
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed.projectId === 'string' ? parsed.projectId : undefined;
    } catch {
        return undefined;
    }
}

function resolveConfiguredProjectId(): string | undefined {
    return (
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        readFirebaseConfigProjectId()
    );
}

function assertFunctionsIsolation(configuredProjectId: string | undefined, credentialProjectId?: string) {
    const environment = process.env.DEPLOYMENT_ENV;
    if (environment === 'staging' || configuredProjectId === STAGING_PROJECT_ID) {
        if (!configuredProjectId || configuredProjectId === PRODUCTION_PROJECT_ID) {
            throw new Error('Staging functions cannot use the production Firebase project');
        }
        if (credentialProjectId === PRODUCTION_PROJECT_ID) {
            throw new Error('Staging functions cannot use a production service account');
        }
    }
    if (configuredProjectId && credentialProjectId && configuredProjectId !== credentialProjectId) {
        throw new Error(
            `Firebase credential project ${credentialProjectId} does not match configured project ${configuredProjectId}`,
        );
    }
}

if (!admin.apps.length) {
    const configuredProjectId = resolveConfiguredProjectId();
    try {
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (serviceAccountKey) {
            const config = JSON.parse(serviceAccountKey);
            assertFunctionsIsolation(configuredProjectId, config.project_id);
            admin.initializeApp({
                credential: admin.credential.cert(config),
                ...(configuredProjectId ? { projectId: configuredProjectId } : {}),
            });
            console.log('Firebase Admin Initialized with Environment Service Account');
        } else if (process.env.FIREBASE_CONFIG || process.env.FUNCTIONS_EMULATOR) {
            assertFunctionsIsolation(configuredProjectId);
            if (configuredProjectId) {
                admin.initializeApp({ projectId: configuredProjectId });
            } else {
                admin.initializeApp();
            }
            console.log('Firebase Admin Initialized with Default Credentials');
        } else {
            const serviceAccountPath = path.resolve(process.cwd(), PRODUCTION_SERVICE_ACCOUNT_FILE);
            if (process.env.DEPLOYMENT_ENV === 'staging' || configuredProjectId === STAGING_PROJECT_ID) {
                throw new Error('Staging cannot initialize Admin SDK from the production service account file');
            }
            if (fs.existsSync(serviceAccountPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
                assertFunctionsIsolation(configuredProjectId, fileConfig.project_id);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccountPath),
                    ...(configuredProjectId ? { projectId: configuredProjectId } : {}),
                });
                console.log('Firebase Admin Initialized with Service Account File');
            } else {
                assertFunctionsIsolation(configuredProjectId);
                if (configuredProjectId) {
                    admin.initializeApp({ projectId: configuredProjectId });
                } else {
                    admin.initializeApp();
                }
                console.log('Firebase Admin Initialized with Default Credentials fallback');
            }
        }
    } catch (error) {
        console.error('Firebase Admin Initialization Error:', error);
        throw error;
    }
}

export const db = admin.firestore();
export const auth = admin.auth();
