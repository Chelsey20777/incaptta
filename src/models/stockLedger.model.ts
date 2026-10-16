import { z } from 'zod';

export const StockLedgerTypeSchema = z.enum(['ISSUE', 'RETURN', 'ADJUSTMENT']);

export const StockLedgerEntrySchema = z.object({
    inventoryItemId: z.string().min(1),
    sku: z.string().min(1),
    type: StockLedgerTypeSchema,
    sourceType: z.enum(['JOB_REQUISITION', 'MANUAL']),
    sourceId: z.string().optional(),
    lineItemId: z.string().optional(),
    quantityChange: z.number(), // + for returns/adjustments, - for issues
    previousStock: z.number().nonnegative(),
    newStock: z.number().nonnegative(),
    reason: z.string().optional(),
    performedBy: z.string().min(1),
    timestamp: z.any(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type StockLedgerType = z.infer<typeof StockLedgerTypeSchema>;
export type StockLedgerEntry = z.infer<typeof StockLedgerEntrySchema>;
