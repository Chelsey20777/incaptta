import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

const categories = [
    "Climate Control Curtains",
    "Fowlrun construction",
    "Fumigation services",
    "General repairs",
    "Mashwire installations",
    "Product supply/delivery cost",
    "Water System"
];

const departmentsData = [
    { id: "ADMIN", name: "Incaptta", displayName: "(ADMIN) Incaptta" },
    { id: "AGF", name: "Agristructures and Fabrications", displayName: "(AGF) Agristructures and Fabrications" },
    { id: "IRD", name: "Inventory and Retail Department", displayName: "(IRD) Inventory and Retail Department" },
    { id: "PP", name: "Pekker Poultry", displayName: "(PP) Pekker Poultry" },
    { id: "TWID", name: "Technical Works and Installation", displayName: "(TWID) Technical Works and Installation" }
];

export const seedMasterData = async () => {
    console.log('Seeding Master Data...');
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Seed Categories
    const catBatch = db.batch();
    categories.forEach(cat => {
        const id = cat.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const ref = db.collection('jobCategories').doc(id);
        catBatch.set(ref, {
            id,
            name: cat,
            createdAt: now,
            updatedAt: now
        }, { merge: true });
    });
    await catBatch.commit();
    console.log(`Seeded ${categories.length} categories.`);

    // Seed Departments
    const depBatch = db.batch();
    departmentsData.forEach(dep => {
        const ref = db.collection('departments').doc(dep.id);
        depBatch.set(ref, {
            ...dep,
            createdAt: now,
            updatedAt: now
        }, { merge: true });
    });
    await depBatch.commit();
    console.log(`Seeded ${departmentsData.length} departments.`);
};

// If run directly
if (require.main === module) {
    seedMasterData()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
