import { DecodedIdToken } from 'firebase-admin/auth';
import { UserRole } from '../../models/user.model';

declare global {
    namespace Express {
        interface Request {
            user?: {
                uid: string;
                email?: string;
                name?: string;
                roles?: UserRole[];
                isActive?: boolean;
                claims?: DecodedIdToken;
            };
            userRole?: UserRole;
            userPermissions?: string[];
        }
    }
}
