import { Router } from 'express';
import * as BillingController from '../controllers/billing.controller';

const router = Router();

router.post('/from-quotation/:quoteId', BillingController.createInvoiceFromQuote);
router.get('/:id', BillingController.getInvoice);
router.post('/:id/issue', BillingController.issueInvoice);
router.post('/:id/mark-paid', BillingController.markInvoicePaid);
router.post('/:id/void', BillingController.voidInvoice);

export default router;
