import { Request, Response } from 'express';
import { CashManagementService } from '../services/cashManagement.service';

export const postTransfer = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const userId = (req as any).user?.uid || 'system';
        const result = await CashManagementService.postFundTransfer(id, userId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
