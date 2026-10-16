import { z } from 'zod';

export const ExpenseCategorySchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
