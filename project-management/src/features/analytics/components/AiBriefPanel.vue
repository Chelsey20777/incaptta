<script setup lang="ts">
/**
 * AiBriefPanel
 *
 * Self-contained panel component that renders all states of the AI analytics
 * brief: empty (before first request), loading skeleton, error with retry,
 * and the full structured brief on success.
 *
 * The parent is responsible for calling the service and passing state down.
 * This component only emits 'refresh' — it never calls the service directly.
 */
import {
  Sparkles, RefreshCw, AlertCircle, Bot,
} from 'lucide-vue-next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AiBriefResponse, AiBriefSeverity } from '../types/analytics'
import type { AiBriefErrorCode } from '../services/analyticsAiService'

const props = defineProps<{
  brief:        AiBriefResponse | null
  loading:      boolean
  errorCode:    AiBriefErrorCode | null
  errorMessage: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

// ── Severity / priority styling ───────────────────────────────────────────────
function severityBadgeClass(level: AiBriefSeverity): string {
  return {
    high:   'text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 bg-red-500/10',
    medium: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/10',
    low:    'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-500/10',
  }[level]
}

function severityRowClass(level: AiBriefSeverity): string {
  return {
    high:   'border-red-200 dark:border-red-900/40 bg-red-500/5',
    medium: 'border-amber-200 dark:border-amber-900/40 bg-amber-500/5',
    low:    'border-border bg-muted/20',
  }[level]
}

function confidenceVariant(confidence: AiBriefSeverity): 'default' | 'secondary' | 'destructive' {
  return { high: 'default', medium: 'secondary', low: 'destructive' }[confidence] as any
}

function formatGenerated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── User-facing error messages ────────────────────────────────────────────────
const ERROR_LABELS: Record<AiBriefErrorCode, string> = {
  UNAUTHORIZED:         'Your session has expired. Please refresh the page and sign in again.',
  FORBIDDEN:            'You do not have permission to request AI analysis.',
  RATE_LIMITED:         'Too many requests. Please wait a moment before trying again.',
  INVALID_PAYLOAD:      'The analytics data could not be sent for analysis. Please reload the page.',
  INVALID_AI_RESPONSE:  'The AI returned an unexpected response. Please try again.',
  UPSTREAM_TIMEOUT:     'The AI service took too long to respond. Please try again.',
  UPSTREAM_UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again later.',
  NETWORK_ERROR:        'Could not reach the server. Please check your connection and try again.',
  UNKNOWN:              'An unexpected error occurred. Please try again.',
}
</script>

<template>
  <div class="space-y-4">

    <!-- ── Section header (always visible) ──────────────────────────── -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Sparkles class="size-4 text-primary" />
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">
          AI Manager Brief
        </h2>
      </div>
      <Button
        size="sm"
        variant="outline"
        class="h-7 px-3 gap-1.5 text-xs"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-3" :class="{ 'animate-spin': loading }" />
        {{ loading ? 'Analysing…' : 'Refresh Analysis' }}
      </Button>
    </div>

    <!-- ── Loading skeleton ──────────────────────────────────────────── -->
    <Card v-if="loading" class="border bg-card/50">
      <CardContent class="pt-5 space-y-5">
        <!-- Brief paragraph -->
        <div class="space-y-2">
          <Skeleton class="h-3.5 w-full" />
          <Skeleton class="h-3.5 w-5/6" />
          <Skeleton class="h-3.5 w-4/6" />
        </div>
        <!-- Key findings -->
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-24" />
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-5/6" />
          <Skeleton class="h-3 w-4/6" />
        </div>
        <!-- Anomalies + Recommendations grid -->
        <div class="grid md:grid-cols-2 gap-3">
          <Skeleton class="h-16 rounded-md" />
          <Skeleton class="h-16 rounded-md" />
        </div>
        <div class="grid md:grid-cols-2 gap-3">
          <Skeleton class="h-16 rounded-md" />
          <Skeleton class="h-16 rounded-md" />
        </div>
      </CardContent>
    </Card>

    <!-- ── Error state ────────────────────────────────────────────────── -->
    <Card
      v-else-if="errorCode"
      class="border border-destructive/30 bg-destructive/5"
    >
      <CardContent class="pt-5">
        <div class="flex gap-3">
          <AlertCircle class="size-5 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 space-y-2">
            <p class="text-sm font-semibold text-destructive">Analysis failed</p>
            <p class="text-sm text-muted-foreground">
              {{ ERROR_LABELS[errorCode] }}
            </p>
            <p
              v-if="errorMessage && errorMessage !== ERROR_LABELS[errorCode]"
              class="text-xs text-muted-foreground/60 font-mono"
            >
              {{ errorMessage }}
            </p>
            <Button
              v-if="errorCode !== 'FORBIDDEN' && errorCode !== 'UNAUTHORIZED'"
              size="sm"
              variant="outline"
              class="h-7 px-3 text-xs mt-1"
              @click="emit('refresh')"
            >
              <RefreshCw class="size-3 mr-1.5" />
              Try Again
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- ── Empty state (before first analysis) ───────────────────────── -->
    <Card
      v-else-if="!brief"
      class="border border-dashed bg-card/30"
    >
      <CardContent class="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
        <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot class="size-5 text-primary" />
        </div>
        <div>
          <p class="text-sm font-semibold">No analysis yet</p>
          <p class="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
            Click <span class="font-semibold">Refresh Analysis</span> to generate
            an AI-powered brief from the data shown above. Charts and KPIs load
            independently — the brief is on-demand only.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- ── Success: full brief ────────────────────────────────────────── -->
    <Card v-else class="border bg-card/50">

      <!-- Header row with provenance badge -->
      <CardHeader class="pb-3 border-b bg-muted/10">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-1.5">
            <Sparkles class="size-3 text-primary" />
            <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              AI-generated insight
            </span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] text-muted-foreground">Model confidence:</span>
            <Badge
              :variant="confidenceVariant(brief.modelConfidence)"
              class="text-[9px] px-1.5 uppercase tracking-wide"
            >
              {{ brief.modelConfidence }}
            </Badge>
            <span class="text-[10px] text-muted-foreground/50">
              · {{ formatGenerated(brief.generatedAt) }}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent class="pt-5 space-y-6">

        <!-- ── Daily brief paragraph ──────────────────────────────── -->
        <p class="text-sm text-foreground leading-relaxed">{{ brief.dailyBrief }}</p>

        <!-- ── Key findings ───────────────────────────────────────── -->
        <div class="space-y-2">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Key Findings
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="(finding, i) in brief.keyFindings"
              :key="i"
              class="flex gap-2 text-sm"
            >
              <span class="text-primary font-bold shrink-0 select-none mt-px">→</span>
              <span class="text-muted-foreground leading-snug">{{ finding }}</span>
            </li>
          </ul>
        </div>

        <!-- ── Anomalies ──────────────────────────────────────────── -->
        <div v-if="brief.anomalies.length > 0" class="space-y-2">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Anomalies Detected
          </p>
          <div class="space-y-2">
            <div
              v-for="(anomaly, i) in brief.anomalies"
              :key="i"
              class="rounded-md border px-3 py-2.5"
              :class="severityRowClass(anomaly.severity)"
            >
              <div class="flex items-start gap-2">
                <Badge
                  variant="outline"
                  class="text-[8px] px-1.5 py-0 uppercase font-bold shrink-0 mt-0.5"
                  :class="severityBadgeClass(anomaly.severity)"
                >
                  {{ anomaly.severity }}
                </Badge>
                <div>
                  <p class="text-xs font-semibold">{{ anomaly.metric }}</p>
                  <p class="text-xs opacity-75 mt-0.5 leading-snug">{{ anomaly.observation }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Recommendations ────────────────────────────────────── -->
        <div class="space-y-2">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Recommendations
          </p>
          <div class="grid md:grid-cols-2 gap-2">
            <div
              v-for="(rec, i) in brief.recommendations"
              :key="i"
              class="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5"
            >
              <div class="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  class="text-[8px] px-1.5 py-0 uppercase font-bold shrink-0"
                  :class="severityBadgeClass(rec.priority)"
                >
                  {{ rec.priority }}
                </Badge>
                <p class="text-xs font-semibold leading-tight">{{ rec.title }}</p>
              </div>
              <p class="text-xs text-muted-foreground leading-snug">{{ rec.rationale }}</p>
            </div>
          </div>
        </div>

        <!-- ── Chart annotations (shown only when non-empty) ─────── -->
        <div v-if="brief.chartAnnotations.length > 0" class="space-y-2">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Chart Notes
          </p>
          <div class="space-y-1.5">
            <div
              v-for="(ann, i) in brief.chartAnnotations"
              :key="i"
              class="flex gap-2 items-start text-xs rounded-md bg-muted/30 border border-border px-2.5 py-2"
            >
              <Badge variant="secondary" class="text-[8px] px-1.5 shrink-0 mt-px">
                {{ ann.label }}
              </Badge>
              <div class="leading-snug">
                <span class="font-medium">{{ ann.metric }}</span>
                <span class="text-muted-foreground"> — {{ ann.note }}</span>
              </div>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>

  </div>
</template>
