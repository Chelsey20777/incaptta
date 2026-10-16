import { z } from 'zod';

/**
 * Normalizes SKU according to the rules:
 * - trim()
 * - uppercase
 * - replace internal whitespace runs with -
 * - remove characters not in [A-Z0-9_-]
 */
export const normalizeSku = (sku: string): string => {
    return sku
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9_-]/g, '');
};

/**
 * Parses numeric strings with commas and handles blanks.
 */
const parseNumeric = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    // Handle objects (like Excel formula results)
    if (typeof val === 'object' && val.result !== undefined) val = val.result;

    const cleaned = String(val)
        .replace(/,/g, '') // remove commas
        .replace(/[a-zA-Z²]/g, '') // remove units like Pcs, M, m², Pack
        .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
};

export const inventoryImportRowSchema = z
    .object({
        category: z.string().transform((val) => (val?.trim() ? val.trim() : 'Uncategorized')),
        name: z.string().min(1, 'Name is required'),
        rawSku: z.any().transform((val) => {
            if (typeof val === 'object' && val !== null && 'result' in val) return String(val.result);
            return val !== null && val !== undefined ? String(val) : '';
        }),
        sku: z.string().optional(), // Will be populated after normalization
        inStock: z.any().transform((val) => {
            const parsed = parseNumeric(val);
            return parsed !== null ? Math.floor(parsed) : 0;
        }),
        purchasePrice: z.any().transform(parseNumeric),
        freightDuty: z.any().transform(parseNumeric),
        totalCost: z.any().transform(parseNumeric),
        markupPercent: z.any().transform(parseNumeric),
        sellingPriceIRD: z.any().transform(parseNumeric),
    })
    .transform((data) => {
        // SKU Normalization
        data.sku = normalizeSku(data.rawSku);

        // Derived Values
        // If totalCost is null AND purchasePrice is present: totalCost = purchasePrice + (freightDuty ?? 0)
        if (data.totalCost === null && data.purchasePrice !== null) {
            data.totalCost = data.purchasePrice + (data.freightDuty ?? 0);
        }

        // If sellingPriceIRD is null AND totalCost + markupPercent present: sellingPriceIRD = totalCost * (1 + markupPercent/100)
        if (data.sellingPriceIRD === null && data.totalCost !== null && data.markupPercent !== null) {
            data.sellingPriceIRD = data.totalCost * (1 + data.markupPercent / 100);
        }

        return data;
    })
    .refine((data) => (data.sku ? data.sku.length > 0 : false), {
        message: 'Normalized SKU cannot be empty',
        path: ['sku'],
    })
    .refine((data) => (data.sku ? data.sku.length <= 64 : false), {
        message: 'SKU cannot exceed 64 characters',
        path: ['sku'],
    })
    .refine((data) => data.markupPercent === null || (data.markupPercent >= 0 && data.markupPercent <= 100), {
        message: 'Markup percent must be between 0 and 100',
        path: ['markupPercent'],
    });

export type InventoryImportRow = z.infer<typeof inventoryImportRowSchema>;
