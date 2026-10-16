import { z } from 'zod';

export const LineStatusSchema = z.enum([
    'PLANNED',
    'REQUESTED',
    'ACCOUNTANT_APPROVED',
    'DIRECTOR_APPROVED',
    'RELEASED',
    'REJECTED',
    'CANCELLED'
]);

export const LineApprovalSchema = z.object({
    requestedBy: z.string().optional(),
    requestedAt: z.any().optional(),
    accountant: z.object({
        approved: z.boolean().default(false),
        by: z.string().optional(),
        at: z.any().optional(),
        note: z.string().optional(),
    }).optional(),
    director: z.object({
        approved: z.boolean().default(false),
        by: z.string().optional(),
        at: z.any().optional(),
        note: z.string().optional(),
    }).optional(),
});

export const InventoryLineItemSchema = z.object({
    id: z.string().min(1), // UUID for staged tracking
    inventoryItemId: z.string().min(1),
    sku: z.string().min(1),
    descriptionSnapshot: z.string().min(1),
    unitPriceSnapshot: z.number().nonnegative(),
    qtyRequested: z.number().int().positive(),
    qtyToRelease: z.number().int().nonnegative().default(0), // Planned for next release
    qtyIssued: z.number().int().nonnegative().default(0),    // Cumulative released
    pendingReleaseId: z.string().optional(),                // Idempotency anchor
    markupPercent: z.number().min(0).max(100).default(0),
    lineTotal: z.number().nonnegative(),
    status: LineStatusSchema.default('PLANNED'),
    approval: LineApprovalSchema.optional(),
    released: z.object({
        by: z.string(),
        at: z.any()
    }).optional(),
});

export const ExpenseLineItemSchema = z.object({
    id: z.string().min(1), // UUID
    expenseCategoryId: z.string().min(1),
    expenseCategoryNameSnapshot: z.string().min(1),
    description: z.string().optional(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
    lineTotal: z.number().nonnegative(),
    status: LineStatusSchema.default('PLANNED'),
    approval: LineApprovalSchema.optional(),
    released: z.object({
        by: z.string(),
        at: z.any()
    }).optional(),
});

export const JobRequisitionSchema = z.object({
    jrNumber: z.string().optional(),
    clientId: z.string().min(1, 'Client ID is required'),
    requestedByUserId: z.string().min(1, 'Requester ID is required'),
    createdBy: z.object({
        uid: z.string(),
        name: z.string(),
    }).optional(),
    department: z.string().optional(),
    projectLocation: z.string().optional(),
    requiredDate: z.any(),
    status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED', 'CANCELLED']).default('DRAFT'),
    inventoryItems: z.array(InventoryLineItemSchema).default([]),
    expenseItems: z.array(ExpenseLineItemSchema).default([]),
    totals: z.object({
        planned: z.object({
            inventory: z.number().nonnegative().default(0),
            expenses: z.number().nonnegative().default(0),
            grand: z.number().nonnegative().default(0),
        }).default({ inventory: 0, expenses: 0, grand: 0 }),
        released: z.object({
            inventory: z.number().nonnegative().default(0),
            expenses: z.number().nonnegative().default(0),
            grand: z.number().nonnegative().default(0),
        }).default({ inventory: 0, expenses: 0, grand: 0 }),
    }).optional(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type InventoryLineItem = z.infer<typeof InventoryLineItemSchema>;
export type ExpenseLineItem = z.infer<typeof ExpenseLineItemSchema>;
export type JobRequisition = z.infer<typeof JobRequisitionSchema>;
export type LineStatus = z.infer<typeof LineStatusSchema>;
