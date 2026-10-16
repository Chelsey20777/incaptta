import { AdminUserTools } from '../services/adminUserTools';

async function run() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: npx ts-node setUserActive.ts <uid> <true|false>');
        process.exit(1);
    }

    const uid = args[0];
    const isActive = args[1] === 'true';

    console.log(`${isActive ? 'Enabling' : 'Disabling'} user ${uid}...`);

    try {
        await AdminUserTools.setActiveStatus(
            uid,
            isActive,
            { uid: 'ADMIN_CLI', email: 'admin-cli@incaptta.api' }
        );

        console.log('------------------------------------------------');
        console.log(`SUCCESS: User ${isActive ? 'Enabled' : 'Disabled'}`);
        console.log('------------------------------------------------');
    } catch (error: any) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

run().then(() => process.exit(0));
