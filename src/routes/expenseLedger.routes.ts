import { Router } from 'express';
import * as LedgerController from '../controllers/expenseLedger.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', LedgerController.getLedgerEntries);
router.get('/:id', LedgerController.getLedgerEntry);

router.post(
    '/:id/mark-paid',
    rbacMiddleware(['Admin', 'Accountant']),
    LedgerController.markPaid
);

export default router;
