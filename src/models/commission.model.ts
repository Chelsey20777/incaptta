import { z } from 'zod';

export const CommissionStatusSchema = z.enum(['ACCRUED', 'PAID', 'REVERSED']);

export const CommissionSchema = z.object({
    jobCardId: z.string(),
    jobNumber: z.string(),
    salesRepUid: z.string(),
    salesRepName: z.string(),
    commissionRate: z.number().default(0.03),
    baseAmount: z.number(), // totalAmount from jobCard
    commissionAmount: z.number(), // baseAmount * rate
    currency: z.string().default('USD'),
    status: CommissionStatusSchema.default('ACCRUED'),
    approvedAt: z.any().optional(), // manager approval time
    managerUid: z.string().optional(),
    createdBy: z.object({
        uid: z.string(),
        name: z.string(),
    }),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type CommissionStatus = z.infer<typeof CommissionStatusSchema>;
export type Commission = z.infer<typeof CommissionSchema>;
