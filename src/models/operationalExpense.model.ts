import { z } from 'zod';

export const ExpenseStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']);
export const PaymentMethodSchema = z.enum(['CASH', 'ECOCASH', 'BANK']);

export const OperationalExpenseSchema = z.object({
    expenseNumber: z.string().optional(),
    categoryId: z.string(),
    categoryName: z.string(), // Denormalized
    description: z.string().min(1),
    vendorName: z.string().optional(),
    referenceNumber: z.string().optional(),
    amount: z.number().nonnegative(),
    currency: z.string().default('USD'),
    expenseDate: z.any(),
    paymentMethod: PaymentMethodSchema,
    status: ExpenseStatusSchema.default('DRAFT'),

    submittedAt: z.any().optional(),
    approvedAt: z.any().optional(),
    paidAt: z.any().optional(),

    createdBy: z.object({
        uid: z.string(),
        name: z.string(),
    }),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export const OperationalExpenseAttachmentSchema = z.object({
    fileName: z.string(),
    fileType: z.string(),
    storagePath: z.string(),
    url: z.string().optional(),
    uploadedByUid: z.string(),
    createdAt: z.any().optional(),
});

export const OperationalExpenseApprovalSchema = z.object({
    stage: z.enum(['ACCOUNTANT', 'MANAGER']),
    decision: z.enum(['APPROVE', 'REJECT']),
    actorUid: z.string(),
    actorRoles: z.array(z.string()),
    comment: z.string().optional(),
    createdAt: z.any().optional(),
});

export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type OperationalExpense = z.infer<typeof OperationalExpenseSchema>;
export type OperationalExpenseAttachment = z.infer<typeof OperationalExpenseAttachmentSchema>;
export type OperationalExpenseApproval = z.infer<typeof OperationalExpenseApprovalSchema>;

// Audit log is z.any() records as per standard immutable audit pattern or similar to AdminAuditLog
export const OperationalExpenseAuditLogSchema = z.object({
    action: z.string(),
    before: z.any().optional(),
    after: z.any().optional(),
    performedByUid: z.string(),
    createdAt: z.any().optional(),
});
