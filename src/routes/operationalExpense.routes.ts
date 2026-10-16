import { Router } from 'express';
import * as OperationalExpenseController from '../controllers/operationalExpense.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', OperationalExpenseController.createExpense);
router.get('/', OperationalExpenseController.getExpenses);
router.get('/:id', OperationalExpenseController.getExpense);

export default router;
