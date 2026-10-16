/**
 * analyticsModelRouter — hybrid DeepSeek model selector
 *
 * Classifies a manager's question and returns the appropriate
 * DeepSeek model string and a mode identifier the caller can use
 * for temperature / token tuning.
 *
 * Priority rules:
 *   1. If ANY reasoning trigger appears in the question → reasoner
 *   2. Else if question is under CHAT_MAX_CHARS AND contains a chat trigger → chat
 *   3. Default (no trigger match, or long question) → reasoner
 *
 * Reasoning triggers always win over chat triggers when both match.
 * Model strings are resolved from environment variables so they can
 * be overridden without a code change.
 */

// ── Tunable constants ─────────────────────────────────────────────────────────

export const CHAT_MAX_CHARS = 60

export const CHAT_TRIGGERS = [
    'how many',
    'what is the total',
    'show me',
    'list',
    'count',
    'what is the current',
    'what is the balance',
    'how much',
    'what is the', // catch-all for "what is the X"
]

export const REASONING_TRIGGERS = [
    'why',
    'explain',
    'reason',
    'cause',
    'compare',
    'trend',
    'analyse',
    'analyze',
    'what should',
    'recommend',
    'suggest',
    'improve',
    'risk',
    'impact',
    'affect',
    'what is causing',
    'how did',
    'what led',
]

// ── Routing function ──────────────────────────────────────────────────────────

export function selectAnalyticsModel(question: string): {
    model: string
    mode: 'chat' | 'reason'
} {
    const chatModel   = process.env.DEEPSEEK_MODEL_CHAT   ?? 'deepseek-chat'
    const reasonModel = process.env.DEEPSEEK_MODEL_REASON ?? 'deepseek-reasoner'

    const lower = question.toLowerCase()

    // Reasoning triggers win unconditionally
    const hasReasoning = REASONING_TRIGGERS.some(trigger => lower.includes(trigger))
    if (hasReasoning) {
        return { model: reasonModel, mode: 'reason' }
    }

    // Chat: short question that contains a recognised chat trigger
    const hasChat =
        question.length <= CHAT_MAX_CHARS &&
        CHAT_TRIGGERS.some(trigger => lower.includes(trigger))
    if (hasChat) {
        return { model: chatModel, mode: 'chat' }
    }

    // Default — use reasoner for anything ambiguous or long
    return { model: reasonModel, mode: 'reason' }
}
