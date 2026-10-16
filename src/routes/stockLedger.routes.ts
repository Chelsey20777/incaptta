import { Router } from 'express';
import * as LedgerController from '../controllers/stockLedger.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', LedgerController.getLedgerEntries);

router.post(
    '/adjust',
    rbacMiddleware(['Admin']),
    LedgerController.adjustStock
);

export default router;
