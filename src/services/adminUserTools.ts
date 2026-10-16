import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { User, UserRole } from '../models/user.model';
import { AdminAction, AdminAuditLog } from '../models/adminAuditLog.model';

const getUserCollection = () => db.collection('users');
const getAuditLogCollection = () => db.collection('adminAuditLogs');

export const AdminUserTools = {
    /**
     * Authoritative sync of Auth Claims and Firestore Profile
     */
    async syncUser(uid: string, roles: UserRole[], isActive: boolean, performer: { uid: string, email: string }) {
        const userAuth = await admin.auth().getUser(uid);
        const email = userAuth.email!;

        // 1. Get current state for "before" log
        const userRef = getUserCollection().doc(uid);
        const userDoc = await userRef.get();
        const beforeState = userDoc.exists ? userDoc.data() : null;

        // 2. Update Custom Claims
        await admin.auth().setCustomUserClaims(uid, {
            roles,
            isActive
        });

        // 3. Update Firestore Profile
        const updatedProfile: Partial<User> = {
            email,
            roles,
            isActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!userDoc.exists) {
            updatedProfile.createdAt = admin.firestore.FieldValue.serverTimestamp();
            await userRef.set(updatedProfile);
        } else {
            await userRef.update(updatedProfile);
        }

        // Force refresh & token revocation
        await admin.auth().revokeRefreshTokens(uid);
        await db.collection('userStatus').doc(uid).set(
            { forceRefresh: Date.now() },
            { merge: true }
        );

        // 4. Write Audit Log
        const afterState = (await userRef.get()).data();
        await this.logAdminAction({
            action: 'SET_ROLES',
            performedByUid: performer.uid,
            performedByEmail: performer.email,
            targetUid: uid,
            targetEmail: email,
            before: beforeState || undefined,
            after: afterState || undefined
        });

        return { uid, email, roles, isActive };
    },

    /**
     * Create a new user in Auth + Firestore
     */
    async createUser(payload: { email: string, roles: UserRole[], displayName?: string, departmentId?: string }, performer: { uid: string, email: string }) {
        // Generate random 12 char password (owner should reset)
        const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';

        const userRecord = await admin.auth().createUser({
            email: payload.email,
            password: tempPassword,
            displayName: payload.displayName,
        });

        const uid = userRecord.uid;

        // Set Claims & Profile
        await admin.auth().setCustomUserClaims(uid, {
            roles: payload.roles,
            isActive: true
        });

        const now = admin.firestore.FieldValue.serverTimestamp();
        const profile: User = {
            email: payload.email,
            displayName: payload.displayName,
            roles: payload.roles,
            isActive: true,
            createdAt: now,
            updatedAt: now
        };

        if (payload.departmentId) profile.departmentId = payload.departmentId;

        await getUserCollection().doc(uid).set(profile);

        await this.logAdminAction({
            action: 'CREATE_USER',
            performedByUid: performer.uid,
            performedByEmail: performer.email,
            targetUid: uid,
            targetEmail: payload.email,
            after: profile as any
        });

        return { uid, email: payload.email, tempPassword };
    },

    /**
     * Set activation status
     */
    async setActiveStatus(uid: string, isActive: boolean, performer: { uid: string, email: string }) {
        // Prevent disabling the last super admin check (simplified logic)
        if (!isActive) {
            const superAdmins = await getUserCollection().where('roles', 'array-contains', 'SUPER_ADMIN').get();
            const targetUser = await getUserCollection().doc(uid).get();
            if (targetUser.data()?.roles?.includes('SUPER_ADMIN') && superAdmins.size <= 1) {
                throw new Error('Cannot disable the only Super Admin');
            }
        }

        const userDoc = await getUserCollection().doc(uid).get();
        const email = userDoc.data()?.email || 'unknown';
        const roles = userDoc.data()?.roles || [];

        await admin.auth().setCustomUserClaims(uid, {
            roles,
            isActive
        });

        await getUserCollection().doc(uid).update({
            isActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Force refresh & token revocation
        await admin.auth().revokeRefreshTokens(uid);
        await db.collection('userStatus').doc(uid).set(
            { forceRefresh: Date.now() },
            { merge: true }
        );

        await this.logAdminAction({
            action: 'SET_ACTIVE_STATUS',
            performedByUid: performer.uid,
            performedByEmail: performer.email,
            targetUid: uid,
            targetEmail: email,
            after: { isActive }
        });
    },

    async logAdminAction(log: Omit<AdminAuditLog, 'createdAt'>) {
        // Filter out undefined values to avoid Firestore errors
        const cleanedLog: any = { ...log };
        if (cleanedLog.before === undefined) delete cleanedLog.before;
        if (cleanedLog.after === undefined) delete cleanedLog.after;

        await getAuditLogCollection().add({
            ...cleanedLog,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
};
