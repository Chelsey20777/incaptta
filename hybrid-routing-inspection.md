# Hybrid Routing Implementation — Inspection Record

Project: IncapttaPro Analytics AI
Feature: Hybrid DeepSeek Model Routing (chat vs reasoner)
Started: March 2026
Inspector: Claude (Sonnet 4.6)
Implementor: DeepSeek + Cline

---

## Architecture Summary

Simple factual queries → deepseek-chat (fast, cheap)
Analytical/reasoning queries → deepseek-reasoner (deep, slower)
AI Brief → always deepseek-reasoner

Routing decision is made server-side in analyticsModelRouter.ts
before the DeepSeek API call is made.

---

## Files Involved

| File | Role | Status |
|------|------|--------|
| `src/services/utils/analyticsModelRouter.ts` | Routing logic | ✅ Done |
| `src/services/analyticsChat.service.ts` | Chat service | ✅ Done |
| `src/services/analytics.service.ts` | Brief service | ✅ Done |
| `src/models/analytics.model.ts` | Zod schemas | ✅ Done |
| `src/features/analytics/types/analytics.ts` | Frontend types | ✅ Done |
| `.env.example` | Env vars | ✅ Done |
| `src/routes/analytics.routes.ts` | Rate limits | ✅ Done |

---

## Phase 1 — Backend Routing

### Chunk 1A — analyticsModelRouter.ts ✅ APPROVED

**Expected:**
- Pure TypeScript utility, no Vue/Pinia/HTTP imports
- Constants: CHAT_MAX_CHARS=60, CHAT_TRIGGERS[], REASONING_TRIGGERS[]
- Function: selectAnalyticsModel(question) → { model, mode }
- Reasoning triggers always win over chat triggers
- Default (no match) → reasoner
- Model strings from env vars with fallback

**Routing test results (all must pass):**

| Question | Expected | Actual | Pass |
|----------|----------|--------|------|
| "How many approvals are pending?" | chat | chat | ✅ |
| "What is the cash balance?" | chat | chat | ✅ |
| "Show me overdue job cards" | chat | chat | ✅ |
| "List pending approvals" | chat | chat | ✅ |
| "Why are job cards not completing?" | reason | reason | ✅ |
| "What should I prioritise today?" | reason | reason | ✅ |
| "Compare expenses this month vs last" | reason | reason | ✅ |
| "What needs my attention?" | reason | reason | ✅ |
| "Explain the approval bottleneck" | reason | reason | ✅ |
| "What is causing the expense spike?" | reason | reason | ✅ |

**Edge cases noted:**
- Added "what is the" as catch-all chat trigger
- "what is causing" still routes to reason (reasoning trigger wins)
- Empty string defaults to reasoner
- Case-insensitive matching confirmed

**Inspector verdict: ✅ APPROVED**

---

### Chunk 1B — analyticsChat.service.ts ✅ APPROVED

**Expected:**
- Import selectAnalyticsModel from analyticsModelRouter
- Call selectAnalyticsModel(question) before API call
- Dynamic model string used in DeepSeek request
- max_tokens: 4000
- temperature: mode === 'reason' ? 0.5 : 0.3
- timeout: 60000ms
- mode included in service return value
- Log: [AnalyticsChat] question="..." → model=..., mode=...

**Confirmed:**
- ✅ Import added
- ✅ Model dynamic via selectAnalyticsModel()
- ✅ Timeout 60s (DEEPSEEK_TIMEOUT_MS = 60_000)
- ✅ Temperature dynamic (reason: 0.5, chat: 0.3)
- ✅ max_tokens 4000
- ✅ mode returned via ...validated.data, mode spread
- ✅ Log line present
- ✅ Zero TypeScript errors

**Inspector verdict: ✅ APPROVED**

---

### Chunk 1C — analytics.service.ts (Brief) ✅ APPROVED

**Expected:**
- Model always: process.env.DEEPSEEK_MODEL_REASON ?? 'deepseek-reasoner'
- timeout: 60000ms
- temperature: 0.5
- max_tokens: 4000
- mode: 'reason' included in return value
- Log: [AnalyticsBrief] model=..., mode=reason

**Confirmed:**
- ✅ Model via getModel() → process.env.DEEPSEEK_MODEL_REASON ?? 'deepseek-reasoner'
- ✅ Timeout 60s (DEEPSEEK_TIMEOUT_MS = 60_000)
- ✅ Temperature 0.5
- ✅ max_tokens 4000
- ✅ mode: 'reason' as const in return spread
- ✅ Log line present ([AnalyticsBrief] model=..., mode=reason)
- ✅ Zero TypeScript errors

**Inspector verdict: ✅ APPROVED**

---

### Chunk 1D — Response Schemas ✅ APPROVED

**Expected:**
Backend (analytics.model.ts):
- AnalyticsChatResponseSchema: mode: z.enum(['chat', 'reason'])
- AiBriefResponseSchema: mode: z.literal('reason')
- Inferred types updated

Frontend (analytics.ts):
- AnalyticsChatResponse interface: mode: 'chat' | 'reason'
- AiBriefResponse interface: mode: 'reason'

**Confirmed:**
- ✅ AnalyticsChatResponseSchema: mode: z.enum(['chat', 'reason']).optional()
- ✅ AiBriefResponseSchema: mode: z.literal('reason').optional()
- ✅ Frontend AnalyticsChatResponse: mode?: 'chat' | 'reason'
- ✅ Frontend AiBriefResponse: mode?: 'reason'
- ✅ No other schemas affected
- ✅ Zero TypeScript errors

