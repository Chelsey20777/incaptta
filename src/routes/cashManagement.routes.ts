import { Router } from 'express';
import * as CashManagementController from '../controllers/cashManagement.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/transfers/:id/post', CashManagementController.postTransfer);

export default router;
