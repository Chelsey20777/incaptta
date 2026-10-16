<script setup lang="ts">
/**
 * AnalyticsChatPanel — Phase 4
 *
 * Phase 4 additions over Phase 3:
 *   - Suggested analytics prompt chips (5 pre-scoped questions)
 *   - Clicking a chip populates the input and auto-submits immediately
 *   - Copy answer button (clipboard API, fail-silent)
 *   - Regenerate button in success card header
 *   - Type-specific colour coding for related records
 *   - Visual hierarchy polish: dividers, spacing, badge sizing
 *   - Empty state updated to reference suggested prompts
 *
 * Constraints: single-turn only, no history, no new dependencies.
 */
import { ref } from 'vue'
import {
  MessageSquare, Send, Bot, AlertCircle,
  RefreshCw, Sparkles, Copy, Check, RotateCcw,
} from 'lucide-vue-next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  AnalyticsChatResponse,
  AnalyticsChatSeverity,
  AnalyticsChatErrorCode,
} from '../types/analytics'
import type { UnifiedOperationalContext } from '../types/unified-context'
import { AnalyticsChatError } from '../types/analytics'
import { buildAiContext } from '../utils/buildAiContext'
import { postAnalyticsChat } from '../services/analyticsChatService'

const props = defineProps<{
  /** The analytics payload currently shown on the dashboard. Sent verbatim
   *  to the backend — the AI is strictly scoped to this data. */
  payload: UnifiedOperationalContext
}>()

// ── Suggested prompts ─────────────────────────────────────────────────────────
// All prompts are scoped to operational analytics only.
// Clicking one populates the input and auto-submits immediately.
const SUGGESTED_PROMPTS = [
  'What needs my attention today?',
  'Which approvals are delayed the most?',
  'Which expenses look unusual this month?',
  'Which departments are underperforming?',
  'What inventory risks should I review?',
] as const

// ── UI state ──────────────────────────────────────────────────────────────────
const question      = ref('')
const lastQuestion  = ref('')
const chatLoading   = ref(false)
const chatResponse  = ref<AnalyticsChatResponse | null>(null)
const chatErrorCode = ref<AnalyticsChatErrorCode | null>(null)
const chatErrorMsg  = ref<string | null>(null)
const copied        = ref(false)

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitQuestion(): Promise<void> {
  const q = question.value.trim()
  // Backend enforces min(3) via Zod — match here to avoid a wasted round-trip.
  if (q.length < 3 || chatLoading.value) return

  chatLoading.value   = true
  chatErrorCode.value = null
  chatErrorMsg.value  = null
  lastQuestion.value  = q

  try {
    const slim = buildAiContext(props.payload)
    chatResponse.value = await postAnalyticsChat(q, slim)
    // Input intentionally preserved after success — manager can compare,
    // refine, or pick a new suggested prompt without retyping.
  } catch (err) {
    if (err instanceof AnalyticsChatError) {
      chatErrorCode.value = err.code
      chatErrorMsg.value  = err.message
    } else {
      chatErrorCode.value = 'UNKNOWN'
      chatErrorMsg.value  = 'An unexpected error occurred.'
    }
  } finally {
    chatLoading.value = false
  }
}

// Chip click: populate input and auto-submit.
function selectPrompt(prompt: string): void {
  if (chatLoading.value) return
  question.value = prompt
  submitQuestion()
}

// Retry: restore last submitted question if the input was cleared, then re-submit.
async function retryQuestion(): Promise<void> {
  if (!question.value.trim() && lastQuestion.value) {
    question.value = lastQuestion.value
  }
  await submitQuestion()
}

// Regenerate: re-submit the last question unchanged.
async function regenerate(): Promise<void> {
  if (!lastQuestion.value || chatLoading.value) return
  question.value = lastQuestion.value
  await submitQuestion()
}

// Copy answer to clipboard (fails silently in non-secure contexts).
async function copyAnswer(): Promise<void> {
  if (!chatResponse.value?.answer) return
  try {
    await navigator.clipboard.writeText(chatResponse.value.answer)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // navigator.clipboard unavailable — ignore
  }
}

// ── Severity styling (mirrors AiBriefPanel exactly) ───────────────────────────
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

// ── Related record type metadata ──────────────────────────────────────────────
// Each type gets a short label and a colour class so records are scannable
// without exposing raw type strings to the manager.
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

// ── Error labels ──────────────────────────────────────────────────────────────
const ERROR_LABELS: Record<AnalyticsChatErrorCode, string> = {
  UNAUTHORIZED:         'Your session has expired. Please refresh the page and sign in again.',
  FORBIDDEN:            'You do not have permission to use analytics chat.',
  RATE_LIMITED:         'Too many requests. Please wait a moment before trying again.',
  INVALID_PAYLOAD:      'The analytics data could not be sent. Please reload the page.',
  INVALID_AI_RESPONSE:  'The AI returned an unexpected response. Please try again.',
  UPSTREAM_TIMEOUT:     'The AI service took too long to respond. Please try again.',
  UPSTREAM_UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again later.',
  NETWORK_ERROR:        'Could not reach the server. Please check your connection and try again.',
  UNKNOWN:              'An unexpected error occurred. Please try again.',
}

