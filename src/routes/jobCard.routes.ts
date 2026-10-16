import { Router } from 'express';
import * as JobCardController from '../controllers/jobCard.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', JobCardController.createJobCard);
router.get('/', JobCardController.getJobCards);
router.get('/:id', JobCardController.getJobCard);
router.post('/:id/approve', JobCardController.approveJobCard);
router.post('/:id/inventory-lines/:lineId/post', JobCardController.postInventoryLine);
router.post('/:id/notify-item', JobCardController.notifyItemAction);

export default router;
