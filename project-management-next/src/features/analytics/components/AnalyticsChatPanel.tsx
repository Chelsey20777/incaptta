import React, { useState } from 'react'
import {
  MessageSquare, Send, Bot, AlertCircle,
  RefreshCw, Sparkles, Copy, Check, RotateCcw,
} from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  AnalyticsChatResponse,
  AnalyticsChatSeverity,
  AnalyticsChatErrorCode,
} from '@/lib/types-analytics'
import type { UnifiedOperationalContext } from '@/lib/types-unified-context'
import { AnalyticsChatError } from '@/lib/types-analytics'
import { buildAiContext } from '@/lib/build-ai-context'
import { postAnalyticsChat } from '@/lib/analytics-chat-service'

interface AnalyticsChatPanelProps {
  payload: UnifiedOperationalContext
}

const SUGGESTED_PROMPTS = [
  'What needs my attention today?',
  'Which approvals are delayed the most?',
  'Which expenses look unusual this month?',
  'Which departments are underperforming?',
  'What inventory risks should I review?',
] as const

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

export default function AnalyticsChatPanel({ payload }: AnalyticsChatPanelProps) {
  const [question, setQuestion] = useState('')
  const [lastQuestion, setLastQuestion] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatResponse, setChatResponse] = useState<AnalyticsChatResponse | null>(null)
  const [chatErrorCode, setChatErrorCode] = useState<AnalyticsChatErrorCode | null>(null)
  const [chatErrorMsg, setChatErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function performSubmit(qText: string): Promise<void> {
    const q = qText.trim()
    if (q.length < 3 || chatLoading) return

    setChatLoading(true)
    setChatErrorCode(null)
    setChatErrorMsg(null)
    setLastQuestion(q)

    try {
      const slim = buildAiContext(payload)
      const res = await postAnalyticsChat(q, slim)
      setChatResponse(res)
    } catch (err) {
      if (err instanceof AnalyticsChatError) {
        setChatErrorCode(err.code)
        setChatErrorMsg(err.message)
      } else {
        setChatErrorCode('UNKNOWN')
        setChatErrorMsg('An unexpected error occurred.')
      }
    } finally {
      setChatLoading(false)
    }
  }

  function handleSelectPrompt(prompt: string): void {
    if (chatLoading) return
    setQuestion(prompt)
    performSubmit(prompt)
  }

  async function handleRetry(): Promise<void> {
    const targetQ = question.trim() || lastQuestion
    if (!targetQ) return
    if (!question.trim()) {
      setQuestion(targetQ)
    }
    await performSubmit(targetQ)
  }

  async function handleRegenerate(): Promise<void> {
    if (!lastQuestion || chatLoading) return
    setQuestion(lastQuestion)
    await performSubmit(lastQuestion)
  }

  async function handleCopy(): Promise<void> {
    if (!chatResponse?.answer) return
    try {
      await navigator.clipboard.writeText(chatResponse.answer)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 2000)
    } catch {
      // ignore clipboard fail
    }
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <h2 className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">
          Manager Analytics Chat
        </h2>
      </div>

      {/* Input card (always visible) */}
      <Card className="border bg-card/50">
        <CardContent className="pt-4 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ask a question about the current analytics data. Responses cite specific
            values from the live snapshot — the AI cannot access external data or
            perform any actions.
          </p>

          {/* Suggested prompts */}
          {!chatLoading ? (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className="inline-flex items-center rounded-full border border-border px-2.5 py-1
                         text-[11px] font-medium text-muted-foreground transition-colors
                         hover:bg-muted/60 hover:text-foreground hover:border-primary/50
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                         cursor-pointer select-none"
                  onClick={() => handleSelectPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {[44, 52, 56, 48, 44].map((width, idx) => (
                <Skeleton
                  key={idx}
                  className="h-6 rounded-full"
                  style={{ width: `${width * 4}px` }}
                />
              ))}
            </div>
          )}

          {/* Textarea + submit button */}
          <div className="flex gap-2 items-end">
            <textarea
              value={question}
              disabled={chatLoading}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Type a question about your operational data…"
              rows={2}
              maxLength={500}
              className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm
                     placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed
                     disabled:opacity-50 min-h-[52px] leading-relaxed"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault()
                  performSubmit(question)
                }
              }}
            />
            <Button
              className="h-[52px] px-4 shrink-0 gap-1.5"
              disabled={chatLoading || question.trim().length < 3}
              onClick={() => performSubmit(question)}
            >
              <Send className={`size-3.5 ${chatLoading ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{chatLoading ? 'Asking…' : 'Ask'}</span>
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground/40 text-right tabular-nums">
            {question.trim().length > 0 && question.trim().length < 3 && (
              <span className="text-amber-500/70">
                min. 3 characters ·{' '}
              </span>
            )}
            {question.length}/500 · Ctrl+Enter to submit
          </p>
        </CardContent>
      </Card>

      {/* Loading state */}
      {chatLoading && (
        <Card className="border bg-card/50">
          <CardContent className="pt-5 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-16 mb-3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-4/6" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-24 mb-3" />
              <div className="grid sm:grid-cols-2 gap-2">
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
                <Skeleton className="h-14 rounded-md" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-32 mb-3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {!chatLoading && chatErrorCode && (
        <Card className="border border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex gap-3">
              <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-destructive">Request failed</p>
                <p className="text-sm text-muted-foreground">{ERROR_LABELS[chatErrorCode] || ERROR_LABELS.UNKNOWN}</p>
                {chatErrorMsg && chatErrorMsg !== ERROR_LABELS[chatErrorCode] && (
                  <p className="text-xs text-muted-foreground/60 font-mono">
                    {chatErrorMsg}
                  </p>
                )}
                {chatErrorCode !== 'FORBIDDEN' && chatErrorCode !== 'UNAUTHORIZED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs mt-1"
                    onClick={handleRetry}
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
      {!chatLoading && !chatErrorCode && !chatResponse && (
        <Card className="border border-dashed bg-card/30">
          <CardContent className="pt-7 pb-7 flex flex-col items-center gap-3 text-center">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">No question asked yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                Click a suggested prompt above or type your own question.
                Responses cite specific values from the current snapshot —
                no data is fabricated.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {!chatLoading && !chatErrorCode && chatResponse && (
        <Card className="border bg-card/50">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  AI-generated analytics guidance
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground/50">
                  {formatGenerated(chatResponse.generatedAt)}
                </span>
                <button
                  type="button"
                  disabled={chatLoading}
                  title={chatLoading ? 'Processing…' : 'Re-ask this question'}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
                         text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50
                         transition-colors focus-visible:outline-none focus-visible:ring-1
                         focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleRegenerate}
                >
                  <RotateCcw className={`size-2.5 ${chatLoading ? 'animate-spin' : ''}`} />
                  {chatLoading ? 'Processing…' : 'Regenerate'}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Question Echo */}
            <div className="border-l-2 border-primary/40 pl-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
                Question
              </p>
              <p className="text-sm text-muted-foreground italic leading-snug">
                "{lastQuestion}"
              </p>
            </div>

            {/* Answer */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Answer
                </p>
                <button
                  type="button"
                  title={copied ? 'Copied!' : 'Copy answer'}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]
                         text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50
                         transition-colors cursor-pointer focus-visible:outline-none
                         focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-2.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-2.5" />
                  )}
                  <span className={copied ? 'text-emerald-500' : ''}>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{chatResponse.answer}</p>
            </div>

            {/* Key Metrics */}
            {chatResponse.highlights.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
                  Key Metrics
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {chatResponse.highlights.map((h, i) => (
                    <div
                      key={i}
                      className={`rounded-md border px-3 py-2 ${severityRowClass(h.severity)}`}
                    >
                      <div className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[8px] px-1.5 py-0 uppercase font-bold shrink-0 mt-0.5 leading-tight ${severityBadgeClass(h.severity)}`}
                        >
                          {h.severity}
                        </Badge>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight truncate">{h.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono leading-tight break-all">
                            {h.value}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {chatResponse.recommendedActions.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
                  Recommended Actions
                </p>
                <ul className="space-y-1.5">
                  {chatResponse.recommendedActions.map((action, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-primary font-bold shrink-0 select-none mt-px">→</span>
                      <span className="text-muted-foreground leading-snug">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related Records */}
            {chatResponse.relatedRecords.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 pt-1">
                  Related Records
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chatResponse.relatedRecords.map((rec, i) => {
                    const meta = recordMeta(rec.type)
                    return (
                      <div
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${meta.badgeClass}`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wide opacity-70 shrink-0">
                          {meta.short}
                        </span>
                        <span className="text-[10px] font-medium leading-none">{rec.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