function formatGenerated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-4">

    <!-- ── Section header ────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2">
      <MessageSquare class="size-4 text-primary" />
      <h2 class="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">
        Manager Analytics Chat
      </h2>
    </div>

    <!-- ── Input card (always visible) ───────────────────────────────────── -->
    <Card class="border bg-card/50">
      <CardContent class="pt-4 pb-3 space-y-3">

        <!-- Helper text -->
        <p class="text-xs text-muted-foreground leading-relaxed">
          Ask a question about the current analytics data. Responses cite specific
          values from the live snapshot — the AI cannot access external data or
          perform any actions.
        </p>

        <!-- ── Suggested prompts ───────────────────────────────────── -->
        <div v-if="!chatLoading" class="flex flex-wrap gap-1.5">
          <button
            v-for="prompt in SUGGESTED_PROMPTS"
            :key="prompt"
            type="button"
            class="inline-flex items-center rounded-full border border-border px-2.5 py-1
                   text-[11px] font-medium text-muted-foreground transition-colors
                   hover:bg-muted/60 hover:text-foreground hover:border-primary/50
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                   cursor-pointer select-none"
            @click="selectPrompt(prompt)"
          >
            {{ prompt }}
          </button>
        </div>

        <!-- Skeleton placeholders while loading so the card height stays stable -->
        <div v-else class="flex flex-wrap gap-1.5">
          <Skeleton
            v-for="n in 5"
            :key="n"
            class="h-6 rounded-full"
            :class="[n === 1 ? 'w-44' : n === 2 ? 'w-52' : n === 3 ? 'w-56' : n === 4 ? 'w-48' : 'w-44']"
          />
        </div>

        <!-- Textarea + ask button -->
        <div class="flex gap-2 items-end">
          <textarea
            v-model="question"
            :disabled="chatLoading"
            placeholder="Type a question about your operational data…"
            rows="2"
            maxlength="500"
            class="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm
                   placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed
                   disabled:opacity-50 min-h-[52px] leading-relaxed"
            @keydown.ctrl.enter.prevent="submitQuestion"
          />
          <Button
            class="h-[52px] px-4 shrink-0 gap-1.5"
            :disabled="chatLoading || question.trim().length < 3"
            @click="submitQuestion"
          >
            <Send class="size-3.5" :class="{ 'animate-pulse': chatLoading }" />
            <span class="hidden sm:inline">{{ chatLoading ? 'Asking…' : 'Ask' }}</span>
          </Button>
        </div>

        <p class="text-[10px] text-muted-foreground/40 text-right tabular-nums">
          <span v-if="question.trim().length > 0 && question.trim().length < 3" class="text-amber-500/70">
            min. 3 characters ·
          </span>
          {{ question.length }}/500 · Ctrl+Enter to submit
        </p>

      </CardContent>
    </Card>

    <!-- ── Loading skeleton ───────────────────────────────────────────────── -->
    <Card v-if="chatLoading" class="border bg-card/50">
      <CardContent class="pt-5 space-y-5">
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-16 mb-3" />
          <Skeleton class="h-3.5 w-full" />
          <Skeleton class="h-3.5 w-5/6" />
          <Skeleton class="h-3.5 w-4/6" />
        </div>
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-24 mb-3" />
          <div class="grid sm:grid-cols-2 gap-2">
            <Skeleton class="h-14 rounded-md" />
            <Skeleton class="h-14 rounded-md" />
            <Skeleton class="h-14 rounded-md" />
            <Skeleton class="h-14 rounded-md" />
          </div>
        </div>
        <div class="space-y-1.5">
          <Skeleton class="h-2.5 w-32 mb-3" />
          <Skeleton class="h-3.5 w-full" />
          <Skeleton class="h-3.5 w-3/4" />
        </div>
      </CardContent>
    </Card>

    <!-- ── Error state ────────────────────────────────────────────────────── -->
    <Card
      v-else-if="chatErrorCode"
      class="border border-destructive/30 bg-destructive/5"
    >
      <CardContent class="pt-5 pb-4">
        <div class="flex gap-3">
          <AlertCircle class="size-5 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 space-y-2">
            <p class="text-sm font-semibold text-destructive">Request failed</p>
            <p class="text-sm text-muted-foreground">{{ ERROR_LABELS[chatErrorCode] }}</p>
            <p
              v-if="chatErrorMsg && chatErrorMsg !== ERROR_LABELS[chatErrorCode]"
              class="text-xs text-muted-foreground/60 font-mono"
            >
              {{ chatErrorMsg }}
            </p>
            <Button
              v-if="chatErrorCode !== 'FORBIDDEN' && chatErrorCode !== 'UNAUTHORIZED'"
              size="sm"
              variant="outline"
              class="h-7 px-3 text-xs mt-1"
              @click="retryQuestion"
            >
              <RefreshCw class="size-3 mr-1.5" />
              Try Again
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- ── Empty state (before first question) ───────────────────────────── -->
    <Card
      v-else-if="!chatResponse"
      class="border border-dashed bg-card/30"
    >
      <CardContent class="pt-7 pb-7 flex flex-col items-center gap-3 text-center">
        <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot class="size-5 text-primary" />
        </div>
        <div>
          <p class="text-sm font-semibold">No question asked yet</p>
          <p class="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
            Click a suggested prompt above or type your own question.
            Responses cite specific values from the current snapshot —
            no data is fabricated.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- ── Success: structured response ──────────────────────────────────── -->
    <Card v-else class="border bg-card/50">

      <!-- ── Card header: AI label · timestamp · actions ──────────── -->
      <CardHeader class="pb-3 border-b bg-muted/10">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-1.5">
            <Sparkles class="size-3 text-primary" />
            <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              AI-generated analytics guidance
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-muted-foreground/50">
              {{ formatGenerated(chatResponse.generatedAt) }}
            </span>
            <!-- Regenerate: re-run the same question -->
            <button
              type="button"
              :disabled="chatLoading"
              :title="chatLoading ? 'Processing…' : 'Re-ask this question'"
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
                     text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50
                     transition-colors focus-visible:outline-none focus-visible:ring-1
                     focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              @click="regenerate"
            >
              <RotateCcw class="size-2.5" :class="{ 'animate-spin': chatLoading }" />
              {{ chatLoading ? 'Processing…' : 'Regenerate' }}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent class="pt-5 space-y-5">

        <!-- ── Question echo ──────────────────────────────────────── -->
        <div class="border-l-2 border-primary/40 pl-3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
            Question
          </p>
          <p class="text-sm text-muted-foreground italic leading-snug">
            "{{ lastQuestion }}"
          </p>
        </div>

        <!-- ── Answer ─────────────────────────────────────────────── -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Answer
            </p>
            <!-- Copy answer -->
            <button
              type="button"
              :title="copied ? 'Copied!' : 'Copy answer'"
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
                     text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50
                     transition-colors cursor-pointer focus-visible:outline-none
                     focus-visible:ring-1 focus-visible:ring-ring"
              @click="copyAnswer"
            >
              <component :is="copied ? Check : Copy" class="size-2.5" :class="{ 'text-emerald-500': copied }" />
              <span :class="{ 'text-emerald-500': copied }">{{ copied ? 'Copied' : 'Copy' }}</span>
            </button>
          </div>
          <p class="text-sm text-foreground leading-relaxed">{{ chatResponse.answer }}</p>
        </div>

        <!-- ── Key Metrics (highlights) ───────────────────────────── -->
        <div v-if="chatResponse.highlights.length > 0" class="space-y-2 pt-1 border-t border-border/40">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
            Key Metrics
          </p>
          <div class="grid sm:grid-cols-2 gap-2">
            <div
              v-for="(h, i) in chatResponse.highlights"
              :key="i"
              class="rounded-md border px-3 py-2"
              :class="severityRowClass(h.severity)"
            >
              <div class="flex items-start gap-2">
                <Badge
                  variant="outline"
                  class="text-[8px] px-1.5 py-0 uppercase font-bold shrink-0 mt-0.5 leading-tight"
                  :class="severityBadgeClass(h.severity)"
                >
                  {{ h.severity }}
                </Badge>
                <div class="min-w-0">
                  <p class="text-xs font-semibold leading-tight truncate">{{ h.label }}</p>
                  <p class="text-xs text-muted-foreground mt-0.5 font-mono leading-tight break-all">
                    {{ h.value }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Recommended Actions ────────────────────────────────── -->
        <div v-if="chatResponse.recommendedActions.length > 0" class="space-y-2 pt-1 border-t border-border/40">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
            Recommended Actions
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="(action, i) in chatResponse.recommendedActions"
              :key="i"
              class="flex gap-2 text-sm"
            >
              <span class="text-primary font-bold shrink-0 select-none mt-px">→</span>
              <span class="text-muted-foreground leading-snug">{{ action }}</span>
            </li>
          </ul>
        </div>

        <!-- ── Related Records ────────────────────────────────────── -->
        <div v-if="chatResponse.relatedRecords.length > 0" class="space-y-2 pt-1 border-t border-border/40">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
            Related Records
          </p>
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="(rec, i) in chatResponse.relatedRecords"
              :key="i"
              class="inline-flex items-center gap-1 rounded-md border px-2 py-1"
              :class="recordMeta(rec.type).badgeClass"
            >
              <span class="text-[9px] font-bold uppercase tracking-wide opacity-70 shrink-0">
                {{ recordMeta(rec.type).short }}
              </span>
              <span class="text-[10px] font-medium leading-none">{{ rec.label }}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>

  </div>
</template>
