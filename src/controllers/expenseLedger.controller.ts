import { Request, Response } from 'express';
import { ExpenseLedgerService } from '../services/expenseLedger.service';
import { ExpenseLedgerStatus } from '../models/expenseLedger.model';

export const getLedgerEntries = async (req: Request, res: Response) => {
    try {
        const filters = {
            jrId: req.query.jrId as string,
            status: req.query.status as ExpenseLedgerStatus,
        };
        const entries = await ExpenseLedgerService.query(filters);
        res.json(entries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getLedgerEntry = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const entry = await ExpenseLedgerService.getById(id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        res.json(entry);
    } catch (error: any) {
        res.status(500).json({ error: 'Internal Error' });
    }
};

export const markPaid = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = (req as any).user?.uid || 'system';
        const { paymentRef } = req.body;
        const result = await ExpenseLedgerService.markPaid(id, userId, paymentRef);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
