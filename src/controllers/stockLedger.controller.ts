import { Request, Response } from 'express';
import { StockLedgerService } from '../services/stockLedger.service';
import { StockLedgerType } from '../models/stockLedger.model';

export const getLedgerEntries = async (req: Request, res: Response) => {
    try {
        const filters = {
            inventoryItemId: req.query.inventoryItemId as string,
            sku: req.query.sku as string,
            type: req.query.type as StockLedgerType,
            jrId: req.query.jrId as string,
        };
        const entries = await StockLedgerService.query(filters);
        res.json(entries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const adjustStock = async (req: Request, res: Response) => {
    try {
        const { inventoryItemId, quantityChange, reason } = req.body;
        const userId = (req as any).user?.uid || 'system';

        if (!inventoryItemId || quantityChange === undefined) {
            return res.status(400).json({ error: 'inventoryItemId and quantityChange are required' });
        }

        const result = await StockLedgerService.adjustStock(
            inventoryItemId,
            quantityChange,
            userId,
            reason
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
