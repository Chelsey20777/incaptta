import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { UserRole } from '../models/user.model';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token, true);

        const roles = (decodedToken.roles as UserRole[]) || [];
        const isActive = decodedToken.isActive === true;

        if (!isActive) {
            return res.status(403).json({ message: 'Forbidden: User account is inactive' });
        }

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || (decodedToken as any).displayName,
            roles,
            isActive,
            claims: decodedToken
        };

        next();
    } catch (error) {
        console.error('Error verifying auth token', error);
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};
