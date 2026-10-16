import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { rbacMiddleware } from '../middlewares/rbac.middleware';
import * as AnalyticsController from '../controllers/analytics.controller';
import * as AnalyticsChatController from '../controllers/analyticsChat.controller';

const router = Router();

// ── Rate limiter factory ──────────────────────────────────────────────────────
// Per-user in-memory sliding window. Each endpoint gets its own Map so
// brief and chat limits are tracked independently.
// In-memory only — resets on cold starts. Sufficient for abuse prevention
// on low-frequency, high-cost AI endpoints.

function makeRateLimiter(maxRequests: number, windowMs: number, label: string) {
    const timestamps = new Map<string, number[]>();

    return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
        const uid = (req as any).user?.uid as string | undefined;
        if (!uid) {
            res.status(401).json({ error: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }

        const now = Date.now();
        const windowStart = now - windowMs;
        const recent = (timestamps.get(uid) ?? []).filter(t => t > windowStart);

        if (recent.length >= maxRequests) {
            console.warn(`[${label}] Rate limit exceeded for uid=${uid} (${recent.length}/${maxRequests} in window)`);
            res.status(429).json({
                error: 'RATE_LIMITED',
                message: `Too many requests. You may make up to ${maxRequests} requests per minute.`,
            });
            return;
        }

        recent.push(now);
        timestamps.set(uid, recent);
        next();
    };
}

// Brief: 5/min — expensive full-analysis generation
const analyticsRateLimit = makeRateLimiter(5, 60_000, 'Analytics');

// Chat: 10/min — more lenient, conversational cadence; tracked separately
const analyticsChatRateLimit = makeRateLimiter(10, 60_000, 'AnalyticsChat');

// ── Route stack ───────────────────────────────────────────────────────────────
// All analytics routes require authentication.
router.use(authMiddleware);

/**
 * POST /api/analytics/brief
 *
 * Accepts a locally-computed AnalyticsPayload from the frontend.
 * Forwards it to DeepSeek server-side and returns a validated AI brief.
 *
 * Roles: MANAGER, ADMIN, SUPER_ADMIN
 */
router.post(
    '/brief',
    rbacMiddleware(['MANAGER', 'ADMIN', 'SUPER_ADMIN']),
    analyticsRateLimit,
    AnalyticsController.getAnalyticsBrief
);

/**
 * POST /api/analytics/chat
 *
 * Accepts a manager's natural language question and the current analytics
 * context (same AnalyticsPayload that drives the dashboard). Forwards both
 * to DeepSeek server-side and returns a validated, structured answer.
 *
 * The AI is strictly scoped to read-only operational analytics — it cannot
 * perform writes, approvals, or any action outside data interpretation.
 *
 * Roles: MANAGER, ADMIN, SUPER_ADMIN
 */
router.post(
    '/chat',
    rbacMiddleware(['MANAGER', 'ADMIN', 'SUPER_ADMIN']),
    analyticsChatRateLimit,
    AnalyticsChatController.postAnalyticsChat
);

export default router;
