import { Request, Response } from 'express';
import { AnalyticsChatRequestSchema } from '../models/analytics.model';
import { answerAnalyticsQuestion, AnalyticsServiceError } from '../services/geminiAnalytics.service';

/**
 * POST /api/analytics/chat
 *
 * Validates the inbound chat request, calls the chat service, and returns
 * a structured AI answer. All error codes are mapped to typed HTTP responses.
 *
 * The controller never touches the AI directly — all Gemini interaction
 * lives in geminiAnalytics.service.ts.
 */
export const postAnalyticsChat = async (req: Request, res: Response): Promise<void> => {
    const uid = (req as any).user?.uid as string | undefined;

    // ── Validate and sanitize inbound payload ─────────────────────────────────
    // safeParse strips unknown keys (Zod default).
    const parsed = AnalyticsChatRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        console.warn(
            `[AnalyticsChat] Payload validation failed for uid=${uid}:`,
            parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        );
        res.status(400).json({
            error: 'INVALID_PAYLOAD',
            message: 'Chat request does not match the expected schema.',
            details: parsed.error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        });
        return;
    }

    const questionPreview = parsed.data.question.length > 100
        ? parsed.data.question.substring(0, 100) + '…'
        : parsed.data.question;
    console.info(`[AnalyticsChat] Question from uid=${uid}: "${questionPreview}"`);

    // ── Call service ──────────────────────────────────────────────────────────
    try {
        const answer = await answerAnalyticsQuestion(parsed.data);
        console.info(`[AnalyticsChat] Answer delivered to uid=${uid}`);
        res.status(200).json(answer);
    } catch (err) {
        if (err instanceof AnalyticsServiceError) {
            switch (err.code) {
                case 'MISSING_API_KEY':
                    console.error('[AnalyticsChat] Service misconfiguration: GEMINI_API_KEY not set');
                    res.status(503).json({
                        error: 'SERVICE_UNAVAILABLE',
                        message: 'The analytics chat service is not available.',
                    });
                    return;

                case 'UPSTREAM_TIMEOUT':
                    console.warn(`[AnalyticsChat] Gemini timed out for uid=${uid}`);
                    res.status(504).json({
                        error: 'UPSTREAM_TIMEOUT',
                        message: 'The analytics service did not respond in time. Please try again.',
                    });
                    return;

                case 'UPSTREAM_ERROR':
                    console.error('[AnalyticsChat] Upstream failure:', err.message);
                    res.status(502).json({
                        error: 'UPSTREAM_ERROR',
                        message: 'The analytics service is temporarily unavailable.',
                    });
                    return;

                case 'INVALID_AI_RESPONSE':
                    console.error('[AnalyticsChat] Unprocessable AI response:', err.message);
                    res.status(422).json({
                        error: 'INVALID_AI_RESPONSE',
                        message: 'The analytics service returned an unprocessable response.',
                    });
                    return;
            }
        }

        console.error('[AnalyticsChat] Unexpected error in postAnalyticsChat:', err);
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
        });
    }
};
