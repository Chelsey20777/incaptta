<script setup lang="ts">
/**
 * AiChatSlideOver — Global quick-access analytics chat panel
 *
 * Mounted once in AppLayout (always in DOM). Opened/closed via the
 * useAiChatPanel() singleton composable — shared with TopBar.
 *
 * Analytics data: Option B — useUnifiedOperationalContext called here with
 * periodDays = 30. Stores are hydrated lazily on the first panel open so
 * analytics data is NOT fetched on every page load for every user.
 *
 * Chat logic mirrors AnalyticsChatPanel.vue but is NOT a reuse of that
 * component — the slide-over has a different layout and includes an
 * "Open full analytics" shortcut. AnalyticsChatPanel.vue is untouched.
 *
 * Transitions: handled by the shadcn-vue Sheet (reka-ui DialogContent)
 * built-in slide-from-right animation. No custom animation library needed.
 */
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  X, Send, Bot, AlertCircle, RefreshCw,
  Sparkles, Copy, Check, RotateCcw, ExternalLink, Brain,
  Trash2,
} from 'lucide-vue-next'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import AiChatIcon from '@/components/ui/icons/AiChatIcon.vue'
import { useAiChatPanel } from '@/composables/useAiChatPanel'
import { useUnifiedOperationalContext } from '@/features/analytics/composables/useUnifiedOperationalContext'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useInventoryStore } from '@/features/inventory/store/inventoryStore'
import { useHrStore } from '@/features/hr/store/hrStore'
import { useCrmStore } from '@/features/crm/store/crmStore'
import { useLeadsStore } from '@/features/crm/store/useLeadsStore'
import { postAnalyticsChat } from '@/features/analytics/services/analyticsChatService'
import type {
  AnalyticsChatResponse,
  AnalyticsChatSeverity,
  AnalyticsChatErrorCode,
  ConversationTurn,
} from '@/features/analytics/types/analytics'
import { AnalyticsChatError } from '@/features/analytics/types/analytics'
import { useAiChatInput } from '@/features/analytics/composables/useAiChatInput'

// ── Panel state ───────────────────────────────────────────────────────────────
const { isOpen, close } = useAiChatPanel()
const router = useRouter()

// ── Analytics context (Option B) ──────────────────────────────────────────────
// Fixed 30-day window for the quick-access panel. The full dashboard allows
// period selection; the slide-over uses a sensible default.
const periodDays = ref(30)
const { context } = useUnifiedOperationalContext(periodDays)

// ── Lazy store hydration ──────────────────────────────────────────────────────
const jobCardsStore  = useJobCardsStore()
const financeStore   = useFinanceStore()
const inventoryStore = useInventoryStore()
const hrStore        = useHrStore()
const crmStore       = useCrmStore()
const leadsStore     = useLeadsStore()

const hasFetched = ref(false)

watch(isOpen, (val) => {
  if (!val || hasFetched.value) return
  hasFetched.value = true
  jobCardsStore.fetchJobCards()
  financeStore.fetchExpenses()
  financeStore.fetchTransfers()
  financeStore.fetchJobPayments()
  financeStore.fetchTopUps()
  inventoryStore.fetchItems()
  hrStore.fetchAll()
  crmStore.fetchCustomers()
  crmStore.fetchQuotes()
  crmStore.fetchInvoices()
  leadsStore.fetchLeads()
})

// ── Shared Input Watcher (Phase 4) ───────────────────────────────────────────
const { globalPendingQuestion, consumePendingQuestion } = useAiChatInput()

watch(globalPendingQuestion, (newQ) => {
  if (newQ) {
    const q = consumePendingQuestion()
    if (!q) return
    
    // Ensure the sheet is open
    if (!isOpen.value) {
      isOpen.value = true
    }
    
    // Slight delay to allow Sheet to mount/initialize if it was closed
    setTimeout(() => {
      submitQuestion(q)
    }, 300)
  }
})

// ── Chat state ────────────────────────────────────────────────────────────────
const question      = ref('')
const isLoading     = ref(false)
const chatErrorCode = ref<AnalyticsChatErrorCode | null>(null)
const chatErrorMsg  = ref<string | null>(null)
const copied        = ref(false)

