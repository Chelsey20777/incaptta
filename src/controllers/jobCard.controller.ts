import { Request, Response } from 'express';
import { JobCardService } from '../services/jobCard.service';

export const createJobCard = async (req: Request, res: Response) => {
    try {
        const { uid, name, roles } = (req as any).user || { uid: 'system', name: 'System', roles: [] };

        const result = await JobCardService.createJobCard(req.body, uid, name || 'Unknown', roles);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getJobCard = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const jobCard = await JobCardService.getById(id);
        if (!jobCard) return res.status(404).json({ error: 'Job Card not found' });
        res.json(jobCard);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getJobCards = async (req: Request, res: Response) => {
    try {
        const jobCards = await JobCardService.query(req.query);
        res.json(jobCards);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const approveJobCard = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const managerUid = (req as any).user?.uid || 'system';
        const result = await JobCardService.managerApprove(id, managerUid);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const notifyItemAction = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { itemName, status } = req.body;
        if (!itemName || !status) return res.status(400).json({ error: 'itemName and status are required' });

        await JobCardService.sendItemApprovalNotification(id, itemName, status);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const postInventoryLine = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const roles: string[] = user?.roles || [];
        if (!roles.some(role => ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(role))) {
            return res.status(403).json({ error: 'Manager approval is required to post stock' });
        }
        const movementType = req.body?.movementType;
        if (movementType !== 'ISSUE' && movementType !== 'RETURN') {
            return res.status(400).json({ error: 'movementType must be ISSUE or RETURN' });
        }
        const result = await JobCardService.postInventoryLine(
            req.params.id as string,
            req.params.lineId as string,
            movementType,
            { uid: user.uid, name: user.name || user.email || user.uid }
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
