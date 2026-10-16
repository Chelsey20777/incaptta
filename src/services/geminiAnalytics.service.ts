import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import {
    AnalyticsBriefRequest,
    AiBriefResponse,
    AiBriefResponseSchema,
    AnalyticsChatRequest,
    AnalyticsChatResponse,
    AnalyticsChatResponseSchema,
} from '../models/analytics.model';

// ── Configuration ─────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1, // Even lower for maximum consistency
    }
});

// ── Response Schemas (JSON Schema format) ─────────────────────────────────────

const BRIEF_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        dailyBrief: { type: "string", description: "10-1500 chars summary" },
        keyFindings: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 },
        anomalies: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    metric: { type: "string" },
                    observation: { type: "string" },
                    severity: { enum: ["low", "medium", "high"] }
                },
                required: ["metric", "observation", "severity"]
            }
        },
        recommendations: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    rationale: { type: "string" },
                    priority: { enum: ["low", "medium", "high"] }
                },
                required: ["title", "rationale", "priority"]
            }
        },
        chartAnnotations: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    metric: { type: "string" },
                    note: { type: "string" }
                },
                required: ["label", "metric", "note"]
            }
        },
        modelConfidence: { enum: ["low", "medium", "high"] },
        generatedAt: { type: "string" }
    },
    required: ["dailyBrief", "keyFindings", "anomalies", "recommendations", "chartAnnotations", "modelConfidence", "generatedAt"]
};

const CHAT_RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        answer: { type: "string", description: "Direct answer citing data" },
        highlights: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                    severity: { enum: ["low", "medium", "high"] }
                },
                required: ["label", "value", "severity"]
            }
        },
        recommendedActions: { type: "array", items: { type: "string" }, maxItems: 5 },
        relatedRecords: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    type: { enum: ["job_card", "department", "expense", "account", "transfer"] },
                    id: { type: "string" },
                    label: { type: "string" }
                },
                required: ["type", "id", "label"]
            }
        },
        suggestedFollowUps: { type: "array", items: { type: "string" }, maxItems: 5 },
        mode: { enum: ["chat", "reason"] },
        generatedAt: { type: "string" }
    },
    required: ["answer", "highlights", "recommendedActions", "relatedRecords", "mode", "generatedAt"]
};


// ── Custom error class ────────────────────────────────────────────────────────

export type AnalyticsErrorCode =
    | 'MISSING_API_KEY'
    | 'UPSTREAM_TIMEOUT'
    | 'UPSTREAM_ERROR'
    | 'INVALID_AI_RESPONSE';

export class AnalyticsServiceError extends Error {
    constructor(
        public readonly code: AnalyticsErrorCode,
        message: string
    ) {
        super(message);
        this.name = 'AnalyticsServiceError';
    }
}

// ── System Prompts ─────────────────────────────────────────────────────────────

function buildBriefSystemPrompt(): string {
    return `You are a business analytics assistant for a field service management company.
You will receive a structured JSON payload containing real, computed business metrics.

STRICT RULES:
1. You MUST NOT invent, estimate, guess, or extrapolate any numbers not explicitly present in the input data.
2. Only reference values that appear verbatim in the provided analytics payload.
3. Do not offer advice that cannot be directly supported by the data supplied to you.
4. If the data is insufficient to make a specific finding, say so rather than fabricating one.
5. Do not reference industry benchmarks, external data, or general business knowledge as facts about this company.

OUTPUT FORMAT:
Respond ONLY with a single valid JSON object matching this schema:
${JSON.stringify(BRIEF_RESPONSE_SCHEMA, null, 2)}`.trim();
}

