import { Request, Response } from 'express';
import { ExpenseCategoryService } from '../services/expenseCategory.service';
import { ExpenseCategorySchema } from '../models/expenseCategory.model';

export const createExpenseCategory = async (req: Request, res: Response) => {
    try {
        const validatedData = ExpenseCategorySchema.parse(req.body);
        const category = await ExpenseCategoryService.create(validatedData);
        res.status(201).json(category);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to create expense category' });
    }
};

export const getExpenseCategories = async (req: Request, res: Response) => {
    try {
        const activeOnly = req.query.activeOnly === 'true';
        const categories = await ExpenseCategoryService.getAll(activeOnly);
        res.json(categories);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch expense categories' });
    }
};

export const updateExpenseCategory = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const category = await ExpenseCategoryService.update(id, req.body);
        res.json(category);
    } catch (error: any) {
        res.status(400).json({ error: 'Failed to update expense category' });
    }
};
