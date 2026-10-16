import { z } from 'zod';

export const ClientSchema = z.object({
    clientName: z.string().min(1),
    contactPerson: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    tinOrTaxId: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
    createdAt: z.string().or(z.date()).optional(),
    updatedAt: z.string().or(z.date()).optional(),
    createdBy: z.string().optional()
});

export type Client = z.infer<typeof ClientSchema>;
