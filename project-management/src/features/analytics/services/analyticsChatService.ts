/**
 * analyticsChatService
 *
 * Frontend service for the POST /api/analytics/chat backend route.
 *
 * Responsibilities:
 *   - Obtain the current Firebase ID token via getIdToken() (no manual caching —
 *     Firebase handles token refresh internally).
 *   - POST { question, context } to the backend chat endpoint.
 *   - Map HTTP/network errors to typed AnalyticsChatError instances.
 *   - Return a typed AnalyticsChatResponse on success.
 *
 * Constraints:
 *   - No AI interaction on the frontend — all DeepSeek calls are server-side.
 *   - No persistent conversation history — each call is stateless.
 *   - No new npm dependencies.
 *
 * The Vite dev proxy (vite.config.ts: /api → http://localhost:3000) routes
 * calls to `/api/analytics/chat` to the local Express server in development.
 * In production, Firebase Hosting rewrites `/api/**` to the Cloud Function.
 */

import { auth } from '@/lib/firebase'
import type { AnalyticsChatResponse, AnalyticsChatErrorCode, ConversationTurn } from '../types/analytics'
import type { UnifiedOperationalContext } from '../types/unified-context'
import { AnalyticsChatError } from '../types/analytics'

// ── HTTP status → error code mapping ─────────────────────────────────────────

function mapStatusToCode(status: number, backendCode?: string): AnalyticsChatErrorCode {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 400) return 'INVALID_PAYLOAD'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 422) return 'INVALID_AI_RESPONSE'
  if (status === 504) return 'UPSTREAM_TIMEOUT'
  if (status === 502 || status === 503) return 'UPSTREAM_UNAVAILABLE'
  // Fall back to backend-provided error code if it maps to a known value
  if (backendCode === 'UPSTREAM_TIMEOUT') return 'UPSTREAM_TIMEOUT'
  if (backendCode === 'UPSTREAM_ERROR') return 'UPSTREAM_UNAVAILABLE'
  if (backendCode === 'INVALID_AI_RESPONSE') return 'INVALID_AI_RESPONSE'
  if (backendCode === 'SERVICE_UNAVAILABLE') return 'UPSTREAM_UNAVAILABLE'
  return 'UNKNOWN'
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Posts a manager's question along with the current analytics context to
 * the backend chat route and returns the structured AI response.
 *
 * @param question  Natural language question from the manager (3–500 chars).
 * @param context   The locally-computed AnalyticsPayload that drives the dashboard.
 *                  This is the same object sent to /api/analytics/brief — the AI
 *                  is strictly limited to the data within it.
 *
 * Throws `AnalyticsChatError` for all failure cases. Callers should catch and
 * inspect `.code` to render the appropriate error UI.
 */
export async function postAnalyticsChat(
  question: string,
  context: UnifiedOperationalContext,
  history: ConversationTurn[] = []
): Promise<AnalyticsChatResponse> {
  // ── Auth token ─────────────────────────────────────────────────────────────
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new AnalyticsChatError('UNAUTHORIZED', 'Not authenticated. Please sign in again.')
  }

  let token: string
  try {
    token = await currentUser.getIdToken()
  } catch {
    throw new AnalyticsChatError(
      'UNAUTHORIZED',
      'Failed to obtain an auth token. Please refresh the page.'
    )
  }

  // ── Network request ────────────────────────────────────────────────────────
  let response: Response
  try {
    response = await fetch('/api/analytics/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ question, context, history }),
    })
  } catch {
    // fetch() throws only on network-level failures (offline, DNS, CORS preflight fail)
    throw new AnalyticsChatError(
      'NETWORK_ERROR',
      'Could not reach the analytics chat service. Please check your connection.'
    )
  }

  // ── Parse response body ────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AnalyticsChatError(
      'UNKNOWN',
      'The analytics chat service returned an unreadable response.'
    )
  }

  // ── Error responses ────────────────────────────────────────────────────────
  if (!response.ok) {
    const backendCode = (body as any)?.error as string | undefined
    const backendMessage = (body as any)?.message as string | undefined
    const code = mapStatusToCode(response.status, backendCode)

    throw new AnalyticsChatError(
      code,
      backendMessage ?? `Request failed with HTTP ${response.status}`
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  return body as AnalyticsChatResponse
}
