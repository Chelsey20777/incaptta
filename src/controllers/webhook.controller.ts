import { Request, Response } from 'express';
import { EcoCashService } from '../services/ecocash.service';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Controller to handle incoming webhooks from external SMS listeners.
 */
export const WebhookController = {
    /**
     * Receives and processes EcoCash SMS notifications.
     */
    async handleEcoCashSms(req: Request, res: Response) {
        try {
            // 1. Security Check: Verify secret header
            const incomingSecret = req.headers['x-ecocash-secret'];
            if (incomingSecret !== process.env.ECOCASH_WEBHOOK_SECRET) {
                console.warn('[Webhook] Unauthorized webhook attempt - Invalid Secret');
                return res.status(401).json({ error: 'Unauthorized: Invalid Secret' });
            }

            // 2. Extract Data: Assuming common SMS gateway format
            const { sender, text } = req.body;
            
            if (!text) {
                return res.status(400).json({ error: 'Missing message text' });
            }

            // 3. Filtering: Ensure it is actually an EcoCash message
            const isEcoCash = sender?.includes('263164') || text.includes('Approval Code:');
            if (!isEcoCash) {
                console.log(`[Webhook] Ignoring non-EcoCash message from ${sender}`);
                return res.status(200).json({ status: 'ignored', reason: 'Not an EcoCash message' });
            }

            // 4. Delegation: Process the business logic
            const result = await EcoCashService.processSms(sender || 'Unknown', text);
            
            return res.status(200).json(result);
        } catch (error: any) {
            console.error('[Webhook Controller Error]:', error.message);
            return res.status(500).json({ 
                error: 'Internal Server Error', 
                message: error.message 
            });
        }
    }
};
