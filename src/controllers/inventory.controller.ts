import { Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';
import { InventoryItem } from '../models/inventory.model';

interface ImportRequest extends Request {
    file: any;
    body: {
        sheetName?: string;
    };
}

export const createInventoryItem = async (req: Request, res: Response) => {
    try {
        const item = await InventoryService.create({
            ...req.body,
            createdBy: req.user?.uid
        });
        res.status(201).json(item);
    } catch (error: any) {
        if (error.message === 'SKU already exists') {
            return res.status(409).json({ message: error.message });
        }
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

export const getInventoryItems = async (req: Request, res: Response) => {
    try {
        const filters = {
            category: req.query.category as string,
            sku: req.query.sku as string,
            isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        };
        const items = await InventoryService.getAll(filters);
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getInventoryItem = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const item = await InventoryService.getById(id);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        res.json(item);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateInventoryItem = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        // Basic partial validation could go here or use a patch schema
        const item = await InventoryService.update(id, req.body);
        res.json(item);
    } catch (error: any) {
        if (error.message === 'Item not found') return res.status(404).json({ message: error.message });
        if (error.message === 'SKU already exists') return res.status(409).json({ message: error.message });
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

export const importInventory = async (req: Request, res: Response) => {
    // TODO: Implement CSV/XLSX import
    res.status(501).json({ message: 'Not Implemented: Inventory Import' });
};
