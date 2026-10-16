import { Request, Response } from 'express';
import { JobRequisitionService } from '../services/jobRequisition.service';
import { JobRequisitionSchema } from '../models/jobRequisition.model';

export const createJR = async (req: Request, res: Response) => {
    try {
        const validated = JobRequisitionSchema.parse(req.body);
        const { uid, displayName } = (req as any).user || { uid: 'system', displayName: 'System' };
        const jr = await JobRequisitionService.create(validated, uid, displayName || 'Unknown');
        res.status(201).json(jr);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getJR = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const jr = await JobRequisitionService.getById(id);
        if (!jr) return res.status(404).json({ error: 'Not found' });
        res.json(jr);
    } catch (error: any) {
        res.status(500).json({ error: 'Internal Error' });
    }
};

export const updateJR = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const jr = await JobRequisitionService.update(id, req.body);
        res.json(jr);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const submitJR = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await JobRequisitionService.submit(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const approveJR = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await JobRequisitionService.approve(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const issueJR = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await JobRequisitionService.issue(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// STAGED LINE ITEM ACTIONS

export const requestLineItem = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const lineItemId = req.params.lineItemId as string;
        const userId = (req as any).user?.uid || 'system';
        const result = await JobRequisitionService.requestLineItem(id, lineItemId, userId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const approveLineItem = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const lineItemId = req.params.lineItemId as string;
        const role = (req.body.role as 'ACCOUNTANT' | 'DIRECTOR') || 'ACCOUNTANT';
        const userId = (req as any).user?.uid || 'system';
        const result = await JobRequisitionService.approveLineItem(id, lineItemId, role, userId, req.body.note);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const rejectLineItem = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const lineItemId = req.params.lineItemId as string;
        const userId = (req as any).user?.uid || 'system';
        const result = await JobRequisitionService.rejectLineItem(id, lineItemId, userId, req.body.note);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const releaseInventoryLine = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const lineItemId = req.params.lineItemId as string;
        const { qtyToRelease, releaseId } = req.body;
        const userId = (req as any).user?.uid || 'system';

        if (!qtyToRelease || !releaseId) {
            return res.status(400).json({ error: 'qtyToRelease and releaseId are required' });
        }

        const result = await JobRequisitionService.releaseInventoryLine(id, lineItemId, qtyToRelease, userId, releaseId);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
