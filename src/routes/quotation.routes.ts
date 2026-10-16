import { Router } from 'express';
import * as BillingController from '../controllers/billing.controller';

const router = Router();

router.post('/from-job-requisition/:jrId', BillingController.createQuoteFromJR);
router.get('/:id', BillingController.getQuote);
router.patch('/:id', BillingController.updateQuote);
router.post('/:id/send', BillingController.sendQuote);
router.post('/:id/accept', BillingController.acceptQuote);

export default router;
