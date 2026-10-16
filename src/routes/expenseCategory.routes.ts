import { Router } from 'express';
import * as ExpenseCategoryController from '../controllers/expenseCategory.controller';

const router = Router();

router.post('/', ExpenseCategoryController.createExpenseCategory);
router.get('/', ExpenseCategoryController.getExpenseCategories);
router.patch('/:id', ExpenseCategoryController.updateExpenseCategory);

export default router;
