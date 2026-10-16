import { QuotationService } from '../services/quotation.service';
import { Quotation } from '../models/billing.model';

describe('Billing Logic', () => {
    test('calculateTotals should compute mixed lines correctly', () => {
        const quote: Partial<Quotation> = {
            lines: [
                {
                    lineType: 'INVENTORY',
                    sku: 'INV-01',
                    descriptionSnapshot: 'Item 1',
                    unitPriceSnapshot: 100,
                    quantity: 2,
                    markupPercent: 10,
                    lineTotal: 0
                },
                {
                    lineType: 'EXPENSE',
                    expenseCategoryNameSnapshot: 'Fuel',
                    descriptionSnapshot: 'Fuel for transport',
                    unitPriceSnapshot: 50,
                    quantity: 1,
                    markupPercent: 0,
                    lineTotal: 0
                }
            ]
        };

        QuotationService.calculateTotals(quote);

        // Inventory: (100 * 2) * 1.1 = 220
        expect(quote.totals?.inventoryTotal).toBe(220);
        // Expenses: 50 * 1 = 50
        expect(quote.totals?.expensesTotal).toBe(50);
        // Grand: 220 + 50 = 270
        expect(quote.totals?.grandTotal).toBe(270);
    });

    test('lineTotal should handle 0 quantity correctly', () => {
        const quote: Partial<Quotation> = {
            lines: [
                {
                    lineType: 'INVENTORY',
                    descriptionSnapshot: 'Zero test',
                    unitPriceSnapshot: 100,
                    quantity: 0,
                    markupPercent: 10,
                    lineTotal: 0
                }
            ]
        };
        QuotationService.calculateTotals(quote);
        expect(quote.lines![0].lineTotal).toBe(0);
        expect(quote.totals?.grandTotal).toBe(0);
    });
});
