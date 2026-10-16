import { JobRequisitionService } from '../services/jobRequisition.service';
import { JobRequisition } from '../models/jobRequisition.model';

describe('Staged Inventory Release logic', () => {
    test('calculateTotals should use qtyIssued for released inventory totals', () => {
        const jr: Partial<JobRequisition> = {
            inventoryItems: [
                {
                    id: 'item1',
                    inventoryItemId: 'inv1',
                    sku: 'SKU1',
                    descriptionSnapshot: 'Item 1',
                    unitPriceSnapshot: 100,
                    qtyRequested: 10,
                    qtyIssued: 4, // 4 units released
                    qtyToRelease: 0,
                    markupPercent: 0,
                    lineTotal: 0,
                    status: 'DIRECTOR_APPROVED',
                },
            ],
            expenseItems: [],
        };

        JobRequisitionService.calculateTotals(jr);

        // Planned: 10 * 100 = 1000
        expect(jr.totals?.planned?.inventory).toBe(1000);
        // Released: 4 * 100 = 400
        expect(jr.totals?.released?.inventory).toBe(400);
        expect(jr.totals?.released?.grand).toBe(400);
    });

    test('calculateTotals should handle markup on released items', () => {
        const jr: Partial<JobRequisition> = {
            inventoryItems: [
                {
                    id: 'item1',
                    inventoryItemId: 'inv1',
                    sku: 'SKU1',
                    descriptionSnapshot: 'Item 1',
                    unitPriceSnapshot: 100,
                    qtyRequested: 10,
                    qtyIssued: 5,
                    qtyToRelease: 0,
                    markupPercent: 20, // 20% markup
                    lineTotal: 0,
                    status: 'RELEASED',
                },
            ],
            expenseItems: [],
        };

        JobRequisitionService.calculateTotals(jr);

        // Planned: (10 * 100) * 1.2 = 1200
        expect(jr.totals?.planned?.inventory).toBe(1200);
        // Released: (5 * 100) * 1.2 = 600
        expect(jr.totals?.released?.inventory).toBe(600);
    });
});
