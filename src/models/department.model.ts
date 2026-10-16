import { z } from 'zod';

export const DepartmentSchema = z.object({
    id: z.string(), // Code (e.g., TWID)
    name: z.string(),
    displayName: z.string(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type Department = z.infer<typeof DepartmentSchema>;
