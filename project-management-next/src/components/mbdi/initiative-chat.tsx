'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { resolveOwnerNotifyIds } from '@/features/mbdi/utils/notify'
import type { MbdiInitiative } from '@/features/mbdi/types'
import { cn } from '@/lib/utils'

interface Props {
  initiative: MbdiInitiative
  canCompose?: boolean
}

export function MbdiInitiativeChat({ initiative, canCompose = true }: Props) {
  const { user } = useAuthStore()
  const {
    messages,
    sendMessage,
    getOrCreateMbdiChat,
    closeChat,
    sendError,
    loading,
  } = useChatStore()

  const [chatId, setChatId] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!user?.uid || !initiative.id) return
      setBooting(true)
      try {
        const ownerUids = await resolveOwnerNotifyIds(
          initiative.ownerId,
          initiative.ownerEmail
        )
        const id = await getOrCreateMbdiChat(
          initiative.id,
          {
            groupName: initiative.mbdiNo || initiative.title || 'MBDI Initiative',
            ownerUid: ownerUids[0] || null,
            extraParticipantUids: ownerUids.slice(1),
          },
          user.uid
        )
        if (cancelled) return
        if (!id) {
          toast.error('Could not open initiative chat')
          return
        }
        setChatId(id)
        // getOrCreateMbdiChat already calls openChat — keep unsub via store cleanup on unmount
      } catch (err) {
        console.error('[MbdiInitiativeChat] boot failed:', err)
        if (!cancelled) toast.error('Could not open initiative chat')
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void boot()

    return () => {
      cancelled = true
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
      closeChat()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiative.id, user?.uid])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  useEffect(() => {
    if (sendError) toast.error(sendError)
  }, [sendError])

  async function handleSend() {
    if (!canCompose || !user?.uid || !text.trim() || !chatId) return
    setSending(true)
    try {
      await sendMessage(text.trim(), {
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
      })
      setText('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="border-orange-500/20 bg-orange-500/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-orange-700 dark:text-orange-300 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Initiative Chat
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Shared with the owner and staff who open this initiative — same thread in Projects and the MBDI app.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="h-64 overflow-y-auto rounded-md border bg-background/60 p-3 space-y-2"
        >
          {booting || (loading && messages.length === 0) ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {canCompose ? 'No messages yet. Start the conversation.' : 'No messages yet.'}
            </p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === user?.uid
              return (
                <div
                  key={msg.id}
                  className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 border text-sm',
                      isMine
                        ? 'bg-orange-600/15 border-orange-500/30 text-foreground'
                        : 'bg-muted/60 border-border'
                    )}
                  >
                    {!isMine && (
                      <p className="text-[11px] font-medium mb-0.5 opacity-70">
                        {msg.senderName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <p className="text-[10px] mt-1 opacity-50 text-right">
                      {msg.createdAt?.toDate?.()?.toLocaleTimeString?.([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }) || ''}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {canCompose ? (
          <div className="flex gap-2 items-end">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message the initiative team…"
              rows={2}
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              disabled={booting || !chatId}
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
              disabled={booting || !chatId || sending || !text.trim()}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center rounded-md border border-dashed border-border bg-muted/30 px-3 py-3">
            View only — only the owner or management can comment
          </p>
        )}
      </CardContent>
    </Card>
  )
}
