'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, FileIcon, Loader2, MessageSquare, Paperclip, Send, X } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { uploadMbdiCommentAttachment } from '@/lib/storage-helpers'
import { cn } from '@/lib/utils'
import { useMbdiStore } from '@/stores/mbdi-store'
import type {
  MbdiComment,
  MbdiCommentAttachment,
  MbdiCommentMention,
  MbdiInitiative,
} from '@/features/mbdi/types'

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB — aligned with chat attachments

interface StaffUser {
  id: string
  displayName: string
  email?: string
  name?: string
}

interface Props {
  initiative: MbdiInitiative
  actor: { uid: string; name: string }
  canCompose?: boolean
}

function getInitials(name: string) {
  return (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatFileSize(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageAttachment(a: { contentType?: string; name: string }) {
  if (a.contentType?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name)
}

function formatCommentTime(value: MbdiComment['createdAt']): string {
  if (!value) return 'Just now'
  try {
    let date: Date | null = null
    if (typeof value === 'string') date = new Date(value)
    else if (typeof value === 'object' && typeof value.toDate === 'function') date = value.toDate()
    else if (typeof value === 'object' && 'seconds' in (value as object)) {
      date = new Date((value as { seconds: number }).seconds * 1000)
    }
    if (!date || Number.isNaN(date.getTime())) return 'Just now'
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Just now'
  }
}

/** Render comment text with @DisplayName chips for known mentions. */
function CommentBody({ text, mentions }: { text: string; mentions?: MbdiCommentMention[] }) {
  const names = (mentions || [])
    .map((m) => m.displayName)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  if (names.length === 0) {
    return <p className="text-sm whitespace-pre-wrap break-words text-foreground">{text}</p>
  }

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(@(?:${escaped.join('|')}))`, 'g')
  const parts = text.split(re)

  return (
    <p className="text-sm whitespace-pre-wrap break-words text-foreground">
      {parts.map((part, i) => {
        if (part.startsWith('@') && names.includes(part.slice(1))) {
          return (
            <span
              key={i}
              className="inline-flex items-center rounded-md border border-orange-200 bg-orange-500/15 px-1.5 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:text-orange-300 mx-0.5"
            >
              {part}
            </span>
          )
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </p>
  )
}

function CommentAttachments({ attachments }: { attachments?: MbdiCommentAttachment[] }) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) =>
          isImageAttachment(a) ? (
            <a
              key={`${a.url}-${a.name}`}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md border border-border bg-background"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className="max-h-36 max-w-[220px] object-cover"
              />
            </a>
          ) : (
            <a
              key={`${a.url}-${a.name}`}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1.5 text-xs text-foreground hover:bg-muted/80"
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-red-500" />
              <span className="truncate">{a.name}</span>
              {a.size != null && (
                <span className="shrink-0 text-muted-foreground">({formatFileSize(a.size)})</span>
              )}
            </a>
          )
        )}
      </div>
    </div>
  )
}

export function MbdiComments({ initiative, actor, canCompose = true }: Props) {
  const store = useMbdiStore()
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<MbdiCommentMention[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [sending, setSending] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.subscribeComments(initiative.id)
    return () => store.cleanupComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiative.id])

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const users = snap.docs
          .map((d) => {
            const data = d.data()
            if (data.isActive === false) return null
            const displayName = (data.name || data.displayName || data.email || d.id) as string
            return {
              id: d.id,
              displayName,
              email: data.email as string | undefined,
              name: data.name as string | undefined,
            } satisfies StaffUser
          })
          .filter(Boolean) as StaffUser[]
        users.sort((a, b) => a.displayName.localeCompare(b.displayName))
        setStaff(users)
      })
      .catch((err) => console.error('Failed to load staff for mentions:', err))
  }, [])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [store.comments.length])

  const filteredStaff = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase()
    return staff
      .filter((u) => {
        if (!q) return true
        return (
          u.displayName.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [staff, mentionQuery])

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) {
      setMentionOpen(false)
      setMentionStart(null)
      setMentionQuery('')
      return
    }
    const charBefore = at === 0 ? ' ' : before[at - 1]
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionOpen(false)
      setMentionStart(null)
      setMentionQuery('')
      return
    }
    const queryPart = before.slice(at + 1)
    if (/\s/.test(queryPart)) {
      setMentionOpen(false)
      setMentionStart(null)
      setMentionQuery('')
      return
    }
    setMentionOpen(true)
    setMentionStart(at)
    setMentionQuery(queryPart)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)
    detectMention(value, e.target.selectionStart ?? value.length)
  }

  const insertMention = (user: StaffUser) => {
    if (mentionStart == null) return
    const before = text.slice(0, mentionStart)
    const caret = textareaRef.current?.selectionStart ?? text.length
    const after = text.slice(caret)
    const insertion = `@${user.displayName} `
    const next = `${before}${insertion}${after}`
    setText(next)
    setMentions((prev) => {
      if (prev.some((m) => m.uid === user.id)) return prev
      return [...prev, { uid: user.id, displayName: user.displayName }]
    })
    setMentionOpen(false)
    setMentionStart(null)
    setMentionQuery('')
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const pos = before.length + insertion.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const addPendingFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files)
    const next = [...pendingFiles]
    const rejected: string[] = []

    for (const file of incoming) {
      if (next.length >= MAX_ATTACHMENTS) {
        rejected.push(`Max ${MAX_ATTACHMENTS} files per comment`)
        break
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} exceeds 10 MB`)
        continue
      }
      const dup = next.some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
      )
      if (dup) continue
      next.push(file)
    }

    if (rejected.length > 0) {
      toast.error(rejected[0])
    }
    setPendingFiles(next)
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    if (!canCompose) return
    const trimmed = text.trim()
    if (!trimmed) return toast.error('Write a comment first.')
    // Keep only mentions still present as @DisplayName in the text
    const activeMentions = mentions.filter((m) =>
      trimmed.includes(`@${m.displayName}`)
    )
    setSending(true)
    try {
      let attachments: MbdiCommentAttachment[] = []
      if (pendingFiles.length > 0) {
        attachments = await Promise.all(
          pendingFiles.map((file) =>
            uploadMbdiCommentAttachment(file, initiative.id, actor.uid)
          )
        )
      }
      await store.addComment(
        initiative,
        {
          text: trimmed,
          mentions: activeMentions,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
        actor
      )
      setText('')
      setMentions([])
      setPendingFiles([])
      setMentionOpen(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success('Comment posted.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post comment.'
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  const comments = store.comments
  const canSend = canCompose && Boolean(text.trim()) && !sending

  return (
    <Card className="mb-4 overflow-hidden shadow-sm border-red-500/30 bg-background">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3 pb-3 border-b border-red-500/15 bg-red-500/[0.06]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-red-500/15 shrink-0">
            <MessageSquare className="size-4 text-red-500" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base text-foreground">Comments</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Discuss this initiative. Type @ to tag a colleague — they get a Rocket notification.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 bg-background">
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/40 p-3"
        >
          {store.commentsLoading && comments.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              {canCompose
                ? 'No comments yet — start the discussion. Use @ to tag someone.'
                : 'No comments yet.'}
            </p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="flex gap-2.5 rounded-lg border border-border/80 bg-background p-2.5 shadow-sm"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-300">
                    {getInitials(c.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-foreground">{c.authorName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatCommentTime(c.createdAt)}
                    </span>
                  </div>
                  <CommentBody text={c.text} mentions={c.mentions} />
                  <CommentAttachments attachments={c.attachments} />
                </div>
              </div>
            ))
          )}
        </div>

        {canCompose ? (
        <div className="relative space-y-2">
          {mentionOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 z-[60]">
              <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col opacity-100">
                <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-border bg-popover shrink-0">
                  <AtSign className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Tag a colleague
                  </p>
                </div>
                <div className="overflow-y-auto bg-popover">
                  {filteredStaff.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No matching users found</p>
                  ) : (
                    <div className="py-1">
                      {filteredStaff.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertMention(u)
                          }}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-300">
                              {getInitials(u.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate text-foreground">{u.displayName}</p>
                            {u.email && (
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && mentionOpen) {
                e.preventDefault()
                setMentionOpen(false)
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder="Write a comment… Use @ to tag someone"
            rows={3}
            className={cn('resize-none bg-background border-border', mentionOpen && 'rounded-t-none')}
            disabled={sending}
            maxLength={4000}
          />

          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${idx}`}
                  className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-red-500" />
                  <span className="truncate text-foreground">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                    onClick={() => removePendingFile(idx)}
                    disabled={sending}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addPendingFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-red-500/25 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || pendingFiles.length >= MAX_ATTACHMENTS}
                title={
                  pendingFiles.length >= MAX_ATTACHMENTS
                    ? `Max ${MAX_ATTACHMENTS} files`
                    : 'Attach files'
                }
              >
                <Paperclip className="h-3.5 w-3.5" />
                Attach
              </Button>
              <p className="text-[11px] text-muted-foreground truncate">
                Ctrl/⌘+Enter to send
                {mentions.length > 0 ? ` · ${mentions.length} tagged` : ''}
                {pendingFiles.length > 0 ? ` · ${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'}` : ''}
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3">
            View only — only the owner or management can comment
          </p>
        )}
      </CardContent>
    </Card>
  )
}
