import React from 'react'
import { Sparkles, RefreshCw, AlertCircle, Bot } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AiBriefResponse, AiBriefSeverity } from '@/lib/types-analytics'
import type { AiBriefErrorCode } from '@/lib/analytics-ai-service'

interface AiBriefPanelProps {
  brief: AiBriefResponse | null
  loading: boolean
  errorCode: AiBriefErrorCode | null
  errorMessage: string | null
  onRefresh: () => void
}

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

export default function AiBriefPanel({ brief, loading, errorCode, errorMessage, onRefresh }: AiBriefPanelProps) {
  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">
            AI Manager Brief
          </h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 gap-1.5 text-xs"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analysing…' : 'Refresh Analysis'}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <Card className="border bg-card/50">
          <CardContent className="pt-5 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-4/6" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {!loading && errorCode && (
        <Card className="border border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5">
            <div className="flex gap-3">
              <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-destructive">Analysis failed</p>
                <p className="text-sm text-muted-foreground">
                  {ERROR_LABELS[errorCode] || ERROR_LABELS.UNKNOWN}
                </p>
                {errorMessage && errorMessage !== ERROR_LABELS[errorCode] && (
                  <p className="text-xs text-muted-foreground/60 font-mono">
                    {errorMessage}
                  </p>
                )}
                {errorCode !== 'FORBIDDEN' && errorCode !== 'UNAUTHORIZED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs mt-1"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="size-3 mr-1.5" />
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !errorCode && !brief && (
        <Card className="border border-dashed bg-card/30">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">No analysis yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                Click <span className="font-semibold">Refresh Analysis</span> to generate
                an AI-powered brief from the data shown above. Charts and KPIs load
                independently — the brief is on-demand only.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {!loading && !errorCode && brief && (
        <Card className="border bg-card/50">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  AI-generated insight
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Model confidence:</span>
                <Badge
                  variant={confidenceVariant(brief.modelConfidence)}
                  className="text-[9px] px-1.5 uppercase tracking-wide"
                >
                  {brief.modelConfidence}
                </Badge>
                <span className="text-[10px] text-muted-foreground/50">
                  · {formatGenerated(brief.generatedAt)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            {/* Daily brief paragraph */}
            <p className="text-sm text-foreground leading-relaxed">{brief.dailyBrief}</p>

            {/* Key findings */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Key Findings
              </p>
              <ul className="space-y-1.5">
                {brief.keyFindings.map((finding, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-primary font-bold shrink-0 select-none mt-px">→</span>
                    <span className="text-muted-foreground leading-snug">{finding}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Anomalies */}
            {brief.anomalies.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Anomalies Detected
                </p>
                <div className="space-y-2">
                  {brief.anomalies.map((anomaly, i) => (
                    <div
                      key={i}
                      className={`rounded-md border px-3 py-2.5 ${severityRowClass(anomaly.severity)}`}
                    >
                      <div className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[8px] px-1.5 py-0 uppercase font-bold shrink-0 mt-0.5 ${severityBadgeClass(anomaly.severity)}`}
                        >
                          {anomaly.severity}
                        </Badge>
                        <div>
                          <p className="text-xs font-semibold">{anomaly.metric}</p>
                          <p className="text-xs opacity-75 mt-0.5 leading-snug">{anomaly.observation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Recommendations
              </p>
              <div className="grid md:grid-cols-2 gap-2">
                {brief.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[8px] px-1.5 py-0 uppercase font-bold shrink-0 ${severityBadgeClass(rec.priority)}`}
                      >
                        {rec.priority}
                      </Badge>
                      <p className="text-xs font-semibold leading-tight">{rec.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{rec.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart annotations */}
            {brief.chartAnnotations.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Chart Notes
                </p>
                <div className="space-y-1.5">
                  {brief.chartAnnotations.map((ann, i) => (
                    <div
                      key={i}
                      className="flex gap-2 items-start text-xs rounded-md bg-muted/30 border border-border px-2.5 py-2"
                    >
                      <Badge variant="secondary" className="text-[8px] px-1.5 shrink-0 mt-px">
                        {ann.label}
                      </Badge>
                      <div className="leading-snug">
                        <span className="font-medium">{ann.metric}</span>
                        <span className="text-muted-foreground"> — {ann.note}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
