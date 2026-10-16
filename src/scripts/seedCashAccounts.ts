import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { CashAccount } from '../models/cashManagement.model';

const accounts = [
    { id: 'cash_main', name: 'Main Cash', type: 'CASH' },
    { id: 'ecocash_main', name: 'Main Ecocash', type: 'ECOCASH' },
    { id: 'bank_main', name: 'Main Bank', type: 'BANK' },
];

async function seed() {
    console.log('Seeding Cash Accounts...');
    const batch = db.batch();
    const collection = db.collection('cashAccounts');

    for (const acc of accounts) {
        const docRef = collection.doc(acc.id);
        const data: CashAccount = {
            name: acc.name,
            type: acc.type as any,
            isActive: true,
            currency: 'USD',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(docRef, data);
    }

    await batch.commit();
    console.log('Cash Accounts seeded successfully!');
}

seed().catch(console.error);
