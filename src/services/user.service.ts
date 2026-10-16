import { db, auth } from '../config/firebase';
import * as admin from 'firebase-admin';
import { User, UserRoleSchema } from '../models/user.model';
import { NotificationService } from './notification.service';

const collection = db.collection('users');

/** Keep employees.userId aligned when users.employeeId changes via Admin API. */
async function syncEmployeeUserLink(
    userId: string,
    prevEmployeeId: string | null,
    nextEmployeeId: string | null
) {
    if (prevEmployeeId && prevEmployeeId !== nextEmployeeId) {
        const prevRef = db.collection('employees').doc(prevEmployeeId)
        const prevSnap = await prevRef.get()
        if (prevSnap.exists && prevSnap.data()?.userId === userId) {
            await prevRef.update({
                userId: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            })
        }
    }

    if (nextEmployeeId) {
        const nextRef = db.collection('employees').doc(nextEmployeeId)
        const nextSnap = await nextRef.get()
        if (nextSnap.exists) {
            const priorUser = (nextSnap.data()?.userId as string | undefined) || null
            if (priorUser && priorUser !== userId) {
                await collection.doc(priorUser).update({
                    employeeId: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                })
            }
            await nextRef.update({
                userId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            })
        }
    }
}

export const UserService = {
    async syncUser(uid: string, email: string, displayName?: string) {
        const docRef = collection.doc(uid);
        const doc = await docRef.get();

        if (!doc.exists) {
            const initialRoles = ['TECHNICAL'];
            const initialIsActive = true;

            await docRef.set({
                email,
                name: displayName || 'Unknown',
                roles: initialRoles,
                isActive: initialIsActive,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await auth.setCustomUserClaims(uid, {
                roles: initialRoles,
                isActive: initialIsActive
            });
        }
    },

    async getById(uid: string) {
        const doc = await collection.doc(uid).get();
        if (!doc.exists) return null;
        return { uid: doc.id, ...doc.data() } as User & { uid: string };
    },

    async getAll() {
        const snapshot = await collection.get();
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    },

    async update(uid: string, data: Partial<User> & { employeeId?: string | null; name?: string; modules?: { mbdi?: boolean } }, performerRoles: string[] = []) {
        const hasEmployeeIdChange = Object.prototype.hasOwnProperty.call(data, 'employeeId')
        const hasModulesChange = Object.prototype.hasOwnProperty.call(data, 'modules')

        // Normalize employeeId: allow explicit null to clear the link
        const updatedData: Record<string, unknown> = {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (hasEmployeeIdChange) {
            updatedData.employeeId = data.employeeId ?? null;
        }
        if (hasModulesChange) {
            // Merge modules so other keys are preserved if added later
            const currentModules = ((await collection.doc(uid).get()).data()?.modules as Record<string, unknown> | undefined) || {}
            updatedData.modules = {
                ...currentModules,
                ...(data.modules || {}),
            }
        }

        const prevEmployeeId = hasEmployeeIdChange
            ? ((await collection.doc(uid).get()).data()?.employeeId as string | null | undefined) || null
            : null

        if (data.roles || data.isActive !== undefined) {
            // Get latest fresh data
            const currentDoc = await collection.doc(uid).get();
            const currentData = currentDoc.data() || {};

            if (data.roles) {
                const hadSuperAdmin = (currentData.roles || []).includes('SUPER_ADMIN');
                const willHaveSuperAdmin = data.roles.includes('SUPER_ADMIN');
                if (hadSuperAdmin !== willHaveSuperAdmin && !performerRoles.includes('SUPER_ADMIN')) {
                    throw new Error('Unauthorized: Only a Super Admin can assign or revoke the SUPER_ADMIN role.');
                }
            }

            // Merge changes for validation
            const mergedRoles = data.roles || currentData.roles || [];
            const mergedIsActive = data.isActive !== undefined ? data.isActive : (currentData.isActive !== false);

            // Sanitize roles strictly against schema
            console.log(`[UserService] Updating roles for ${uid}. Incoming:`, data.roles);
            const sanitizedRoles = Array.from(new Set(mergedRoles))
                .map((r: any) => typeof r === 'string' ? r.trim() : r)
                .filter((r: any) => {
                    const result = UserRoleSchema.safeParse(r);
                    if (!result.success) console.warn(`[UserService] Invalid role rejected: ${r}`);
                    return result.success;
                });

            const finalRoles = sanitizedRoles.length > 0 ? sanitizedRoles : ['TECHNICAL'];
            console.log(`[UserService] Final roles for ${uid}:`, finalRoles);

            // 1. Update Firestore with core fields
            await collection.doc(uid).update({
                ...updatedData,
                roles: finalRoles,
                isActive: mergedIsActive
            });

            // 2. Sync to Firebase Auth Claims
            await auth.setCustomUserClaims(uid, {
                roles: finalRoles,
                isActive: mergedIsActive
            });

            // 3. Keep Auth User 'disabled' state in sync
            await auth.updateUser(uid, {
                disabled: !mergedIsActive
            });

            // 4. Force token revocation and force refresh
            await auth.revokeRefreshTokens(uid);
            await db.collection('userStatus').doc(uid).set(
                { forceRefresh: Date.now() },
                { merge: true }
            );

            if (hasEmployeeIdChange) {
                await syncEmployeeUserLink(uid, prevEmployeeId, data.employeeId ?? null)
            }

            return { uid, ...data, roles: finalRoles, isActive: mergedIsActive };
        } else {
            await collection.doc(uid).update(updatedData);

            if (hasEmployeeIdChange) {
                await syncEmployeeUserLink(uid, prevEmployeeId, data.employeeId ?? null)
            } else {
                // Notify user about profile update
                NotificationService.sendToUser(uid, 'Profile Updated', 'Your profile information has been updated by an administrator.', {
                    type: 'PROFILE_UPDATED'
                });
            }

            return { uid, ...data };
        }
    },

    async delete(uid: string) {
        // Delete from Firebase Auth — ignore if no Auth account exists (orphaned Firestore record)
        try {
            await auth.deleteUser(uid)
        } catch (err: any) {
            const code: string = err.code || err.errorInfo?.code || ''
            const msg: string = err.message || ''
            const isNotFound = code.includes('user-not-found') || msg.toLowerCase().includes('no user record')
            if (!isNotFound) throw err
            console.warn(`[UserService] Auth account not found for uid ${uid}, deleting Firestore record only.`)
        }
        // Always delete the Firestore document regardless
        await collection.doc(uid).delete()
    },

    async createUserWithPassword(data: {
        email: string
        password?: string
        name: string
        roles: string[]
        isActive: boolean
        employeeId?: string | null
    }, performerRoles: string[] = []) {
        if (data.roles && data.roles.includes('SUPER_ADMIN') && !performerRoles.includes('SUPER_ADMIN')) {
            throw new Error('Unauthorized: Only a Super Admin can assign the SUPER_ADMIN role.');
        }
        let authRecord: admin.auth.UserRecord | null = null;
        try {
            // 1. Create a Firebase Auth User
            authRecord = await auth.createUser({
                email: data.email,
                password: data.password || undefined,
                displayName: data.name,
                disabled: !data.isActive
            });

            // 2. Sanitize and Set Custom Claims
            console.log(`[UserService] Creating user with roles:`, data.roles);
            const sanitizedRoles = Array.from(new Set(data.roles || []))
                .map((r: any) => typeof r === 'string' ? r.trim() : r)
                .filter((r: any) => {
                    const result = UserRoleSchema.safeParse(r);
                    if (!result.success) console.warn(`[UserService] Invalid role rejected during creation: ${r}`);
                    return result.success;
                });

            const finalRoles = sanitizedRoles.length > 0 ? sanitizedRoles : ['TECHNICAL'];
            console.log(`[UserService] Final sanctioned roles:`, finalRoles);

            await auth.setCustomUserClaims(authRecord.uid, {
                roles: finalRoles,
                isActive: data.isActive !== false
            });

            // 3. Resolve optional HR employee link (explicit id or matching email)
            let linkedEmployeeId: string | null =
                data.employeeId && typeof data.employeeId === 'string' ? data.employeeId : null

            if (!linkedEmployeeId && data.email) {
                const normalized = data.email.trim().toLowerCase()
                const empSnap = await db.collection('employees').get()
                const match = empSnap.docs.find(
                    (d) => ((d.data().email as string) || '').trim().toLowerCase() === normalized
                )
                if (match) linkedEmployeeId = match.id
            }

            // 4. Save standard profile locally
            const userProfile: Record<string, unknown> = {
                email: data.email,
                name: data.name,
                roles: finalRoles,
                isActive: data.isActive !== false,
                employeeId: linkedEmployeeId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await collection.doc(authRecord.uid).set(userProfile);

            // 5. Keep employee.userId in sync when linked
            if (linkedEmployeeId) {
                const empRef = db.collection('employees').doc(linkedEmployeeId)
                const empDoc = await empRef.get()
                if (empDoc.exists) {
                    const prevUserId = (empDoc.data()?.userId as string | undefined) || null
                    if (prevUserId && prevUserId !== authRecord.uid) {
                        await collection.doc(prevUserId).update({
                            employeeId: null,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        })
                    }
                    await empRef.update({
                        userId: authRecord.uid,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    })
                }
            }

            return { uid: authRecord.uid, ...userProfile };
        } catch (err: any) {
            // Specialized Error Handling
            let errorMessage = err.message;

            if (err.code === 'auth/email-already-exists') {
                errorMessage = 'Email already exists.';
            } else if (err.code === 'auth/invalid-password' || err.code === 'auth/weak-password') {
                errorMessage = 'The password must be at least 6 characters long.';
            } else if (err.code === 'auth/invalid-email') {
                errorMessage = 'The email address is badly formatted.';
            }

            // Cleanup if Auth user was created but Firestore failed
            if (authRecord && authRecord.uid) {
                try { await auth.deleteUser(authRecord.uid); } catch (e) { }
            }

            throw new Error(errorMessage);
        }
    },

    async registerFcmToken(uid: string, token: string) {
        await collection.doc(uid).set({
            fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    async unregisterFcmToken(uid: string, token: string) {
        await collection.doc(uid).set({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    async getUsersByRole(role: string) {
        const snapshot = await collection.where('roles', 'array-contains', role).where('isActive', '==', true).get();
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    }
};
