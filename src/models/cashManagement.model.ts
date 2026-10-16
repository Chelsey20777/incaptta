import { z } from 'zod';

export const CashAccountTypeSchema = z.enum(['CASH', 'ECOCASH', 'BANK']);

export const CashAccountSchema = z.object({
    type: CashAccountTypeSchema,
    name: z.string().min(1),
    currency: z.string().default('USD'),
    isActive: z.boolean().default(true),
    metadata: z.any().optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export const TransferStatusSchema = z.enum(['DRAFT', 'POSTED', 'REVERSED']);

export const FundTransferSchema = z.object({
    transferNumber: z.string().optional(),
    fromAccountId: z.string(),
    fromType: CashAccountTypeSchema,
    toAccountId: z.string(),
    toType: CashAccountTypeSchema,
    amount: z.number().positive(),
    currency: z.string().default('USD'),
    transferDate: z.any(),
    fees: z.number().nonnegative().default(0),
    reference: z.string().optional(),
    notes: z.string().optional(),
    status: TransferStatusSchema.default('DRAFT'),
    postedAt: z.any().optional(),
    postedBy: z.string().optional(),
    createdBy: z.object({
        uid: z.string(),
        name: z.string(),
    }),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export const CashLedgerEntryTypeSchema = z.enum([
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'EXPENSE',
    'PAYMENT',
    'ADJUSTMENT'
]);

export const CashLedgerEntrySchema = z.object({
    accountId: z.string(),
    entryType: CashLedgerEntryTypeSchema,
    amount: z.number(), // Negative for outflow, positive for inflow
    currency: z.string().default('USD'),
    relatedType: z.string().optional(), // 'FUND_TRANSFER', 'EXPENSE', etc.
    relatedId: z.string().optional(),
    reference: z.string().optional(),
    createdAt: z.any().optional(),
    createdByUid: z.string(),
});

export type CashAccount = z.infer<typeof CashAccountSchema>;
export type FundTransfer = z.infer<typeof FundTransferSchema>;
export type CashLedgerEntry = z.infer<typeof CashLedgerEntrySchema>;
