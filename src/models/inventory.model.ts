import { z } from 'zod';

export const InventoryItemSchema = z.object({
    category: z.string().min(1, "Category is required"),
    itemName: z.string().min(1, "Item Name is required"),
    sku: z.string().min(1, "SKU is required"), // Unique check handled in service
    inStock: z.number().int().nonnegative().default(0),
    purchasePrice: z.number().nullable().optional(),
    freightDuty: z.number().nullable().optional(),
    totalCost: z.number().nullable().optional(),
    markupPercent: z.number().nullable().optional(),
    sellingPriceIRD: z.number().nullable().optional(),
    twidPercent: z.number().nullable().optional(),
    pettyCashAccount: z.string().nullable().optional(),
    totalAmount: z.number().nullable().optional(),
    description: z.string().optional(),
    isActive: z.boolean().default(true),

    // Metadata typically handled by backend, but useful for validation if passed
    createdAt: z.string().or(z.date()).optional(),
    updatedAt: z.string().or(z.date()).optional(),
    createdBy: z.string().optional()
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;
