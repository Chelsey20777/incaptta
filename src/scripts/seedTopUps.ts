import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

const topUps = [
    {
        amount: 5000,
        account: 'cash',
        description: 'Initial Business Float',
        reference: 'BF-2026-001',
        status: 'COMPLETED',
        requestedBy: 'System Admin',
        requestedByEmail: 'admin@incaptta.pro',
        requestedAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
        amount: 2500,
        account: 'bank',
        description: 'External Capital Injection',
        reference: 'CAP-002',
        status: 'COMPLETED',
        requestedBy: 'Director',
        requestedByEmail: 'director@incaptta.pro',
        requestedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
        amount: 1200,
        account: 'ecocash',
        description: 'Weekly Operational Float',
        reference: 'FLOAT-003',
        status: 'PENDING_APPROVAL',
        requestedBy: 'Accountant',
        requestedByEmail: 'accountant@incaptta.pro',
        requestedAt: new Date().toISOString(),
    }
];

async function seed() {
    console.log('Seeding Ledger Top-Ups...');
    const collection = db.collection('ledgerTopUps');

    for (const tu of topUps) {
        await collection.add({
            ...tu,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    console.log('Top-Ups seeded successfully!');
}

seed().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