// Session history: Unified view for rendering
interface ThreadTurn {
  id: string
  role: 'user' | 'assistant'
  content?: string // user question
  response?: AnalyticsChatResponse // assistant answer
  timestamp: string
}

const thread = ref<ThreadTurn[]>([])
const bodyRef = ref<HTMLElement | null>(null)

function scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
  nextTick(() => {
    if (bodyRef.value) {
      bodyRef.value.scrollTo({
        top: bodyRef.value.scrollHeight,
        behavior,
      })
    }
  })
}

// ── Client-side mode detection (mirrors analyticsModelRouter.ts) ──────────────
const REASONING_KEYWORDS = [
  'why', 'explain', 'reason', 'cause', 'compare', 'trend',
  'analyse', 'analyze', 'what should', 'recommend', 'suggest',
  'improve', 'risk', 'impact', 'affect', 'what is causing', 'how did', 'what led',
]

function detectQueryMode(q: string): 'chat' | 'reason' {
  const lower = q.toLowerCase()
  return REASONING_KEYWORDS.some(k => lower.includes(k)) ? 'reason' : 'chat'
}

// ── Elapsed counter ───────────────────────────────────────────────────────────
const pendingMode    = ref<'chat' | 'reason'>('reason')
const elapsedSeconds = ref(0)
let   elapsedTimer: ReturnType<typeof setInterval> | null = null

function startElapsedTimer(): void {
  elapsedSeconds.value = 0
  elapsedTimer = setInterval(() => { elapsedSeconds.value++ }, 1000)
}

function stopElapsedTimer(): void {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

onUnmounted(() => stopElapsedTimer())

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  'What needs my attention today?',
  'Which approvals are delayed the most?',
  'Which expenses look unusual this month?',
  'Which departments are underperforming?',
  'What inventory risks should I review?',
] as const

// ── Actions ───────────────────────────────────────────────────────────────────
async function submitQuestion(overrideQuestion?: string): Promise<void> {
  const q = (overrideQuestion ?? question.value).trim()
  if (q.length < 3 || isLoading.value) return

  // Add user message to thread immediately
  const userTurn: ThreadTurn = {
    id: crypto.randomUUID(),
    role: 'user',
    content: q,
    timestamp: new Date().toISOString(),
  }
  thread.value.push(userTurn)
  scrollToBottom()

  pendingMode.value    = detectQueryMode(q)
  isLoading.value      = true
  chatErrorCode.value  = null
  chatErrorMsg.value   = null
  question.value       = '' // Clear input
  startElapsedTimer()

  // Build backend-compatible history (last 6 turns)
  const history: ConversationTurn[] = thread.value
    .filter(t => t.role === 'user' || (t.role === 'assistant' && t.response))
    .slice(-7, -1) // Exclude current user turn, take up to 6 previous
    .map(t => ({
      role: t.role,
      content: t.role === 'user' ? (t.content ?? '') : (t.response?.answer ?? ''),
      mode: t.role === 'assistant' ? (t.response?.mode ?? 'chat') : detectQueryMode(t.content ?? ''),
      timestamp: t.timestamp,
    }))

  try {
    const response = await postAnalyticsChat(q, context.value, history)
    
    // Add assistant response to thread
    thread.value.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      response,
      timestamp: response.generatedAt,
    })
    scrollToBottom()
  } catch (err) {
    if (err instanceof AnalyticsChatError) {
      chatErrorCode.value = err.code
      chatErrorMsg.value  = err.message
    } else {
      chatErrorCode.value = 'UNKNOWN'
      chatErrorMsg.value  = 'An unexpected error occurred.'
    }
    // Note: User question stays in thread so they can see what failed.
    // They can retry which adds a NEW turn.
  } finally {
    stopElapsedTimer()
    isLoading.value = false
  }
}

function selectPrompt(prompt: string): void {
  if (isLoading.value) return
  submitQuestion(prompt)
}

async function retryLast(): Promise<void> {
  const lastUserTurn = [...thread.value].reverse().find(t => t.role === 'user')
  if (lastUserTurn?.content) {
    submitQuestion(lastUserTurn.content)
  }
}

