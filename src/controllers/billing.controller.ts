import { Request, Response } from 'express';
import { QuotationService } from '../services/quotation.service';
import { InvoiceService } from '../services/invoice.service';
import { QuotationSchema } from '../models/billing.model';

export const createQuoteFromJR = async (req: Request, res: Response) => {
    try {
        const jrId = req.params.jrId as string;
        const userId = (req as any).user?.uid || 'system';
        const quote = await QuotationService.createFromJR(jrId, userId);
        res.status(201).json(quote);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getQuote = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const quote = await QuotationService.getById(id);
        if (!quote) return res.status(404).json({ error: 'Quotation not found' });
        res.json(quote);
    } catch (error: any) {
        res.status(500).json({ error: 'Internal Error' });
    }
};

export const updateQuote = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const quote = await QuotationService.update(id, req.body);
        res.json(quote);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const sendQuote = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await QuotationService.send(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const acceptQuote = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await QuotationService.accept(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// INVOICE CONTROLLERS

export const createInvoiceFromQuote = async (req: Request, res: Response) => {
    try {
        const quoteId = req.params.quoteId as string;
        const userId = (req as any).user?.uid || 'system';
        const invoice = await InvoiceService.createFromQuote(quoteId, userId);
        res.status(201).json(invoice);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getInvoice = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const invoice = await InvoiceService.getById(id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    } catch (error: any) {
        res.status(500).json({ error: 'Internal Error' });
    }
};

export const issueInvoice = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await InvoiceService.issue(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const markInvoicePaid = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await InvoiceService.markPaid(id, req.body);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const voidInvoice = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await InvoiceService.void(id);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
