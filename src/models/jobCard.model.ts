import { z } from 'zod';

export const JobCardStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED']);

export const JobCardGeneralInfoSchema = z.object({
    jobCardTitle: z.string().min(1, 'Title is required'),
    requestingDepartmentId: z.string().min(1, 'Department is required'),
    requestingDepartmentName: z.string().min(1),
    jobCategoryId: z.string().min(1, 'Category is required'),
    jobCategoryName: z.string().min(1),

    jobNumber: z.string(),
    jobInvoiceValue: z.number().optional(),
    currency: z.string().default('USD'),
    projectLocation: z.string().optional(),
    dimensionsOfStructure: z.string().optional(),
    receiptNumber: z.string().optional(),
    ecocashOrBankAccount: z.string().optional(),
    startDate: z.any().optional(),
    nameOfRecipient: z.string().optional(),
    totalAmount: z.number().default(0),
});

export const SalesAssignmentSchema = z.object({
    salesRepUid: z.string(),
    salesRepName: z.string(),
    commissionRate: z.number().default(0.03),
});

export const JobCardSchema = z.object({
    status: JobCardStatusSchema.default('DRAFT'),
    generalInfo: JobCardGeneralInfoSchema,
    sales: SalesAssignmentSchema.optional(),
    createdBy: z.object({
        uid: z.string(),
        name: z.string(),
    }),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type JobCardStatus = z.infer<typeof JobCardStatusSchema>;
export type JobCardGeneralInfo = z.infer<typeof JobCardGeneralInfoSchema>;
export type JobCard = z.infer<typeof JobCardSchema>;