function clearChat(): void {
  if (isLoading.value) return
  thread.value = []
  chatErrorCode.value = null
  chatErrorMsg.value = null
}

async function copyAnswer(answer: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(answer)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* fail silent */ }
}

function openFullAnalytics(): void {
  close()
  router.push('/analytics')
}

// ── Severity / record helpers ─────────────────────────────────────────────────
function severityBadgeClass(level: AnalyticsChatSeverity): string {
  return {
    high:   'text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-500/10',
    medium: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/10',
    low:    'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-500/10',
  }[level]
}

function severityRowClass(level: AnalyticsChatSeverity): string {
  return {
    high:   'border-red-200 dark:border-red-900/40 bg-red-500/5',
    medium: 'border-amber-200 dark:border-amber-900/40 bg-amber-500/5',
    low:    'border-border bg-muted/20',
  }[level]
}

const RECORD_TYPE_META: Record<string, { short: string; badgeClass: string }> = {
  job_card:   { short: 'JC',   badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  department: { short: 'Dept', badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800' },
  expense:    { short: 'Exp',  badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  account:    { short: 'Acct', badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  transfer:   { short: 'Txfr', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
}

function recordMeta(type: string) {
  return RECORD_TYPE_META[type] ?? { short: type, badgeClass: 'bg-muted text-muted-foreground border-border' }
}

const ERROR_LABELS: Record<AnalyticsChatErrorCode, string> = {
  UNAUTHORIZED:         'Your session has expired. Please refresh the page.',
  FORBIDDEN:            'You do not have permission to use analytics chat.',
  RATE_LIMITED:         'Too many requests. Please wait a moment.',
  INVALID_PAYLOAD:      'Analytics data could not be sent. Please reload.',
  INVALID_AI_RESPONSE:  'The AI returned an unexpected response. Try again.',
  UPSTREAM_TIMEOUT:     'Analysis timed out. The reasoning model may be under load — please try again.',
  UPSTREAM_UNAVAILABLE: 'The AI service is temporarily unavailable.',
  NETWORK_ERROR:        'Could not reach the server. Check your connection.',
  UNKNOWN:              'An unexpected error occurred. Please try again.',
}

function formatGenerated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent
      side="right"
      class="w-full sm:max-w-[480px] p-0 h-full flex flex-col overflow-hidden [&>button]:hidden"
      style="border-left: 1px solid rgba(255,137,3,0.2)"
    >
      <!-- ── Header ─────────────────────────────────────────────────────────── -->
      <div
        class="flex-none border-b border-border/50 px-4 py-3 space-y-2"
        style="background: linear-gradient(135deg, rgba(255,107,0,0.08) 0%, rgba(255,137,3,0.06) 55%, rgba(255,179,71,0.04) 100%)"
      >
        <!-- Title row -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <AiChatIcon class="w-7 h-7 shrink-0" />
            <div>
              <p class="text-sm font-bold leading-none">OPI</p>
              <p class="text-[10px] text-muted-foreground/55 mt-0.5">Powered by DeepSeek</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              v-if="thread.length > 0"
              type="button"
              @click="clearChat"
              :disabled="isLoading"
              class="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
              title="Clear conversation"
            >
              <Trash2 class="size-4" />
            </button>
            <button
              type="button"
              @click="close"
              class="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X class="size-4" />
            </button>
          </div>
        </div>

        <!-- Context indicator row -->
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span class="text-[10px] text-muted-foreground/60">Live data · Last 30 days</span>
          <button
            type="button"
            @click="openFullAnalytics"
            class="ml-auto text-[10px] text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
          >
            Full dashboard
            <ExternalLink class="size-2.5" />
          </button>
        </div>
      </div>

      <!-- ── Scrollable body ─────────────────────────────────────────────────── -->
      <div ref="bodyRef" class="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6 space-y-6">

        <!-- ── Thread ────────────────────────────────────────────────────────── -->
        <div v-for="(turn, index) in thread" :key="turn.id" class="space-y-4">
          
          <!-- User Question -->
          <div v-if="turn.role === 'user'" class="flex flex-col items-end gap-1.5 pl-8">
            <div class="bg-primary text-primary-foreground px-3.5 py-2 rounded-2xl rounded-tr-none text-sm leading-relaxed shadow-sm">
              {{ turn.content }}
            </div>
            <span class="text-[9px] text-muted-foreground/50 tabular-nums">
              {{ formatGenerated(turn.timestamp) }}
            </span>
          </div>

          <!-- Assistant Response -->
          <div v-else-if="turn.role === 'assistant' && turn.response" class="space-y-4 pr-6">
            <!-- Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 flex-wrap">
                <Sparkles class="size-3 text-primary shrink-0" />
                <span class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/55">
                  Answer
                </span>
                <Badge
                  v-if="turn.response.mode"
                  variant="outline"
                  class="text-[8px] px-1 py-0 leading-tight font-semibold inline-flex items-center gap-0.5"
                  :class="turn.response.mode === 'reason'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 bg-blue-500/10'
                    : 'text-muted-foreground/60 border-border/60 bg-muted/30'"
                >
                  <Brain v-if="turn.response.mode === 'reason'" class="size-2 shrink-0" />
                  {{ turn.response.mode === 'reason' ? 'Deep Analysis' : 'Standard' }}
                </Badge>
              </div>
              <button
                type="button"
                title="Copy answer"
                class="size-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                @click="copyAnswer(turn.response.answer)"
              >
                <Copy class="size-2.5" />
              </button>
            </div>

            <!-- Answer text -->
            <div class="rounded-2xl rounded-tl-none border border-border/40 bg-muted/20 px-4 py-3.5 text-sm leading-relaxed shadow-sm">
              {{ turn.response.answer }}
            </div>

            <!-- Key Metrics -->
            <div v-if="turn.response.highlights.length > 0" class="space-y-2 pl-2">
              <p class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/45">
                Key Metrics
              </p>
              <div class="space-y-1.5">
                <div
                  v-for="(h, i) in turn.response.highlights"
                  :key="i"
                  class="rounded-lg border px-3 py-2 transition-colors hover:bg-muted/20"
                  :class="severityRowClass(h.severity)"
                >
                  <div class="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      class="text-[8px] px-1 py-0 uppercase font-bold shrink-0 mt-0.5"
                      :class="severityBadgeClass(h.severity)"
                    >
                      {{ h.severity }}
                    </Badge>
                    <div class="min-w-0">
                      <p class="text-[11px] font-semibold leading-tight truncate">{{ h.label }}</p>
                      <p class="text-[11px] text-muted-foreground mt-0.5 font-mono leading-tight break-all">
                        {{ h.value }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recommended Actions -->
            <div v-if="turn.response.recommendedActions.length > 0" class="space-y-2 pl-2">
              <p class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/45">
                Next Steps
              </p>
              <ul class="space-y-1.5">
                <li
                  v-for="(action, i) in turn.response.recommendedActions"
                  :key="i"
                  class="flex gap-2 text-[11px]"
                >
                  <span class="text-primary font-bold shrink-0 mt-px select-none">→</span>
                  <span class="text-muted-foreground leading-snug">{{ action }}</span>
                </li>
              </ul>
            </div>

            <!-- Related Records -->
            <div v-if="turn.response.relatedRecords.length > 0" class="space-y-2 pl-2">
              <div class="flex flex-wrap gap-1.5">
                <div
                  v-for="(rec, i) in turn.response.relatedRecords"
                  :key="i"
                  class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5"
                  :class="recordMeta(rec.type).badgeClass"
                >
                  <span class="text-[8px] font-bold uppercase tracking-wide opacity-70 shrink-0">
                    {{ recordMeta(rec.type).short }}
                  </span>
                  <span class="text-[9px] font-medium leading-none">{{ rec.label }}</span>
                </div>
              </div>
            </div>

            <!-- Suggested Follow-ups (Interactive Chips) -->
            <div v-if="turn.response.suggestedFollowUps?.length && index === thread.length - 1" class="space-y-2 pt-2 border-t border-border/20">
              <p class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/35">
                Follow up
              </p>
              <div class="flex flex-col gap-1.5">
                <button
                  v-for="followUp in turn.response.suggestedFollowUps"
                  :key="followUp"
                  type="button"
                  class="text-left text-[11px] px-3 py-2 rounded-lg border border-border/60
                         text-muted-foreground/80 hover:bg-primary/5 hover:text-primary
                         hover:border-primary/30 transition-all cursor-pointer shadow-sm
                         focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  @click="selectPrompt(followUp)"
                >
                  {{ followUp }}
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Empty state (before first question) -->
        <div
          v-if="thread.length === 0 && !isLoading && !chatErrorCode"
          class="flex flex-col items-center gap-4 text-center py-10"
        >
          <div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot class="size-6 text-primary" />
          </div>
          <div class="space-y-1.5">
            <p class="text-sm font-semibold">Operational Intelligence</p>
            <p class="text-xs text-muted-foreground mt-1 max-w-[240px] leading-relaxed">
              Ask your first question to begin the analysis. Responses citation live
              operational data across all domains.
            </p>
          </div>

          <div class="w-full pt-4 space-y-2">
            <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45 text-left pl-1">
              Popular starting points
            </p>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="prompt in SUGGESTED_PROMPTS"
                :key="prompt"
                type="button"
                class="text-left text-xs px-3 py-2.5 rounded-lg border border-border/50
                       text-muted-foreground hover:bg-muted/40 hover:text-foreground
                       hover:border-primary/25 transition-all cursor-pointer shadow-sm"
                @click="selectPrompt(prompt)"
              >
                {{ prompt }}
              </button>
            </div>
          </div>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading" class="space-y-4 pt-2">
          <div class="flex items-center gap-2 py-1">
            <span class="size-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span class="text-xs text-muted-foreground/70">
              {{ pendingMode === 'reason' ? 'Reasoning through the data…' : 'Fetching analysis…' }}
            </span>
            <span
              v-if="pendingMode === 'reason'"
              class="ml-auto text-xs text-muted-foreground/40 tabular-nums"
            >{{ elapsedSeconds }}s…</span>
          </div>
          <div class="space-y-3 pr-8">
            <Skeleton class="h-4 w-full rounded-2xl rounded-tl-none border-border/10 shadow-sm" />
            <Skeleton class="h-4 w-5/6 rounded-2xl rounded-tl-none border-border/10 shadow-sm" />
          </div>
        </div>

        <!-- Error state -->
        <div
          v-if="chatErrorCode"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mx-2"
        >
          <div class="flex gap-2.5">
            <AlertCircle class="size-4 text-destructive shrink-0 mt-0.5" />
            <div class="flex-1 space-y-2">
              <p class="text-xs font-semibold text-destructive uppercase tracking-wide">Analysis failed</p>
              <p class="text-[11px] text-muted-foreground leading-snug">
                {{ ERROR_LABELS[chatErrorCode] }}
              </p>
              <Button
                v-if="chatErrorCode !== 'FORBIDDEN' && chatErrorCode !== 'UNAUTHORIZED'"
                size="sm" variant="ghost"
                class="h-7 px-0 text-[11px] text-primary hover:bg-transparent"
                @click="retryLast()"
              >
                <RefreshCw class="size-3 mr-1.5" />
                Retry Question
              </Button>
            </div>
          </div>
        </div>

      </div>

      <div class="flex-none border-t border-border/50 px-4 py-3 space-y-1.5 bg-background/95">
        <div class="flex gap-2 items-end">
          <textarea
            v-model="question"
            :disabled="isLoading"
            placeholder="Ask about your operational data…"
            rows="2"
            maxlength="500"
            class="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2
                   text-sm placeholder:text-muted-foreground/35 focus-visible:outline-none
                   focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50
                   min-h-[48px] leading-relaxed"
            @keydown.ctrl.enter.prevent="submitQuestion()"
          />
          <Button
            class="h-[48px] px-4 shrink-0 gap-1.5"
            :disabled="isLoading || question.trim().length < 3"
            @click="submitQuestion()"
          >
            <Send class="size-3.5" :class="{ 'animate-pulse': isLoading }" />
            <span>{{ isLoading ? '…' : 'Ask' }}</span>
          </Button>
        </div>
        <p class="text-[10px] text-muted-foreground/30 text-right tabular-nums">
          {{ question.length }}/500 · Ctrl+Enter
        </p>
      </div>

    </SheetContent>
  </Sheet>
</template>
