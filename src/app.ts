import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '512kb' }));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to IncapttaPro API' });
});

// Lazy-loaded routes for performance (Fixes Firebase Timeout)
app.use('/api/inventory', (req, res, next) => require('./routes/inventory.routes').default(req, res, next));
app.use('/api/job-requisitions', (req, res, next) => require('./routes/jobRequisition.routes').default(req, res, next));
app.use('/api/expense-categories', (req, res, next) => require('./routes/expenseCategory.routes').default(req, res, next));
app.use('/api/quotations', (req, res, next) => require('./routes/quotation.routes').default(req, res, next));
app.use('/api/invoices', (req, res, next) => require('./routes/invoice.routes').default(req, res, next));
app.use('/api/clients', (req, res, next) => require('./routes/others.routes').clientRouter(req, res, next));
app.use('/api/users', (req, res, next) => require('./routes/others.routes').userRouter(req, res, next));
app.use('/api/expense-ledger', (req, res, next) => require('./routes/expenseLedger.routes').default(req, res, next));
app.use('/api/stock-ledger', (req, res, next) => require('./routes/stockLedger.routes').default(req, res, next));
app.use('/api/job-cards', (req, res, next) => require('./routes/jobCard.routes').default(req, res, next));
app.use('/api/operational-expenses', (req, res, next) => require('./routes/operationalExpense.routes').default(req, res, next));
app.use('/api/cash-management', (req, res, next) => require('./routes/cashManagement.routes').default(req, res, next));
app.use('/api/analytics', (req, res, next) => require('./routes/analytics.routes').default(req, res, next));
app.use('/api/webhooks', (req, res, next) => require('./routes/webhook.routes').default(req, res, next));

export default app;
