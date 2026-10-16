import { JobRequisitionService } from '../services/jobRequisition.service';
import { JobRequisition } from '../models/jobRequisition.model';

describe('JobRequisition Logic', () => {
    test('calculateTotals should compute inventory and expense totals correctly', () => {
        const jr: Partial<JobRequisition> = {
            inventoryItems: [
                {
                    id: 'item1',
                    inventoryItemId: 'inv1',
                    sku: 'SKU1',
                    descriptionSnapshot: 'Item 1',
                    unitPriceSnapshot: 100,
                    qtyRequested: 2,
                    markupPercent: 10,
                    lineTotal: 0,
                    qtyIssued: 0,
                    qtyToRelease: 0,
                    status: 'PLANNED'
                }
            ],
            expenseItems: [
                {
                    id: 'exp1',
                    expenseCategoryId: 'exp1',
                    expenseCategoryNameSnapshot: 'Fuel',
                    description: 'Truck fuel',
                    quantity: 50,
                    unitCost: 1.5,
                    lineTotal: 0,
                    status: 'PLANNED'
                }
            ]
        };

        JobRequisitionService.calculateTotals(jr);

        // Inventory: (100 * 2) * 1.1 = 220
        expect(jr.totals?.planned?.inventory).toBe(220);
        // Expenses: 50 * 1.5 = 75
        expect(jr.totals?.planned?.expenses).toBe(75);
        // Grand: 220 + 75 = 295
        expect(jr.totals?.planned?.grand).toBe(295);
    });
});
