import { Router } from 'express';
import * as InventoryController from '../controllers/inventory.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate.middleware';
import { InventoryItemSchema } from '../models/inventory.model';

const router = Router();

router.use(authMiddleware);

router.post(
    '/',
    rbacMiddleware(['Admin', 'Storekeeper', 'Manager']),
    validate(InventoryItemSchema),
    InventoryController.createInventoryItem
);

router.post(
    '/import',
    rbacMiddleware(['Admin', 'Storekeeper', 'Manager']),
    InventoryController.importInventory
);

router.get('/', InventoryController.getInventoryItems);
router.get('/:id', InventoryController.getInventoryItem);

router.patch(
    '/:id',
    rbacMiddleware(['Admin', 'Storekeeper', 'Manager']),
    InventoryController.updateInventoryItem
);

export default router;
