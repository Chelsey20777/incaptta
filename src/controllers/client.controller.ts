import { Request, Response } from 'express';
import { ClientService } from '../services/client.service';

export const createClient = async (req: Request, res: Response) => {
    try {
        const client = await ClientService.create({ ...req.body, createdBy: req.user?.uid });
        res.status(201).json(client);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getClients = async (req: Request, res: Response) => {
    try {
        const clients = await ClientService.getAll();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getClient = async (req: Request, res: Response) => {
    try {
        const client = await ClientService.getById(req.params.id as string);
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateClient = async (req: Request, res: Response) => {
    try {
        const client = await ClientService.update(req.params.id as string, req.body);
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
