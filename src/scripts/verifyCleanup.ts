import { db } from '../config/firebase';

const ALL_COLLECTIONS = [
    'users',
    'inventoryItems',
    'stockLedger',
    'departments',
    'jobCategories',
    'expenseCategories',
    'clients',
    'jobCards',
    'jobRequisitions',
    'quotations',
    'invoices',
    'operationalExpenses',
    'expenseLedger',
    'cashLedger',
    'fundTransfers',
    'commissions',
    'adminAuditLog',
    'counters'
];

export const verifyCleanup = async () => {
    console.log('--- Database Verification Started ---');

    for (const name of ALL_COLLECTIONS) {
        try {
            const snapshot = await db.collection(name).get();
            console.log(`- ${name.padEnd(20)}: ${snapshot.size} documents`);
        } catch (err: any) {
            console.error(`- ERROR reading ${name}:`, err.message);
        }
    }

    console.log('--- Database Verification Finished ---');
};

if (require.main === module) {
    verifyCleanup()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
