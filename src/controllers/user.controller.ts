import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { SessionService } from '../services/session.service';

function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return String(forwarded[0]).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

export const getMe = async (req: Request, res: Response) => {
    try {
        const user = await UserService.getById(req.user!.uid);
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await UserService.getAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const performerRoles = req.user?.roles || [];
        const user = await UserService.update(req.params.id as string, req.body, performerRoles);
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        if (!id) return res.status(400).json({ message: 'User ID is required.' })
        await UserService.delete(id as string)
        res.status(200).json({ message: 'User deleted successfully.' })
    } catch (error: any) {
        console.error('[UserController] deleteUser error:', error.message)
        res.status(500).json({ message: error.message || 'Internal Server Error' })
    }
}

export const createUser = async (req: Request, res: Response) => {
    try {
        console.log('[UserController] Received Body:', JSON.stringify(req.body));
        const { email, password, name, roles, isActive, employeeId } = req.body;
        if (!email || !name) {
            return res.status(400).json({ message: 'Email and Name are required.' });
        }

        const performerRoles = req.user?.roles || [];
        const newUser = await UserService.createUserWithPassword({
            email, password, name, roles, isActive, employeeId: employeeId ?? null
        }, performerRoles);

        // Use 201 Created Status
        res.status(201).json(newUser);
    } catch (error: any) {
        console.error('[UserController] createUser error:', error.message);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const registerFcmToken = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ message: 'Token is required' });
        await UserService.registerFcmToken(req.user!.uid, token);
        res.json({ message: 'Token registered' });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const unregisterFcmToken = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ message: 'Token is required' });
        await UserService.unregisterFcmToken(req.user!.uid, token);
        res.json({ message: 'Token unregistered' });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const heartbeatSession = async (req: Request, res: Response) => {
    try {
        const { sessionId, userAgent, app } = req.body || {};
        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        const result = await SessionService.heartbeat({
            uid: req.user!.uid,
            sessionId: String(sessionId),
            userAgent: typeof userAgent === 'string' ? userAgent : (req.headers['user-agent'] || ''),
            ip: getClientIp(req),
            app: typeof app === 'string' ? app : 'project-management-next',
        });

        res.json(result);
    } catch (error: any) {
        console.error('[UserController] heartbeatSession error:', error.message);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const getUserSessions = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '')
        if (!id) return res.status(400).json({ message: 'User ID is required.' });
        const sessions = await SessionService.listSessions(id);
        res.json({ sessions });
    } catch (error: any) {
        console.error('[UserController] getUserSessions error:', error.message);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const revokeUserSessions = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '')
        if (!id) return res.status(400).json({ message: 'User ID is required.' });
        const result = await SessionService.revokeAllSessions(id);
        res.json({ message: 'All sessions revoked.', ...result });
    } catch (error: any) {
        console.error('[UserController] revokeUserSessions error:', error.message);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
