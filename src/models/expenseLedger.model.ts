import { z } from 'zod';

export const ExpenseLedgerStatusSchema = z.enum(['ACCRUED', 'PAID', 'CANCELLED']);

export const ExpenseLedgerEntrySchema = z.object({
    jrId: z.string().min(1),
    lineItemId: z.string().min(1),
    categoryId: z.string().min(1),
    categoryNameSnapshot: z.string().min(1),
    description: z.string().optional(),
    amount: z.number().nonnegative(),
    status: ExpenseLedgerStatusSchema.default('ACCRUED'),
    accruedAt: z.any(),
    approvedByAccountant: z.object({
        by: z.string(),
        at: z.any(),
    }),
    approvedByDirector: z.object({
        by: z.string(),
        at: z.any(),
    }),
    payment: z.object({
        paidAt: z.any().optional(),
        paidByUserId: z.string().optional(),
        paymentRef: z.string().optional(),
    }).optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type ExpenseLedgerStatus = z.infer<typeof ExpenseLedgerStatusSchema>;
export type ExpenseLedgerEntry = z.infer<typeof ExpenseLedgerEntrySchema>;
