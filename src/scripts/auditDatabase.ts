import { db } from '../config/firebase';

export const auditDatabase = async () => {
    const results: Record<string, number> = {};
    try {
        const collections = await db.listCollections();
        for (const col of collections) {
            const snapshot = await col.get();
            results[col.id] = snapshot.size;
        }
        console.log('AUDIT_RESULTS_START');
        console.log(JSON.stringify(results, null, 2));
        console.log('AUDIT_RESULTS_END');
    } catch (err: any) {
        console.error('Audit failed:', err.message);
    }
};

if (require.main === module) {
    auditDatabase()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
