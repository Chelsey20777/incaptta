import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Public Webhook Routes
 * Note: Authentication is handled inside the controller via X-EcoCash-Secret header
 */
router.post('/sms/ecocash', WebhookController.handleEcoCashSms);

export default router;
