import { Request, Response } from 'express';
import { AnalyticsBriefRequestSchema } from '../models/analytics.model';
import { generateAnalyticsBrief, AnalyticsServiceError } from '../services/geminiAnalytics.service';

export const getAnalyticsBrief = async (req: Request, res: Response): Promise<void> => {
    const uid = (req as any).user?.uid as string | undefined;

    // ── Validate and sanitize inbound payload ─────────────────────────────────
    // safeParse strips unknown keys (Zod default) — no client-supplied fields
    // outside the schema reach the AI or service layer.
    const parsed = AnalyticsBriefRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        console.warn(`[Analytics] Payload validation failed for uid=${uid}:`,
            parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        );
        res.status(400).json({
            error: 'INVALID_PAYLOAD',
            message: 'Analytics payload does not match the expected schema.',
            details: parsed.error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        });
        return;
    }

    console.info(`[Analytics] Brief requested by uid=${uid}, period=${parsed.data.periodDays}d, generatedAt=${parsed.data.generatedAt}`);

    // ── Generate AI brief ─────────────────────────────────────────────────────
    try {
        const brief = await generateAnalyticsBrief(parsed.data);
        console.info(`[Analytics] Brief delivered to uid=${uid}`);
        res.status(200).json(brief);
    } catch (err) {
        if (err instanceof AnalyticsServiceError) {
            switch (err.code) {
                case 'MISSING_API_KEY':
                    console.error('[Analytics] Service misconfiguration: GEMINI_API_KEY not set');
                    res.status(503).json({
                        error: 'SERVICE_UNAVAILABLE',
                        message: 'The analytics service is not available.',
                    });
                    return;

                case 'UPSTREAM_TIMEOUT':
                    res.status(504).json({
                        error: 'UPSTREAM_TIMEOUT',
                        message: 'The analytics service did not respond in time. Please try again.',
                    });
                    return;

                case 'UPSTREAM_ERROR':
                    console.error('[Analytics] Upstream failure:', err.message);
                    res.status(502).json({
                        error: 'UPSTREAM_ERROR',
                        message: err.message || 'The analytics service is temporarily unavailable.',
                    });
                    return;

                case 'INVALID_AI_RESPONSE':
                    console.error('[Analytics] Unprocessable AI response:', err.message);
                    res.status(422).json({
                        error: 'INVALID_AI_RESPONSE',
                        message: 'The analytics service returned an unprocessable response.',
                    });
                    return;
            }
        }

        console.error('[Analytics] Unexpected error in getAnalyticsBrief:', err);
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
        });
    }
};
