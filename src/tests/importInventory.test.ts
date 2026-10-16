import { normalizeSku, inventoryImportRowSchema } from '../validators/inventoryImportRow.zod';

describe('Inventory Import Logic', () => {
    describe('SKU Normalization', () => {
        it('should normalize SKUs correctly', () => {
            expect(normalizeSku(' sku 001 ')).toBe('SKU-001');
            expect(normalizeSku('abc 12/3')).toBe('ABC-123');
            expect(normalizeSku('ABC_123')).toBe('ABC_123');
            expect(normalizeSku('  ')).toBe('');
        });
    });

    describe('Row Validation & Transformation', () => {
        it('should parse numeric fields with commas', () => {
            const input = {
                category: 'Tools',
                name: 'Hammer',
                rawSku: 'SKU001',
                inStock: '1,000',
                purchasePrice: '15.50',
                freightDuty: '2.00',
                totalCost: null,
                markupPercent: '10',
                sellingPriceIRD: null,
            };

            const result = inventoryImportRowSchema.parse(input);
            expect(result.inStock).toBe(1000);
            expect(result.purchasePrice).toBe(15.5);
            expect(result.sku).toBe('SKU001');
        });

        it('should calculate derived values correctly', () => {
            const input = {
                category: '  ',
                name: 'Hammer',
                rawSku: 'SKU001',
                inStock: 10,
                purchasePrice: 100,
                freightDuty: 10,
                totalCost: null, // Should become 110
                markupPercent: 20,
                sellingPriceIRD: null, // Should become 110 * 1.2 = 132
            };

            const result = inventoryImportRowSchema.parse(input);
            expect(result.category).toBe('Uncategorized');
            expect(result.totalCost).toBe(110);
            expect(result.sellingPriceIRD).toBe(132);
        });

        it('should default inStock to 0 if blank', () => {
            const input = {
                category: 'Tools',
                name: 'Hammer',
                rawSku: 'SKU001',
                inStock: '',
                purchasePrice: null,
                freightDuty: null,
                totalCost: null,
                markupPercent: null,
                sellingPriceIRD: null,
            };

            const result = inventoryImportRowSchema.parse(input);
            expect(result.inStock).toBe(0);
        });

        it('should fail validation if SKU is missing or becomes empty', () => {
            const input = {
                category: 'Tools',
                name: 'Hammer',
                rawSku: '!!!', // Becomes empty
                inStock: 10,
            };

            expect(() => inventoryImportRowSchema.parse(input)).toThrow();
        });

        it('should fail validation if markup is out of bounds', () => {
            const input = {
                category: 'Tools',
                name: 'Hammer',
                rawSku: 'SKU001',
                inStock: 10,
                markupPercent: 150,
            };

            expect(() => inventoryImportRowSchema.parse(input)).toThrow('Markup percent must be between 0 and 100');
        });
    });
});