**Note on .optional():** Correct by design — mode is server-injected after AI response
validation. The AI never produces this field, so .optional() allows schema validation
to pass before the service spreads mode onto the result.

**Inspector verdict: ✅ APPROVED**

---

### Chunk 1E — Env Vars and Rate Limits ✅ APPROVED

**Expected:**
.env.example:
- DEEPSEEK_MODEL_CHAT=deepseek-chat
- DEEPSEEK_MODEL_REASON=deepseek-reasoner

analytics.routes.ts:
- Brief: 5 requests per 10 minutes
- Chat: 8 requests per 10 minutes
- Error message updated
- Firebase CLI commands documented in comments

**Confirmed:**
- ✅ DEEPSEEK_MODEL_CHAT=deepseek-chat in .env.example
- ✅ DEEPSEEK_MODEL_REASON=deepseek-reasoner in .env.example
- ✅ Brief rate limit: 5/10min (makeRateLimiter(5, 10 * 60_000, 'Analytics'))
- ✅ Chat rate limit: 8/10min (makeRateLimiter(8, 10 * 60_000, 'AnalyticsChat'))
- ✅ Error message consistent across both limiters
- ✅ Firebase CLI commands documented in route file header comments
- ✅ Zero TypeScript errors

**Inspector verdict: ✅ APPROVED**

---

## Phase 2 — UI Mode Indicators ✅ DONE (implemented by Cline)

Files: AnalyticsChatPanel.vue, AiChatSlideOver.vue, AiBriefPanel.vue

**Confirmed in all three files:**
- ✅ Mode badge: 'Standard' (gray, no icon) vs 'Deep Analysis' (blue, Brain icon)
- ✅ Loading message: dynamic ('Reasoning through the data…' vs 'Fetching analysis…')
- ✅ Elapsed seconds counter: shown only during reasoning queries
- ✅ UPSTREAM_TIMEOUT error message references reasoning model
- ✅ Client-side `detectQueryMode()` mirrors analyticsModelRouter.ts triggers
- ✅ `pendingMode` ref set before API call so counter matches before response

**AiBriefPanel.vue note:** Brief always shows 'Deep Analysis' badge (hardcoded) and
elapsed counter — correct because brief always uses the reasoner model.

**Known production constraint:**
- Chat routing through Firebase Hosting → Cloud Run: Cloud Run timeout = 60s (Firebase CLI bug
  ignores `timeoutSeconds: 300` in index.ts). Reasoning queries (67–105s) will hit
  UPSTREAM_TIMEOUT. UI shows appropriate timeout error message.
- Brief calls Cloud Run directly (VITE_CLOUD_RUN_URL) using deepseek-chat (10–30s). Works.
- Simple chat queries (deepseek-chat) complete in 10–30s. Work.

---

## Phase 3 — Session Memory + Follow-ups ⏳ NOT STARTED

Files: analyticsChat.service.ts, analytics.model.ts,
       AnalyticsChatPanel.vue, AiChatSlideOver.vue,
       AiBriefPanel.vue

Expected changes:
- ConversationTurn interface
- conversationHistory in request schema (max 6 turns)
- Conversation thread UI
- suggestedFollowUps in response schema
- Recommended actions as clickable chips
- useAiChatInput composable for brief-to-chat drill-down
- Clear conversation button

---

## Phase 4 — Proactive Brief Recommendations ⏳ NOT STARTED

Files: analytics.service.ts, analytics.model.ts, AiBriefPanel.vue

Expected changes:
- suggestedActions in brief response schema
- Priority-sorted action cards in brief UI
- Staleness indicator (30 min threshold)
- Brief-to-chat navigation via useAiChatInput

---

## Known Constraints (Do Not Change)

- Legacy flat AnalyticsBriefRequestSchema stays in analytics.model.ts
- Legacy backend detection path ('operations' in req.body) stays
- Auth, RBAC, rate limiting logic unchanged
- No new npm dependencies
- AnalyticsPayload type not referenced in dashboard

---

## Deployment Checklist (Complete After All Phases)

- ✅ DEEPSEEK_MODEL_REASON set in Firebase env (.env → deployed 2026-03-25)
- ✅ DEEPSEEK_MODEL_CHAT set in Firebase env (.env → deployed 2026-03-25)
- ✅ firebase deploy --only functions — deployed 2026-03-26 (api(us-central1) updated)
- [ ] Smoke test: simple query → chat in logs ([AnalyticsChat] mode=chat)
- [ ] Smoke test: reasoning query → reasoner in logs ([AnalyticsChat] mode=reason)
- [ ] Smoke test: brief → chat in logs ([AnalyticsBrief] mode=chat) [brief uses deepseek-chat due to Cloud Run 60s timeout]
- [ ] Smoke test: API response body contains mode field (network tab / Postman)
- [ ] Smoke test: follow-up references previous answer  ← Phase 3
- [ ] Smoke test: brief "Investigate →" opens chat      ← Phase 4
- [ ] Smoke test: slide-over chat works with session memory  ← Phase 3
- [ ] PDF export unaffected
- [ ] Legacy flat payload still returns 200

---

## Issues Log

| Chunk | Issue | Resolution | Status |
|-------|-------|------------|--------|
| 1A | "what is the cash balance" needed catch-all trigger | Added "what is the" to CHAT_TRIGGERS | ✅ Resolved |
