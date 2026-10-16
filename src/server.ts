import { onRequest } from 'firebase-functions/v2/https';

/**
 * PRODUCTION API (Firebase Functions)
 * Ultimate Lazy-Loading for deployment performance
 */
export const api = onRequest({ region: 'us-central1' }, async (req, res) => {
    const { default: app } = await import('./app');
    return app(req, res);
});

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';

/**
 * PRODUCTION TRIGGERS
 * Lazy-loaded for deployment performance
 */
export { onGRNConfirmed } from './procurement/onGRNConfirmed';
export { onInventoryWritten } from './inventory/onInventoryWritten';

/** App Hosting secret `cron-secret` — daily MBDI due reminders. */
const cronSecret = defineSecret('cron-secret');
const mbdiDueCronUrl = defineString('MBDI_DUE_CRON_URL', { default: '' });

/**
 * Daily 07:00 Africa/Harare — calls Next.js cron to notify owners + managers
 * when MBDI endDate is 7 / 3 / 1 days away. Creates Cloud Scheduler on deploy.
 */
export const mbdiDueReminders = onSchedule(
    {
        schedule: '0 7 * * *',
        timeZone: 'Africa/Harare',
        region: 'us-central1',
        secrets: [cronSecret],
        timeoutSeconds: 300,
        memory: '256MiB',
    },
    async () => {
        const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID || '';
        if (projectId === 'incaptta-pro-staging' || process.env.DEPLOYMENT_ENV === 'staging') {
            console.log('[mbdiDueReminders] skipped on staging');
            return;
        }

        const cronUrl = mbdiDueCronUrl.value().trim();
        if (!cronUrl) {
            throw new Error('MBDI_DUE_CRON_URL is required outside staging');
        }
        if (projectId === 'incaptta-pro' && cronUrl.includes('incaptta-pro-staging')) {
            throw new Error('Production cannot call staging App Hosting for MBDI reminders');
        }

        const res = await fetch(cronUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cronSecret.value()}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
        });
        const text = await res.text();
        if (!res.ok) {
            console.error('[mbdiDueReminders] failed', res.status, text);
            throw new Error(`MBDI due reminders failed: ${res.status} ${text}`);
        }
        console.log('[mbdiDueReminders] ok', text);
    }
);

// LOCAL SERVER (For Development)
if (process.env.npm_lifecycle_event === 'dev' || process.env.LOCAL_SERVER === 'true') {
    Promise.resolve().then(() => import('./app')).then(({ default: app }) => {
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Local server running on port ${PORT}`);
        });
    });
}
