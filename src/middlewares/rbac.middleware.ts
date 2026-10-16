import { Request, Response, NextFunction } from 'express';
import { db } from '../config/firebase';
import { UserRole } from '../models/user.model';

export const rbacMiddleware = (allowedRoles: (UserRole | string)[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.user.uid) {
            return res.status(401).json({ message: 'Unauthorized: No user found' });
        }

        if (req.user.isActive === false) {
            return res.status(403).json({ message: 'Forbidden: User account is inactive' });
        }

        const { uid } = req.user;

        try {
            // 1. CLAIMS FIRST
            const claimRoles = req.user.roles || [];

            if (claimRoles.includes('SUPER_ADMIN' as UserRole)) {
                req.userRole = 'SUPER_ADMIN' as UserRole;
                return next();
            }

            const hasClaimAccess = claimRoles.some(role => allowedRoles.includes(role));
            if (hasClaimAccess) {
                req.userRole = claimRoles[0] as UserRole;
                return next();
            }

            // 2. FIRESTORE FALLBACK (Only if claims are empty/incorrect)
            if (claimRoles.length === 0) {
                const userDoc = await db.collection('users').doc(uid).get();

                if (!userDoc.exists) {
                    console.warn(`[RBAC] No profile found for user ${uid}`);
                    return res.status(403).json({ message: 'Forbidden: User profile not found' });
                }

                const userData = userDoc.data();
                const isActive = userData?.isActive === true;

                if (!isActive) {
                    return res.status(403).json({ message: 'Forbidden: User account is inactive' });
                }

                const firestoreRoles: UserRole[] = Array.isArray(userData?.roles)
                    ? userData.roles
                    : (userData?.role ? [userData.role] : []);

                if (firestoreRoles.includes('SUPER_ADMIN' as UserRole)) {
                    req.userRole = 'SUPER_ADMIN' as UserRole;
                    return next();
                }

                const hasFirestoreAccess = firestoreRoles.some(role => allowedRoles.includes(role));
                if (hasFirestoreAccess) {
                    req.userRole = firestoreRoles[0] as UserRole;
                    return next();
                }
            }

            // Fallback for insufficient permissions
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        } catch (error) {
            console.error('RBAC Error:', error);
            return res.status(500).json({ message: 'Internal Server Error during authorization' });
        }
    };
};
