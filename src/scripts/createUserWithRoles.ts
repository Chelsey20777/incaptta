import { AdminUserTools } from '../services/adminUserTools';
import { UserRole } from '../models/user.model';

async function run() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: npx ts-node createUserWithRoles.ts <email> <roles_comma_separated> [displayName] [departmentId]');
        process.exit(1);
    }

    const email = args[0];
    const roles = args[1].split(',') as UserRole[];
    const displayName = args[2];
    const departmentId = args[3];

    console.log(`Creating user ${email} with roles: ${roles.join(', ')}...`);

    try {
        const result = await AdminUserTools.createUser(
            { email, roles, displayName, departmentId },
            { uid: 'ADMIN_CLI', email: 'admin-cli@incaptta.api' }
        );

        console.log('------------------------------------------------');
        console.log('SUCCESS: User Created');
        console.log(`UID: ${result.uid}`);
        console.log(`Temp Password: ${result.tempPassword}`);
        console.log('IMPORTANT: User must change password on first login.');
        console.log('------------------------------------------------');
    } catch (error: any) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

run().then(() => process.exit(0));
