import { z } from 'zod';

export const UserRoleSchema = z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
    'STOREKEEPER',
    'TECHNICAL',
    'SALES',
    'DIRECTOR',
    'POULTRY_MANAGER',
    'FARM_HAND',
    'MBDI_STAFF',
]);

export const UserSchema = z.object({
    email: z.string().email(),
    displayName: z.string().optional(),
    isActive: z.boolean().default(true),
    roles: z.array(UserRoleSchema),
    primaryRole: UserRoleSchema.optional(),
    departmentId: z.string().optional(),
    departmentName: z.string().optional(),
    /** Linked HR employee doc id (optional — users need not be on the roster). */
    employeeId: z.string().nullable().optional(),
    /** Per-user module grants (MBDI is not role-matrix based for employees). */
    modules: z
        .object({
            mbdi: z.boolean().optional(),
        })
        .optional(),
    fcmTokens: z.array(z.string()).optional(),
    /** Signature image URL used on quotes / invoices / job card PDFs. */
    signatureUrl: z.string().optional(),
    /** Job title / position shown under the signer name on PDFs. */
    position: z.string().optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
