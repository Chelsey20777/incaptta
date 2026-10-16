import { Router } from 'express';
import * as JRController from '../controllers/jobRequisition.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', JRController.createJR);
router.get('/:id', JRController.getJR);
router.patch('/:id', JRController.updateJR);

router.post('/:id/submit', JRController.submitJR);
router.post('/:id/approve', rbacMiddleware(['Admin', 'Director']), JRController.approveJR);
router.post('/:id/issue', rbacMiddleware(['Admin', 'Director']), JRController.issueJR);

// Staged Line Item Actions
router.post('/:id/line-items/:lineItemId/request', JRController.requestLineItem);
router.post('/:id/line-items/:lineItemId/approve', rbacMiddleware(['Admin', 'Accountant', 'Director']), JRController.approveLineItem);
router.post('/:id/line-items/:lineItemId/reject', rbacMiddleware(['Admin', 'Accountant', 'Director']), JRController.rejectLineItem);
router.post('/:id/line-items/:lineItemId/release', rbacMiddleware(['Admin', 'Director']), JRController.releaseInventoryLine);

export default router;
