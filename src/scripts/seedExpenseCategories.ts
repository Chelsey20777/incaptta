import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { ExpenseCategory } from '../models/expenseCategory.model';

const categories = [
    { id: 'rent-office', name: 'Rent (office)', code: 'RENT', sortOrder: 1 },
    { id: 'fuel', name: 'Fuel', code: 'FUEL', sortOrder: 2 },
    { id: 'transport', name: 'Transport', code: 'TRANS', sortOrder: 3 },
    { id: 'payroll', name: 'Payroll', code: 'PAY', sortOrder: 4 },
    { id: 'asset-acquisition', name: 'Asset acquisition', code: 'ASSET', sortOrder: 5 },
    { id: 'marketing-adv', name: 'Marketing and advertising', code: 'MARK', sortOrder: 6 },
    { id: 'internet-phone', name: 'Internet Subscription and phone calls', code: 'COMM', sortOrder: 7 },
    { id: 'other', name: 'Other', code: 'OTHER', sortOrder: 8 },
];

async function seed() {
    console.log('Seeding Expense Categories...');
    const batch = db.batch();
    const collection = db.collection('expenseCategories');

    for (const cat of categories) {
        const docRef = collection.doc(cat.id);
        const data: ExpenseCategory = {
            name: cat.name,
            code: cat.code,
            isActive: true,
            sortOrder: cat.sortOrder,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(docRef, data);
    }

    await batch.commit();
    console.log('Expense Categories seeded successfully!');
}

seed().catch(console.error);
