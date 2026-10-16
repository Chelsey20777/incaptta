import { z } from 'zod';

export const BillingLineItemSchema = z.object({
    lineType: z.enum(['INVENTORY', 'EXPENSE']),

    // Inventory fields
    inventoryItemId: z.string().optional(),
    sku: z.string().optional(),

    // Expense fields
    expenseCategoryId: z.string().optional(),
    expenseCategoryNameSnapshot: z.string().optional(),

    // Shared fields
    descriptionSnapshot: z.string().min(1),
    quantity: z.number().positive(),
    unitPriceSnapshot: z.number().nonnegative(),
    markupPercent: z.number().min(0).max(100).default(0),
    lineTotal: z.number().nonnegative(), // Backend calculated
});

export const QuotationSchema = z.object({
    quoteNumber: z.string().optional(), // Auto-generated human-friendly ID
    status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']).default('DRAFT'),
    source: z.object({
        type: z.literal('JOB_REQUISITION'),
        id: z.string(),
    }),
    clientId: z.string().min(1),
    clientNameSnapshot: z.string().min(1),
    lines: z.array(BillingLineItemSchema).min(1),
    totals: z.object({
        inventoryTotal: z.number().nonnegative().default(0),
        expensesTotal: z.number().nonnegative().default(0),
        grandTotal: z.number().nonnegative().default(0),
    }).optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
    createdBy: z.string().optional(),
});

export const InvoiceSchema = z.object({
    invoiceNumber: z.string().optional(), // Auto-generated human-friendly ID
    status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'VOID']).default('DRAFT'),
    source: z.object({
        type: z.literal('QUOTATION'),
        id: z.string(),
    }),
    clientId: z.string().min(1),
    clientNameSnapshot: z.string().min(1),
    lines: z.array(BillingLineItemSchema).min(1),
    totals: z.object({
        inventoryTotal: z.number().nonnegative().default(0),
        expensesTotal: z.number().nonnegative().default(0),
        grandTotal: z.number().nonnegative().default(0),
    }).optional(),
    payment: z.object({
        amountPaid: z.number().nonnegative().default(0),
        balanceDue: z.number().nonnegative().default(0),
        paidAt: z.any().optional(),
        method: z.string().optional(),
        reference: z.string().optional(),
    }).optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
    createdBy: z.string().optional(),
});

export type BillingLineItem = z.infer<typeof BillingLineItemSchema>;
export type Quotation = z.infer<typeof QuotationSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
