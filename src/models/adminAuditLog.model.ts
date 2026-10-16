import { z } from 'zod';

export const AdminActionSchema = z.enum([
    'CREATE_USER',
    'SET_ROLES',
    'SET_ACTIVE_STATUS',
    'PROMOTE_SUPER_ADMIN',
    'DELETE_USER'
]);

export const AdminAuditLogSchema = z.object({
    action: AdminActionSchema,
    performedByUid: z.string(),
    performedByEmail: z.string(),
    targetUid: z.string(),
    targetEmail: z.string(),
    before: z.any().optional(),
    after: z.any().optional(),
    createdAt: z.any().optional(),
});

export type AdminAction = z.infer<typeof AdminActionSchema>;
export type AdminAuditLog = z.infer<typeof AdminAuditLogSchema>;
