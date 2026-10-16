import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

const inventoryCategories = [
    'Pan Feeders',
    'Climate Control Curtains',
    'Water System',
];

export const seedInventoryCategories = async () => {
    console.log('Seeding Inventory Categories...');
    const now = admin.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();
    inventoryCategories.forEach(cat => {
        const id = cat.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const ref = db.collection('inventoryCategories').doc(id);
        batch.set(ref, { id, name: cat, createdAt: now, updatedAt: now }, { merge: true });
    });
    await batch.commit();
    console.log(`Seeded ${inventoryCategories.length} inventory categories.`);
};

seedInventoryCategories().catch(console.error);
