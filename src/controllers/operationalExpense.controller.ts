import { Request, Response } from 'express';
import { OperationalExpenseService } from '../services/operationalExpense.service';
import { OperationalExpenseSchema } from '../models/operationalExpense.model';

export const createExpense = async (req: Request, res: Response) => {
    try {
        const { uid, name } = (req as any).user || { uid: 'system', name: 'System' };
        // We validate the payload, but the service handles full document assembly including expenseNumber
        const result = await OperationalExpenseService.createExpense(req.body, uid, name || 'Unknown');
        res.status(201).json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getExpense = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const expense = await OperationalExpenseService.getById(id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });
        res.json(expense);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getExpenses = async (req: Request, res: Response) => {
    try {
        const expenses = await OperationalExpenseService.query(req.query);
        res.json(expenses);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
