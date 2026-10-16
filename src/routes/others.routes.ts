import { Router } from 'express';
import * as ClientController from '../controllers/client.controller';
import * as UserController from '../controllers/user.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate.middleware';
import { ClientSchema } from '../models/client.model';

const clientRouter = Router();
clientRouter.use(authMiddleware);

clientRouter.post('/', rbacMiddleware(['ADMIN', 'MANAGER']), validate(ClientSchema), ClientController.createClient);
clientRouter.get('/', ClientController.getClients);
clientRouter.get('/:id', ClientController.getClient);
clientRouter.patch('/:id', rbacMiddleware(['ADMIN', 'MANAGER']), ClientController.updateClient);

export { clientRouter };

const userRouter = Router();
userRouter.use(authMiddleware);

userRouter.get('/me', UserController.getMe);
userRouter.get('/', rbacMiddleware(['ADMIN', 'MANAGER']), UserController.getUsers);
userRouter.post('/', rbacMiddleware(['SUPER_ADMIN', 'ADMIN']), UserController.createUser);

// Session tracking — register before /:id routes
userRouter.post('/sessions/heartbeat', UserController.heartbeatSession);
userRouter.get('/:id/sessions', rbacMiddleware(['ADMIN', 'SUPER_ADMIN']), UserController.getUserSessions);
userRouter.post('/:id/revoke-sessions', rbacMiddleware(['ADMIN', 'SUPER_ADMIN']), UserController.revokeUserSessions);

userRouter.patch('/:id', rbacMiddleware(['ADMIN']), UserController.updateUser);
userRouter.delete('/:id', rbacMiddleware(['ADMIN']), UserController.deleteUser);

userRouter.post('/fcm/register', UserController.registerFcmToken);
userRouter.post('/fcm/unregister', UserController.unregisterFcmToken);

export { userRouter };
