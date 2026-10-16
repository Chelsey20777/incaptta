import { AdminUserTools } from '../services/adminUserTools';
import { UserRole } from '../models/user.model';

async function run() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: npx ts-node setUserRoles.ts <uid> <roles_comma_separated>');
        process.exit(1);
    }

    const uid = args[0];
    const roles = args[1].split(',') as UserRole[];

    console.log(`Updating roles for user ${uid} to: ${roles.join(', ')}...`);

    try {
        const result = await AdminUserTools.syncUser(
            uid,
            roles,
            true, // Keep active
            { uid: 'ADMIN_CLI', email: 'admin-cli@incaptta.api' }
        );

        console.log('------------------------------------------------');
        console.log('SUCCESS: Roles Updated');
        console.log(`Email: ${result.email}`);
        console.log(`Roles: ${result.roles.join(', ')}`);
        console.log('------------------------------------------------');
    } catch (error: any) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

run().then(() => process.exit(0));
