'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useChatStore, type Message, getMessageAttachments } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MessageSquare, Send, Plus, Search, User, Check, Circle, Loader2, X, Smile, Reply, Paperclip, Image, Users, Settings, Bell, BellOff, ArrowLeft, AtSign, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import MentionCommandOverlay, { ENTITY_TYPE_META } from '@/components/chat/MentionCommandOverlay'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { SharedFilesModal } from '@/components/chat/shared-files-modal'
import FileVaultDashboard from '@/components/chat/FileVaultDashboard'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_ATTACHMENTS = 10
const ALLOWED_MIME_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
]
/** Extensions allowed when browser MIME is empty or mismatched (common for CSV). */
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv']

export default function ChatPage() {
  const {
    user: authUser,
  } = useAuthStore()
  const {
    chats, messages, activeChatId, sendMessage, fetchChats, openChat, closeChat, startPrivateChat, createGroupChat,
    cleanup, loading, hasMoreMessages, loadMoreMessages, setTyping, markMessageRead,
    addReaction, replyTarget, setReplyTarget, searchQuery, setSearchQuery,
    uploadAttachments, uploadProgress, uploading, addGroupMember, removeGroupMember,
  } = useChatStore()
  const [messageText, setMessageText] = useState('')
  const [viewMode, setViewMode] = useState<'chat' | 'vault'>('chat')
  const [users, setUsers] = useState<any[]>([])
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const [notifyDismissed, setNotifyDismissed] = useState(false)
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission>('default')
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [prevMessagesCount, setPrevMessagesCount] = useState(0)
  const [isCorrectingScroll, setIsCorrectingScroll] = useState(false)
  const [oldScrollHeight, setOldScrollHeight] = useState(0)

  // Attachment preview modal states
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSharedFilesOpen, setIsSharedFilesOpen] = useState(false)

  // @mention / /command overlay state
  const [overlayMode, setOverlayMode] = useState<'mention' | 'command' | 'entity-search' | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')

  // Draft metadata for the current composed message
  const [draftMentions, setDraftMentions] = useState<Array<{ uid: string; displayName: string }>>([])
  const [draftEntityTags, setDraftEntityTags] = useState<Array<{ type: string; id: string; label: string; url: string }>>([])

  const adminStore = useAdminStore()
  const brandColor = (adminStore.appSettings?.uiColors as any)?.brandPrimaryColor || '#79c21b'

  const uid = authUser?.uid || ''

  useEffect(() => {
    if (!uid) return
    const unsubChats = fetchChats(uid)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const usersList = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          displayName: data.name || data.displayName || data.email || 'User',
          ...data
        };
      });
      const filtered = usersList
        .filter((u: any) => u.id !== uid && u.isActive !== false)
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setUsers(filtered);
    });
    return () => { unsubChats(); unsubUsers(); cleanup() }
  }, [uid])

  // Scroll to bottom on initial load, new messages, or when near bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const isInitialLoad = prevMessagesCount === 0 && messages.length > 0
    const lastMsg = messages[messages.length - 1]
    const hasNewMessage = messages.length > prevMessagesCount && lastMsg?.senderId === uid

    // Determine if user is currently near the bottom of scroll (within 150px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150

    if (isInitialLoad || hasNewMessage || isNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isInitialLoad ? 'auto' : 'smooth'
      })
    }

    setPrevMessagesCount(messages.length)
  }, [messages, uid, prevMessagesCount])

  // Correct scroll position when older history is prepended
  useEffect(() => {
    if (isCorrectingScroll && scrollContainerRef.current && oldScrollHeight > 0) {
      const container = scrollContainerRef.current
      const delta = container.scrollHeight - oldScrollHeight
      container.scrollTop = delta
      setIsCorrectingScroll(false)
      setOldScrollHeight(0)
    }
  }, [messages, isCorrectingScroll, oldScrollHeight])

  const handleLoadOlder = async () => {
    const container = scrollContainerRef.current
    if (!container) return
    setOldScrollHeight(container.scrollHeight)
    setIsCorrectingScroll(true)
    await loadMoreMessages(uid)
  }

  // Read receipt visibility listener
  useEffect(() => {
    if (document.hasFocus() && activeChatId && messages.length > 0) {
      messages.forEach(msg => {
        if (msg.id && msg.senderId !== uid && !msg.readBy?.[uid]) {
          markMessageRead(activeChatId, msg.id, uid)
        }
      })
    }
  }, [messages, activeChatId, uid])

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifyPermission(Notification.permission);
    } else {
      setNotifyPermission('denied');
    }
    setNotifyDismissed(localStorage.getItem('chat_notify_dismissed') === 'true')
  }, [])

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission()
      setNotifyPermission(result)
      if (result === 'denied') {
        localStorage.setItem('chat_notify_dismissed', 'true')
        setNotifyDismissed(true)
      }
    } else {
      toast.info('Notifications are not supported on this browser/device.')
    }
  }

  const isAllowedFile = (file: File) => {
    const mimeOk = ALLOWED_MIME_TYPES.some(mime => {
      if (mime.endsWith('/*')) return file.type.startsWith(mime.replace('/*', '/'))
      return file.type === mime
    })
    if (mimeOk) return true
    // Browsers often report CSV as "" or text/plain — fall back to extension
    const name = file.name.toLowerCase()
    return ALLOWED_EXTENSIONS.some(ext => name.endsWith(ext))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return

    const next: File[] = [...attachmentFiles]
    const rejected: string[] = []

    for (const file of selected) {
      if (next.length >= MAX_ATTACHMENTS) {
        rejected.push(`Max ${MAX_ATTACHMENTS} files per message`)
        break
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: over 10MB`)
        continue
      }
      if (!isAllowedFile(file)) {
        rejected.push(`${file.name}: type not allowed`)
        continue
      }
      // Deduplicate by name+size+lastModified
      const dup = next.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)
      if (!dup) next.push(file)
    }

    setAttachmentFiles(next)
    if (rejected.length) {
      toast.error(rejected[0], rejected.length > 1 ? { description: `+${rejected.length - 1} more issue(s)` } : undefined)
    }
    // Allow selecting the same file again after remove
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachmentAt = (index: number) => {
    setAttachmentFiles(prev => prev.filter((_, i) => i !== index))
  }



  // Helper to display read receipts for own messages
  const getReadByDisplay = (msg: Message) => {
    if (msg.senderId !== uid) return null
    const readers = Object.keys(msg.readBy || {}).filter(id => id !== uid)
    if (readers.length === 0) return null
    const names = readers.slice(0, 3).map(id => users.find(u => u.id === id)?.displayName || 'Someone')
    let text = names.join(', ')
    if (readers.length > 3) text += ` +${readers.length - 3} more`
    return text
  }

  const handleSend = async () => {
    if (!authUser || (!messageText.trim() && attachmentFiles.length === 0)) return
    try {
      let fileData = undefined
      if (attachmentFiles.length > 0 && activeChatId) {
        fileData = await uploadAttachments(activeChatId, attachmentFiles)
      }

      const textToSend = messageText.trim() || (
        attachmentFiles.length === 1
          ? `Shared a file: ${attachmentFiles[0].name}`
          : `Shared ${attachmentFiles.length} files`
      )

      await sendMessage(
        textToSend,
        {
          uid: authUser.uid,
          displayName: authUser.displayName || '',
          email: authUser.email || ''
        },
        replyTarget || undefined,
        fileData,
        draftMentions.length ? draftMentions : undefined,
        draftEntityTags.length ? draftEntityTags : undefined
      )

      setMessageText('')
      setAttachmentFiles([])
      setReplyTarget(null)
      setDraftMentions([])
      setDraftEntityTags([])
      setOverlayMode(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && overlayMode) {
      e.preventDefault()
      setOverlayMode(null)
      setMentionQuery('')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (overlayMode) return // don't send while overlay open
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMessageText(value)
    setTyping(value.length > 0, uid)

    // Don't interfere while entity-search overlay has its own input focused
    if (overlayMode === 'entity-search') return

    const cursorPos = e.target.selectionStart ?? value.length
    const textBefore = value.slice(0, cursorPos)

    const mentionMatch = textBefore.match(/@(\S*)$/)
    const commandMatch = textBefore.match(/(?:^|\s)\/(\S*)$/)

    if (mentionMatch) {
      setOverlayMode('mention')
      setMentionQuery(mentionMatch[1])
    } else if (commandMatch) {
      setOverlayMode('command')
    } else {
      setOverlayMode(null)
      setMentionQuery('')
    }
  }

  // @mention selection handler
  const handleSelectMention = (user: any) => {
    setMessageText(prev => prev.replace(/@\S*$/, `@${user.displayName || user.email || 'User'} `))
    setDraftMentions(prev =>
      prev.find(m => m.uid === user.id)
        ? prev
        : [...prev, { uid: user.id, displayName: user.displayName || user.email || 'User' }]
    )
    setOverlayMode(null)
    setMentionQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // /entity type selection — switches overlay to entity-search mode
  const handleSelectEntityType = () => {
    setOverlayMode('entity-search')
  }

  // entity record selection handler
  const handleSelectEntity = (_entity: any, type: string, label: string, url: string) => {
    const meta = ENTITY_TYPE_META[type]
    const tagText = `[${meta?.label ?? type}: ${label}]`
    setMessageText(prev => prev.replace(/(?:^|\s)\/(\S*)$/, m => (m.startsWith(' ') ? ' ' : '') + tagText + ' '))
    setDraftEntityTags(prev =>
      prev.find(t => t.id === _entity.id)
        ? prev
        : [...prev, { type, id: _entity.id, label, url }]
    )
    setOverlayMode(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleNewChat = async () => {
    if (!selectedUserId || !uid) return
    const chatId = await startPrivateChat(selectedUserId, uid)
    if (chatId) { setIsNewChatOpen(false); setSelectedUserId('') }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0 || !uid) return
    await createGroupChat(groupName.trim(), [uid, ...groupMembers], uid)
    setIsGroupDialogOpen(false)
    setGroupName('')
    setGroupMembers([])
  }

  const handleReaction = (msgId: string, emoji: string) => {
    if (!activeChatId) return
    addReaction(activeChatId, msgId, emoji, uid)
    setReactionPickerMsgId(null)
  }

  const activeChat = chats.find(c => c.id === activeChatId)
  const otherUser = activeChat?.isGroup
    ? null
    : activeChat ? users.find(u => activeChat.participants?.includes(u.id) && u.id !== uid) : null

  const chatTitle = activeChat?.isGroup
    ? activeChat.groupName || 'Group Chat'
    : (otherUser?.displayName || otherUser?.email || 'Chat')

  const chatAvatarFallback = activeChat?.isGroup
    ? (activeChat.groupName || 'G').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'G'
    : getInitials(otherUser?.displayName || otherUser?.email || 'U')

  const activeTypists = Object.entries(activeChat?.typing || {})
    .filter(([userId, timestamp]) => {
      if (userId === uid) return false
      if (!timestamp) return true // Show immediately during pending write
      const ms = typeof (timestamp as any).toMillis === 'function'
        ? (timestamp as any).toMillis()
        : new Date(timestamp as any).getTime()
      return Math.abs(Date.now() - ms) < 15000 // 15s window to tolerate clock skew
    })
    .map(([userId]) => users.find(u => u.id === userId)?.displayName || 'Someone')

  function getInitials(name: string) {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  // NOTE: This search runs on the active client context only and is NOT connected to full-text database indexers.
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  // Rich message content renderer — parses @mentions and [EntityType: Label] tags
  const renderMessageContent = (msg: Message, isMine: boolean) => {
    type Seg =
      | { kind: 'text'; content: string }
      | { kind: 'mention'; uid: string; displayName: string }
      | { kind: 'entity'; tag: { type: string; id: string; label: string; url: string } }

    let segments: Seg[] = [{ kind: 'text', content: msg.text }]

    // Resolve @mention tokens
    if (msg.mentions?.length) {
      msg.mentions.forEach(mention => {
        const needle = `@${mention.displayName}`
        const newSegs: Seg[] = []
        segments.forEach(seg => {
          if (seg.kind !== 'text') { newSegs.push(seg); return }
          const parts = seg.content.split(needle)
          parts.forEach((part, i) => {
            if (part) newSegs.push({ kind: 'text', content: part })
            if (i < parts.length - 1)
              newSegs.push({ kind: 'mention', uid: mention.uid, displayName: mention.displayName })
          })
        })
        segments = newSegs
      })
    }

    // Resolve [EntityType: Label] tokens
    if (msg.entityTags?.length) {
      msg.entityTags.forEach(tag => {
        const meta = ENTITY_TYPE_META[tag.type]
        const needle = `[${meta?.label ?? tag.type}: ${tag.label}]`
        const newSegs: Seg[] = []
        segments.forEach(seg => {
          if (seg.kind !== 'text') { newSegs.push(seg); return }
          const parts = seg.content.split(needle)
          parts.forEach((part, i) => {
            if (part) newSegs.push({ kind: 'text', content: part })
            if (i < parts.length - 1)
              newSegs.push({ kind: 'entity', tag })
          })
        })
        segments = newSegs
      })
    }

    if (segments.length === 1 && segments[0].kind === 'text') {
      return <span>{msg.text}</span>
    }

    return (
      <span className="leading-relaxed">
        {segments.map((seg, i) => {
          if (seg.kind === 'mention') {
            return (
              <span
                key={i}
                className="inline-flex items-center rounded px-1 py-0.5 text-xs font-semibold align-baseline"
                style={{
                  backgroundColor: `color-mix(in srgb, ${brandColor} 20%, transparent)`,
                  color: brandColor,
                }}
              >
                @{seg.displayName}
              </span>
            )
          }
          if (seg.kind === 'entity') {
            const meta = ENTITY_TYPE_META[seg.tag.type]
            const Icon = meta?.icon
            return (
              <Link
                key={i}
                href={seg.tag.url}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium align-baseline transition-opacity hover:opacity-75 ${
                  meta?.chipClass ?? 'bg-muted border-border text-foreground'
                }`}
                onClick={e => e.stopPropagation()}
              >
                {Icon && <Icon className="h-3 w-3 shrink-0" />}
                {seg.tag.label}
              </Link>
            )
          }
          return <span key={i}>{(seg as any).content}</span>
        })}
      </span>
    )
  }

  return (
    <div className="flex h-[calc(100vh-9.5rem)] md:h-[calc(100vh-8rem)] gap-0 md:gap-4 overflow-hidden relative w-full">
      {/* Sidebar */}
      <Card className={`shrink-0 flex flex-col rounded-none md:rounded-xl ring-0 md:ring-1 md:w-72 lg:w-80 ${(activeChatId || viewMode === 'vault') ? 'hidden md:flex' : 'flex w-full'}`}>
        <CardHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base"><MessageSquare className="h-4 w-4 inline mr-2" />Messages</CardTitle>
            <div className="flex items-center gap-1">
              <Button 
                size="sm" 
                variant={viewMode === 'vault' ? 'secondary' : 'outline'} 
                onClick={() => setViewMode(viewMode === 'vault' ? 'chat' : 'vault')}
                title="File Vault"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsGroupDialogOpen(true)} title="New Group">
                <Users className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsNewChatOpen(true)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No conversations yet</p>
            ) : chats.map(chat => {
              const isGroup = chat.isGroup
              const otherParticipant = users.find(u => chat.participants?.includes(u.id) && u.id !== uid)
              const unread = chat.unreadCount?.[uid] || 0
              const isActive = chat.id === activeChatId
              const displayName = isGroup
                ? chat.groupName || 'Group Chat'
                : (otherParticipant?.displayName || otherParticipant?.email || 'Unknown')
              return (
                <button key={chat.id} onClick={() => { openChat(chat.id, uid); setViewMode('chat') }}
                  className={`w-full text-left p-3 rounded-lg transition-colors border ${isActive ? 'bg-muted/80 shadow-inner' : 'hover:bg-muted/50 border-transparent'}`}
                  style={{
                    borderColor: isActive ? `${brandColor}40` : undefined
                  }}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                        {isGroup ? getInitials(chat.groupName || 'G') : getInitials(otherParticipant?.displayName || otherParticipant?.email || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{chat.lastMessage || 'No messages yet'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {chat.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {(() => {
                            const date = typeof chat.lastMessageAt.toDate === 'function' 
                              ? chat.lastMessageAt.toDate() 
                              : new Date(chat.lastMessageAt);
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          })()}
                        </span>
                      )}
                      {unread > 0 && (
                        <Badge 
                          className="shrink-0 rounded-full h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1 font-bold text-white"
                          style={{ backgroundColor: brandColor }}
                        >
                          {unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Main Chat Area / File Vault */}
      {viewMode === 'vault' ? (
        <div className="flex-grow flex-1 min-w-0 h-full">
          <FileVaultDashboard 
            users={users}
            onPreviewFile={(url, name) => {
              setPreviewUrl(url)
              setPreviewTitle(name)
              setIsPreviewOpen(true)
            }}
            onViewInChat={(chatId) => {
              openChat(chatId, uid)
              setViewMode('chat')
            }}
          />
        </div>
      ) : (
        <Card className={`flex-col rounded-none md:rounded-xl ring-0 md:ring-1 min-w-0 ${activeChatId ? 'flex w-full md:flex-1' : 'hidden md:flex md:flex-1'}`}>
        {activeChatId ? (
          <>
            <CardHeader className="border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="md:hidden shrink-0 h-10 w-10 text-muted-foreground -ml-2 mr-1"
                  onClick={() => closeChat()}
                  title="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div 
                  className="flex items-center gap-3 flex-grow min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsSharedFilesOpen(true)}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{chatAvatarFallback}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm truncate">{chatTitle}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{activeChat?.participants?.length || 0} participants</p>
                  </div>
                </div>
                <div className="relative hidden sm:block w-32 md:w-48">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 scroll-container">
              {/* Notification banner */}
              {notifyPermission === 'default' && !notifyDismissed && (
                <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-primary/5 rounded border text-sm">
                  <span className="text-muted-foreground">Enable browser notifications to receive instant alert popups</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={requestNotificationPermission}><Bell className="h-3.5 w-3.5 mr-1" />Enable</Button>
                    <Button size="sm" variant="ghost" onClick={() => { localStorage.setItem('chat_notify_dismissed', 'true'); setNotifyDismissed(true) }}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {hasMoreMessages && (
                  <div className="text-center">
                    <Button variant="link" size="sm" onClick={handleLoadOlder} disabled={loading}>
                      {loading ? 'Loading...' : 'Load older messages'}
                    </Button>
                  </div>
                )}
                {filteredMessages.map((msg, i) => {
                  const isMine = msg.senderId === uid
                  const isHovered = hoveredMessageId === msg.id
                  const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0
                  return (
                    <div key={msg.id || i} className="flex flex-col gap-0.5">
                      {/* Reply preview */}
                      {msg.replyTo && (
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[85%] md:max-w-[75%] text-[11px] px-2 py-1 rounded bg-muted/50 text-muted-foreground border-l-2 border-primary/50 italic mb-0.5">
                            Replying to {msg.replyTo.senderName}: &ldquo;{msg.replyTo.textPreview.length > 60 ? msg.replyTo.textPreview.slice(0, 60) + '…' : msg.replyTo.textPreview}&rdquo;
                          </div>
                        </div>
                      )}
                      <div
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        onMouseEnter={() => setHoveredMessageId(msg.id || null)}
                        onMouseLeave={() => { setHoveredMessageId(null); setReactionPickerMsgId(null) }}
                      >
                        <div className="relative max-w-[85%] md:max-w-[75%]">
                          <div 
                            className="rounded-lg px-3 py-2 backdrop-blur-md border"
                            style={{
                              backgroundColor: isMine ? `color-mix(in srgb, ${brandColor} 15%, transparent)` : 'hsl(var(--muted))',
                              borderColor: isMine ? `${brandColor}40` : 'transparent',
                              color: 'hsl(var(--foreground))'
                            }}
                          >
                            {!isMine && activeChat?.isGroup && <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>}
                            {!isMine && !activeChat?.isGroup && <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>}

                            {/* Attachment preview(s) */}
                            {(() => {
                              const attachments = getMessageAttachments(msg)
                              if (!attachments.length) return null
                              return (
                                <div className="mb-1 space-y-1.5">
                                  {attachments.map((attachment, aIdx) => (
                                    <div key={`${msg.id || 'msg'}-att-${aIdx}`}>
                                      {attachment.type?.startsWith('image/') ? (
                                        <img
                                          src={attachment.url}
                                          alt={attachment.name}
                                          className="max-w-full max-h-48 rounded cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() => {
                                            setPreviewUrl(attachment.url)
                                            setPreviewTitle(attachment.name)
                                            setIsPreviewOpen(true)
                                          }}
                                        />
                                      ) : (
                                        <div
                                          onClick={() => {
                                            setPreviewUrl(attachment.url)
                                            setPreviewTitle(attachment.name)
                                            setIsPreviewOpen(true)
                                          }}
                                          className="flex items-center gap-2 p-2 rounded bg-black/10 hover:bg-black/20 border border-white/5 text-xs max-w-full transition-colors truncate text-left cursor-pointer text-inherit"
                                        >
                                          <Paperclip className="h-4 w-4 shrink-0 opacity-70" />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" title={attachment.name}>{attachment.name}</p>
                                            <p className="text-[10px] opacity-60">{(attachment.size / 1024).toFixed(1)} KB</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                            <p className="text-sm">{renderMessageContent(msg, isMine)}</p>
                            <p className="text-[10px] mt-1 opacity-50 text-right">
                              {msg.createdAt?.toDate?.()?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) || ''}
                            </p>
                            {isMine && getReadByDisplay(msg) && (
                              <p className="text-[10px] mt-0.5 opacity-40 text-right">✓ Seen by {getReadByDisplay(msg)}</p>
                            )}
                          </div>
                          {/* Hover action bar */}
                          {isHovered && (
                            <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-popover border rounded-full px-1.5 py-0.5 shadow-sm z-10`}>
                              <button className="p-1 hover:bg-muted rounded-full transition-colors" onClick={() => setReplyTarget(msg)} title="Reply">
                                <Reply className="h-3.5 w-3.5" />
                              </button>
                              <button className="p-1 hover:bg-muted rounded-full transition-colors"
                                onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : (msg.id || null))} title="React">
                                <Smile className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {/* Emoji reaction picker */}
                          {reactionPickerMsgId === msg.id && (
                            <div className={`absolute -top-14 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-popover border rounded-full px-2 py-1 shadow-sm z-20`}>
                              {REACTION_EMOJIS.map(emoji => (
                                <button key={emoji} className="p-1 hover:bg-muted rounded-full text-base transition-colors"
                                  onClick={() => handleReaction(msg.id!, emoji)}>{emoji}</button>
                              ))}
                            </div>
                          )}
                          {/* Active reactions */}
                          {hasReactions && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(msg.reactions || {}).map(([emoji, userIds]) => (
                                <button key={emoji} onClick={() => handleReaction(msg.id!, emoji)}
                                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors ${
                                    userIds.includes(uid) ? 'bg-primary/20 border-primary/40' : 'bg-muted/50 border-border hover:bg-muted'
                                  }`}>
                                  <span>{emoji}</span>
                                  <span className="opacity-70">{userIds.length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="border-t p-3">
              <div className="h-6 px-1 text-xs text-muted-foreground transition-opacity">
                {activeTypists.length === 1 && `${activeTypists[0]} is typing...`}
                {activeTypists.length === 2 && `${activeTypists[0]} and ${activeTypists[1]} are typing...`}
                {activeTypists.length > 2 && 'Several people are typing...'}
              </div>
              {/* Reply target banner */}
              {replyTarget && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-primary/5 rounded border text-sm">
                  <Reply className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate flex-1">
                    Replying to <strong>{replyTarget.senderName}</strong>: &ldquo;{replyTarget.text.length > 40 ? replyTarget.text.slice(0, 40) + '…' : replyTarget.text}&rdquo;
                  </span>
                  <button onClick={() => setReplyTarget(null)} className="shrink-0 hover:bg-muted rounded p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {/* Attachment chips */}
              {attachmentFiles.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {attachmentFiles.length} file{attachmentFiles.length !== 1 ? 's' : ''} attached
                      {attachmentFiles.length >= MAX_ATTACHMENTS ? ` (max ${MAX_ATTACHMENTS})` : ''}
                    </span>
                    {uploading ? (
                      <span className="text-xs text-primary">Uploading: {uploadProgress}%</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAttachmentFiles([]); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {attachmentFiles.map((file, idx) => (
                      <div key={`${file.name}-${file.size}-${file.lastModified}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 bg-primary/5 rounded border text-xs max-w-full">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground truncate max-w-[140px]" title={file.name}>{file.name}</span>
                        <span className="text-muted-foreground/70 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                        {!uploading && (
                          <button
                            type="button"
                            onClick={() => removeAttachmentAt(idx)}
                            className="shrink-0 hover:bg-muted rounded p-0.5"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative flex gap-2 items-center">
                {/* Mention/Entity overlay */}
                <MentionCommandOverlay
                  mode={overlayMode}
                  mentionQuery={mentionQuery}
                  users={users}
                  onSelectMention={handleSelectMention}
                  onSelectEntityType={handleSelectEntityType}
                  onSelectEntity={handleSelectEntity}
                  onClose={() => { setOverlayMode(null); setMentionQuery('') }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading || attachmentFiles.length >= MAX_ATTACHMENTS}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  title={attachmentFiles.length >= MAX_ATTACHMENTS ? `Max ${MAX_ATTACHMENTS} files` : 'Attach files'}
                  className="shrink-0 h-11 w-11 md:h-10 md:w-10 flex items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || attachmentFiles.length >= MAX_ATTACHMENTS}
                >
                  <Paperclip className="h-5 w-5 md:h-4 md:w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Mention someone (@)"
                  className={`shrink-0 h-11 w-11 md:h-10 md:w-10 flex items-center justify-center transition-colors rounded-lg hover:bg-muted ${
                    overlayMode === 'mention' ? 'bg-muted' : ''
                  }`}
                  style={{
                    color: overlayMode === 'mention' ? brandColor : 'currentColor'
                  }}
                  onClick={() => {
                    if (overlayMode === 'mention') {
                      setOverlayMode(null)
                      setMentionQuery('')
                    } else {
                      setMessageText(prev => prev + '@')
                      setOverlayMode('mention')
                      setMentionQuery('')
                      setTimeout(() => inputRef.current?.focus(), 0)
                    }
                  }}
                  disabled={uploading}
                >
                  <AtSign className="h-5 w-5 md:h-4 md:w-4" />
                </Button>
                <Input
                  ref={inputRef}
                  value={messageText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={uploading ? 'Uploading attachment(s)...' : 'Type a message, @ to mention, / to link a record'}
                  className="flex-1 h-11 md:h-10 text-sm md:text-xs"
                  disabled={uploading}
                />
                <Button
                  onClick={handleSend}
                  disabled={(!messageText.trim() && attachmentFiles.length === 0) || uploading}
                  className="shrink-0 h-11 w-11 md:h-10 md:w-10 flex items-center justify-center p-0 md:px-4 md:w-auto text-white shadow-md rounded-lg"
                  style={{
                    backgroundColor: brandColor,
                    borderColor: brandColor
                  }}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5 md:h-4 md:w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* New Private Chat Dialog */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Conversation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Select a user</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {users.map(u => (
                  <button key={u.id} onClick={() => setSelectedUserId(u.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${selectedUserId === u.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{getInitials(u.displayName || u.email)}</AvatarFallback></Avatar>
                    <div className="text-left">
                      <p className="text-sm font-medium">{u.displayName || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {selectedUserId === u.id && <Check className="h-4 w-4 ml-auto text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewChatOpen(false)}>Cancel</Button>
            <Button onClick={handleNewChat} disabled={!selectedUserId}>Start Chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Group Chat</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Group Name</p>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Enter group name..." />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Add Members</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {users.map(u => (
                  <button key={u.id} onClick={() => {
                    setGroupMembers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])
                  }}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${groupMembers.includes(u.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{getInitials(u.displayName || u.email)}</AvatarFallback></Avatar>
                    <div className="text-left">
                      <p className="text-sm font-medium">{u.displayName || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {groupMembers.includes(u.id) && <Check className="h-4 w-4 ml-auto text-primary" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={!groupName.trim() || groupMembers.length === 0}>Create Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        url={previewUrl}
        title={previewTitle}
      />
      <SharedFilesModal
        isOpen={isSharedFilesOpen}
        onClose={() => setIsSharedFilesOpen(false)}
        chatId={activeChatId}
        chatTitle={chatTitle}
        onPreviewFile={(url, name) => {
          setPreviewUrl(url)
          setPreviewTitle(name)
          setIsPreviewOpen(true)
        }}
      />
    </div>
  )
}