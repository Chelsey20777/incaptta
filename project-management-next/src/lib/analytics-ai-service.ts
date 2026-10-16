/**
 * analyticsAiService
 *
 * Frontend service for the POST /api/analytics/brief backend route.
 *
 * Responsibilities:
 *   - Obtain the current Firebase ID token (never cached manually — Firebase
 *     handles token refresh internally via getIdToken()).
 *   - POST the locally-computed AnalyticsPayload to the backend.
 *   - Map HTTP/network errors to typed AiBriefError instances.
 *   - Return a typed AiBriefResponse on success.
 *
 * The Vite dev proxy (vite.config.ts: /api → http://localhost:3000) means
 * calls to `/api/analytics/brief` reach the local Express server during
 * development without any additional configuration.
 * In production, Firebase Hosting rewrites `/api/**` to the Cloud Function.
 */

import { auth } from '@/lib/firebase'
import type { AiBriefResponse } from '@/lib/types-analytics'
import type { UnifiedOperationalContext } from '@/lib/types-unified-context'

// ── Error types ───────────────────────────────────────────────────────────────

export type AiBriefErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'INVALID_AI_RESPONSE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export class AiBriefError extends Error {
  readonly code: AiBriefErrorCode
  constructor(code: AiBriefErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AiBriefError'
  }
}

// ── HTTP status → error code mapping ─────────────────────────────────────────

function mapStatusToCode(status: number, backendCode?: string): AiBriefErrorCode {
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
 * Sends the computed analytics payload to the backend AI route and returns
 * the validated AI brief.
 *
 * Throws `AiBriefError` for all failure cases — callers should catch and
 * inspect `.code` to render the appropriate error UI.
 */
export async function requestAnalyticsBrief(
  payload: UnifiedOperationalContext
): Promise<AiBriefResponse> {
  // ── Auth token ───────────────────────────────────────────────────────────
  const currentUser = auth.currentUser
  if (!currentUser) {
    throw new AiBriefError('UNAUTHORIZED', 'Not authenticated. Please sign in again.')
  }

  let token: string
  try {
    // getIdToken() returns the cached token if still valid, or refreshes it.
    token = await currentUser.getIdToken()
  } catch {
    throw new AiBriefError('UNAUTHORIZED', 'Failed to obtain an auth token. Please refresh the page.')
  }

  // ── Network request ──────────────────────────────────────────────────────
  let response: Response
  try {
    response = await fetch('/api/analytics/brief', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // fetch() throws only on network-level failures (offline, DNS, CORS preflight fail)
    throw new AiBriefError(
      'NETWORK_ERROR',
      'Could not reach the analytics service. Please check your connection.'
    )
  }

  // ── Parse response body ──────────────────────────────────────────────────
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AiBriefError(
      'UNKNOWN',
      'The analytics service returned an unreadable response.'
    )
  }

  // ── Error responses ──────────────────────────────────────────────────────
  if (!response.ok) {
    const backendCode = (body as any)?.error as string | undefined
    const backendMessage = (body as any)?.message as string | undefined
    const code = mapStatusToCode(response.status, backendCode)

    throw new AiBriefError(
      code,
      backendMessage ?? `Request failed with HTTP ${response.status}`
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
  return body as AiBriefResponse
}