function buildChatSystemPrompt(isReasoning: boolean): string {
    const reasoningInstruction = isReasoning 
        ? "Perform a deep, step-by-step analysis of the historical trends and correlations. Be more investigative."
        : "Provide a direct, punchy answer focused on the specific data points requested.";

    return `\
You are a read-only operational analytics assistant for a field service management company.

You will receive a JSON object with two fields:
- "question": a natural language question from a manager
- "analyticsContext": a structured, pre-computed snapshot of real business metrics

YOUR ROLE:
- Answer the manager's specific question using ONLY the data present in analyticsContext.
- ${reasoningInstruction}
- Surface the most relevant metrics and records that directly address the question.
- Be concise, precise, and cite specific values from the data.

ABSOLUTE RESTRICTIONS — you MUST NOT:
- Perform, suggest, or imply any database write, edit, deletion, or status mutation
- Approve, reject, reassign, or change the state of any job card, expense, or transfer
- Invent, estimate, guess, or extrapolate any number not explicitly present in the data
- Reference external data, industry benchmarks, or information outside the supplied context
- Answer questions that are unrelated to operational analytics
- Fabricate record IDs, job numbers, department names, or labels not present in the data

OUTPUT FORMAT:
Respond ONLY with a single valid JSON object matching this schema:
${JSON.stringify(CHAT_RESPONSE_SCHEMA, null, 2)}
Include all required fields. Set "mode" or "generatedAt" to dummy values if necessary, as the server will finalize them. Focus on the data-driven "answer" and supporting arrays.`.trim();
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Generates a structured executive brief based on the supplied analytics payload.
 */
export async function generateAnalyticsBrief(
    payload: AnalyticsBriefRequest
): Promise<AiBriefResponse> {
    if (!process.env.GEMINI_API_KEY) {
        throw new AnalyticsServiceError('MISSING_API_KEY', 'GEMINI_API_KEY is not configured');
    }

    const prompt = `
        System Instructions: ${buildBriefSystemPrompt()}
        Input Data: ${JSON.stringify(payload)}
        
        Generate the analysis brief according to the defined schema.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const aiJson = JSON.parse(text);

        // Ensure generatedAt exists before validation to satisfy required Zod field
        if (!aiJson.generatedAt) aiJson.generatedAt = new Date().toISOString();

        const validated = AiBriefResponseSchema.safeParse(aiJson);
        if (!validated.success) {
            console.error('[GeminiAnalytics] Brief schema mismatch:', validated.error.issues);
            console.error('[GeminiAnalytics] Raw AI text:', text);
            throw new AnalyticsServiceError('INVALID_AI_RESPONSE', 'AI response does not match brief schema');
        }

        return {
            ...validated.data,
            generatedAt: new Date().toISOString(),
        };
    } catch (err: any) {
        if (err instanceof AnalyticsServiceError) throw err;
        console.error('[GeminiAnalytics] Brief generation failed:', err);
        throw new AnalyticsServiceError('UPSTREAM_ERROR', `Gemini failed: ${err.message}`);
    }
}

/**
 * Answers a single manager question using context and conversation history.
 */
export async function answerAnalyticsQuestion(
    request: AnalyticsChatRequest
): Promise<AnalyticsChatResponse> {
    if (!process.env.GEMINI_API_KEY) {
        throw new AnalyticsServiceError('MISSING_API_KEY', 'GEMINI_API_KEY is not configured');
    }

    // Determine if reasoning is needed
    const isReasoning = request.history?.some(t => t.mode === 'reason') ||
        ['why', 'explain', 'analyze', 'reason', 'trend'].some(k => request.question.toLowerCase().includes(k));

    const chatSession = model.startChat({
        history: (request.history || []).slice(-6).map(turn => ({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text: turn.content }],
        })),
    });

    const userContent = JSON.stringify({
        question: request.question,
        analyticsContext: request.context,
    });

    const prompt = `
        System Instructions: ${buildChatSystemPrompt(isReasoning)}
        User Message: ${userContent}
        
        Provide your answer in the defined JSON schema.
    `;

    try {
        const result = await chatSession.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();
        const aiJson = JSON.parse(text);

        // Ensure mode and generatedAt exist before validation to satisfy required Zod fields
        if (!aiJson.mode) aiJson.mode = isReasoning ? 'reason' : 'chat';
        if (!aiJson.generatedAt) aiJson.generatedAt = new Date().toISOString();

        const validated = AnalyticsChatResponseSchema.safeParse(aiJson);
        if (!validated.success) {
            console.error('[GeminiAnalytics] Chat schema mismatch:', validated.error.issues);
            console.error('[GeminiAnalytics] Raw AI text:', text);
            throw new AnalyticsServiceError('INVALID_AI_RESPONSE', 'AI response does not match chat schema');
        }

        return {
            ...validated.data,
            mode: isReasoning ? 'reason' : 'chat',
            generatedAt: new Date().toISOString(),
        };
    } catch (err: any) {
        if (err instanceof AnalyticsServiceError) throw err;
        console.error('[GeminiAnalytics] Chat failed:', err);
        throw new AnalyticsServiceError('UPSTREAM_ERROR', `Gemini failed: ${err.message || String(err)}`);
    }
}
