'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChatStore, type Message } from '@/stores/chat-store'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { db, auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp, getDoc, setDoc } from 'firebase/firestore'
import { getToken } from 'firebase/messaging'
import { getMessagingInstance } from '@/lib/firebase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { 
  MessageSquare, Send, Plus, Search, User, Check, CheckCheck, Circle, Loader2, X, 
  Smile, Reply, Paperclip, Image, Users, Settings, Bell, BellOff, ArrowLeft, 
  AtSign, LogOut, Sun, Moon, Sparkles, Download, Clock, ExternalLink, FolderOpen
} from 'lucide-react'
import { usePWA } from '@/components/providers/pwa-provider'
import { toast } from 'sonner'
import MentionCommandOverlay, { ENTITY_TYPE_META } from '@/components/chat/MentionCommandOverlay'
import JobCardMessageCard from '@/components/chat/JobCardMessageCard'
import AttachmentMessageCard from '@/components/chat/AttachmentMessageCard'
import { FileViewerModal } from '@/components/ui/file-viewer-modal'
import { SharedFilesModal } from '@/components/chat/shared-files-modal'
import FileVaultDashboard from '@/components/chat/FileVaultDashboard'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/javascript',
  'application/json',
  'text/html',
  'text/css',
]

export default function StandaloneChatPage() {
  const { user: authUser } = useAuthStore()
  const {
    chats, messages, activeChatId, sendMessage, fetchChats, openChat, closeChat, startPrivateChat, createGroupChat,
    cleanup, loading, hasMoreMessages, loadMoreMessages, setTyping, markMessageRead,
    addReaction, replyTarget, setReplyTarget, searchQuery, setSearchQuery,
    uploadAttachment, uploadProgress, uploading,
    addGroupMember, removeGroupMember, deleteGroupChat,
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)

  // Attachment preview modal states
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSharedFilesOpen, setIsSharedFilesOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [prevMessagesCount, setPrevMessagesCount] = useState(0)
  const [isCorrectingScroll, setIsCorrectingScroll] = useState(false)
  const [oldScrollHeight, setOldScrollHeight] = useState(0)

  // @mention / /command overlay state
  const [overlayMode, setOverlayMode] = useState<'mention' | 'command' | 'entity-search' | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')

  // Draft metadata for the current composed message
  const [draftMentions, setDraftMentions] = useState<Array<{ uid: string; displayName: string }>>([])
  const [draftEntityTags, setDraftEntityTags] = useState<Array<{ type: string; id: string; label: string; url: string }>>([])

  // Custom Background and settings states
  // Custom Background and settings states
  const [chatBg, setChatBg] = useState("url('/background-farming.svg')")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
  const [selectedNewMemberId, setSelectedNewMemberId] = useState("")
  const [customBgUrl, setCustomBgUrl] = useState("")

  const router = useRouter()
  const searchParams = useSearchParams()
  const [isStandalone, setIsStandalone] = useState(false)

  // Detect PWA standalone display mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      )
    }
  }, [])

  const adminStore = useAdminStore()
  const brandColor = (adminStore.appSettings?.uiColors as any)?.brandPrimaryColor || '#79c21b'
  const { isInstallable, isInstalled, install } = usePWA()

  const uid = authUser?.uid || ''

  // ── URL Routing: sync activeChatId to ?chat= query param ──────────────────
  // On initial load, open chat from URL if present
  useEffect(() => {
    if (!uid || !chats.length) return
    const chatParam = searchParams.get('chat')
    if (chatParam && chatParam !== activeChatId) {
      const chatExists = chats.find(c => c.id === chatParam)
      if (chatExists) {
        openChat(chatParam, uid)
      }
    }
  }, [uid, chats, searchParams, openChat])

  // Sync URL when activeChatId changes (push state)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const currentUrl = new URL(window.location.href)
    const currentChatParam = currentUrl.searchParams.get('chat')
    const desiredChatParam = activeChatId || null

    // Only update if different to avoid loops
    if (currentChatParam !== desiredChatParam) {
      if (desiredChatParam) {
        currentUrl.searchParams.set('chat', desiredChatParam)
      } else {
        currentUrl.searchParams.delete('chat')
      }
      window.history.pushState({}, '', currentUrl.toString())
    }
  }, [activeChatId])

  // Listen for popstate (browser back/forward) to close/open chats
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handlePopState = () => {
      const url = new URL(window.location.href)
      const chatParam = url.searchParams.get('chat')
      if (chatParam && uid) {
        const chatExists = chats.find(c => c.id === chatParam)
        if (chatExists && chatParam !== activeChatId) {
          openChat(chatParam, uid)
        }
      } else if (!chatParam && activeChatId) {
        closeChat()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [uid, chats, activeChatId, openChat, closeChat])

  // Sync background preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const resolveAndSetBg = async () => {
      const storageKey = `incaptta_bg_url_${uid || 'global'}`
      
      // 1. Check local storage (main app key)
      let localVal = localStorage.getItem(storageKey)
      if (localVal) {
        if (localVal !== 'none' && !localVal.startsWith('linear-gradient') && !localVal.startsWith('url')) {
          localVal = `url('${localVal}')`
        }
        setChatBg(localVal)
        return
      }

      // 2. Check old chat local storage key
      const oldVal = localStorage.getItem('chat-bg')
      if (oldVal) {
        setChatBg(oldVal)
        localStorage.setItem(storageKey, oldVal)
        return
      }

      // 3. Fetch from user preferences in Firestore
      if (uid) {
        try {
          const snap = await getDoc(doc(db, 'userPreferences', uid))
          if (snap.exists() && snap.data().selectedBackgroundUrl !== undefined) {
            let bgUrl = snap.data().selectedBackgroundUrl || ''
            if (bgUrl && bgUrl !== 'none' && !bgUrl.startsWith('linear-gradient') && !bgUrl.startsWith('url')) {
              bgUrl = `url('${bgUrl}')`
            }
            if (bgUrl) {
              setChatBg(bgUrl)
              localStorage.setItem(storageKey, bgUrl)
              return
            }
          }
        } catch (e) {
          console.error('[Chat] Failed to fetch user background pref:', e)
        }
      }

      // 4. Default to admin settings default background
      const defaultAdminBg = adminStore.appSettings?.defaultBackgroundUrl || adminStore.appSettings?.backgroundImageUrl
      if (defaultAdminBg) {
        const adminBgVal = typeof defaultAdminBg === 'string' && (defaultAdminBg.startsWith('url') || defaultAdminBg.startsWith('linear-gradient') || defaultAdminBg === 'none')
          ? defaultAdminBg 
          : `url('${defaultAdminBg}')`
        setChatBg(adminBgVal)
      } else {
        // 5. Hardcoded default
        setChatBg("url('/background-farming.svg')")
      }
    }

    resolveAndSetBg()
  }, [uid, adminStore.appSettings])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.body.style.setProperty('--bg-image', chatBg)
    }
  }, [chatBg])

  const handleBgSelect = async (val: string) => {
    setChatBg(val)
    const storageKey = `incaptta_bg_url_${uid || 'global'}`
    localStorage.setItem(storageKey, val)
    localStorage.setItem('chat-bg', val)

    // Dispatch standard event
    window.dispatchEvent(new Event('bg-changed'))

    if (uid) {
      let rawUrl = val
      if (val.startsWith("url('") && val.endsWith("')")) {
        rawUrl = val.substring(5, val.length - 2)
      } else if (val.startsWith("url(\"") && val.endsWith("\")")) {
        rawUrl = val.substring(5, val.length - 2)
      } else if (val.startsWith("url(") && val.endsWith(")")) {
        rawUrl = val.substring(4, val.length - 1)
      }
      
      try {
        await setDoc(doc(db, 'userPreferences', uid), {
          selectedBackgroundUrl: rawUrl,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      } catch (e) {
        console.error('[Chat] Failed to sync background preference to Firestore:', e)
      }
    }
  }

  const isBgSelected = (val: string) => {
    if (chatBg === val) return true
    if (val !== 'none' && chatBg.includes(val)) return true
    return false
  }

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
    const unsubSettings = adminStore.fetchSettings(uid)
    return () => { unsubChats(); unsubUsers(); unsubSettings(); cleanup() }
  }, [uid])

  // Scroll to bottom on initial load, new messages, or when near bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const isInitialLoad = prevMessagesCount === 0 && messages.length > 0
    const lastMsg = messages[messages.length - 1]
    const hasNewMessage = messages.length > prevMessagesCount && lastMsg?.senderId === uid
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

  const initPushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !uid) return

    try {
      const messaging = await getMessagingInstance()
      if (!messaging) return

      const VAPID_KEY = 'BIL4-OFhh42v2O15bAxeCh24eLU1QkLtqAfW589t6Hj6PzCdZQcaCkDTMKwRpkx1TYjs6z7hHYRbQwn9jQ679do'
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      if (token) {
        console.log('FCM Token registered:', token)
        
        // Save FCM token directly to user profile in Firestore
        const userRef = doc(db, 'users', uid)
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(token),
          updatedAt: serverTimestamp()
        })
      }

      // Handle foreground notifications
      const { onMessage } = await import('firebase/messaging')
      onMessage(messaging, (payload) => {
        console.log('Foreground message received:', payload)
        if (payload.notification) {
          toast(payload.notification.title || 'New Message', {
            description: payload.notification.body,
          })
        }
      })
    } catch (error) {
      console.error('Failed to initialize push notifications:', error)
    }
  }

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifyPermission(Notification.permission);
      if (Notification.permission === 'granted' && uid) {
        initPushNotifications()
      }
    } else {
      setNotifyPermission('denied');
    }

    setNotifyDismissed(localStorage.getItem('chat_notify_dismissed') === 'true')
  }, [uid])

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission()
      setNotifyPermission(result)
      if (result === 'granted') {
        initPushNotifications()
      } else {
        localStorage.setItem('chat_notify_dismissed', 'true')
        setNotifyDismissed(true)
      }
    } else {
      toast.info('Notifications are not supported on this browser/device.')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File must be under 10MB')
      return
    }
    const isAllowed = ALLOWED_MIME_TYPES.some(mime => {
      if (mime.endsWith('/*')) {
        return file.type.startsWith(mime.replace('/*', '/'))
      }
      return file.type === mime
    })
    if (!isAllowed) {
      toast.error('File type not allowed. Use images, PDFs, Word, Excel, Zip, or code files.')
      return
    }
    setAttachmentFile(file)
  }

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
    if (!authUser || (!messageText.trim() && !attachmentFile)) return
    try {
      let fileData = undefined
      if (attachmentFile && activeChatId) {
        fileData = await uploadAttachment(activeChatId, attachmentFile)
      }

      const textToSend = messageText.trim() || `Shared a file: ${attachmentFile?.name || 'attachment'}`

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
      setAttachmentFile(null)
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
      if (overlayMode) return
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMessageText(value)
    setTyping(value.length > 0, uid)

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

  const handleSelectEntityType = () => {
    setOverlayMode('entity-search')
  }

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

  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const renderMessageContent = (msg: Message, isMine: boolean) => {
    type Seg =
      | { kind: 'text'; content: string }
      | { kind: 'mention'; uid: string; displayName: string }
      | { kind: 'entity'; tag: { type: string; id: string; label: string; url: string } }

    let segments: Seg[] = [{ kind: 'text', content: msg.text }]

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
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium align-baseline transition-opacity hover:opacity-75 ${
                  meta?.chipClass ?? 'bg-muted border-border text-foreground'
                }`}
              >
                {Icon && <Icon className="h-3 w-3 shrink-0" />}
                {seg.tag.label}
              </span>
            )
          }
          return <span key={i}>{(seg as any).content}</span>
        })}
      </span>
    )
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      toast.success('Signed out successfully')
    } catch (e: any) {
      toast.error('Sign out failed')
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-100 font-sans p-0 sm:p-3 select-none relative">

      {/* Main glass panel — farming SVG visible through this */}
      <div className="flex-grow flex h-full max-w-7xl mx-auto rounded-none sm:rounded-2xl overflow-hidden relative z-10 shadow-2xl glass-card"
           style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
        
        {/* Navigation / Side Toolbar (desktop only) */}
        <div className="hidden md:flex w-16 border-r border-white/[0.06] glass-surface flex-col items-center py-4 justify-between shrink-0">
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center select-none cursor-pointer shadow-lg overflow-hidden border border-slate-800"
                 style={{ boxShadow: `0 0 20px ${brandColor}40` }}>
              <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              className={`h-10 w-10 rounded-xl transition-all ${viewMode === 'chat' ? 'text-white bg-slate-800/50 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              onClick={() => setViewMode('chat')}
              title="Messages"
            >
              <MessageSquare className="h-5 w-5" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              className={`h-10 w-10 rounded-xl transition-all ${viewMode === 'vault' ? 'text-white bg-slate-800/50 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
              onClick={() => setViewMode('vault')}
              title="File Vault"
            >
              <FolderOpen className="h-5 w-5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all" onClick={() => setIsGroupDialogOpen(true)} title="Create Group">
              <Users className="h-5 w-5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all" onClick={() => setIsNewChatOpen(true)} title="Start Private Chat">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex flex-col items-center gap-4 w-full">
            <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all" onClick={() => setIsSettingsOpen(true)} title="Theme Settings">
              <Settings className="h-5 w-5" />
            </Button>
            {isInstallable && !isInstalled && (
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-xl transition-all"
                style={{ color: brandColor }}
                onClick={install}
                title="Install App"
              >
                <Download className="h-5 w-5" />
              </Button>
            )}
            <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300" title={authUser?.email || 'User'}>
              {getInitials(authUser?.displayName || authUser?.email || 'U')}
            </div>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-xl transition-all" onClick={handleSignOut} title="Sign Out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Sidebar - Chats List */}
        <div className={`w-full md:w-80 border-r border-white/[0.06] glass-surface flex flex-col ${(activeChatId || viewMode === 'vault') ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-slate-800/80 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-wide flex items-center gap-2">
                Chats
                <Sparkles className="h-4 w-4" style={{ color: brandColor }} />
              </h2>
              <Button size="icon-sm" variant="outline" className="border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300 rounded-lg" onClick={() => setIsNewChatOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search conversations..." 
                className="pl-9 h-9 text-sm bg-slate-950/40 border-slate-800 focus:border-slate-700 text-slate-200 placeholder:text-slate-500 rounded-lg w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-grow">
            <div className="p-2 space-y-1 pb-20 md:pb-2">
              {chats.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No conversations yet.<br/>Start one above!
                </div>
              ) : chats.map(chat => {
                const isGroup = chat.isGroup
                const otherParticipant = users.find(u => chat.participants?.includes(u.id) && u.id !== uid)
                const unread = chat.unreadCount?.[uid] || 0
                const isActive = chat.id === activeChatId
                const displayName = isGroup
                  ? chat.groupName || 'Group Chat'
                  : (otherParticipant?.displayName || otherParticipant?.email || 'Unknown User')
                
                return (
                  <button 
                    key={chat.id} 
                    onClick={() => { openChat(chat.id, uid); setViewMode('chat') }}
                    className={`w-full text-left p-3 rounded-xl transition-all border flex items-center gap-3 ${
                      isActive 
                        ? 'bg-slate-800/40 border-slate-700/50 shadow-inner' 
                        : 'hover:bg-slate-800/20 border-transparent'
                    }`}
                  >
                    <Avatar className="h-10 w-10 rounded-xl">
                      <AvatarFallback className="text-sm font-semibold rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                        {isGroup ? getInitials(chat.groupName || 'G') : getInitials(otherParticipant?.displayName || otherParticipant?.email || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <p className="text-sm font-medium truncate text-slate-200">{displayName}</p>
                        {chat.lastMessageAt && (
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {(() => {
                              const date = typeof chat.lastMessageAt.toDate === 'function' 
                                ? chat.lastMessageAt.toDate() 
                                : new Date(chat.lastMessageAt);
                              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            })()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate pr-4">{chat.lastMessage || 'No messages yet'}</p>
                    </div>
                    {unread > 0 && (
                      <Badge 
                        className="shrink-0 rounded-full h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1 font-bold text-slate-950 border-0"
                        style={{ backgroundColor: brandColor }}
                      >
                        {unread}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main Chat Area / File Vault */}
        {viewMode === 'vault' ? (
          <div className="flex-grow flex-1 min-w-0 h-full flex flex-col">
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
          <div className={`flex-1 flex flex-col bg-slate-900/10 min-w-0 ${activeChatId ? 'flex' : 'hidden md:flex'}`}>
          {activeChatId ? (
            <>
              {/* Active Chat Header */}
              <div className="h-16 border-b border-slate-800/80 px-4 flex items-center gap-3 shrink-0 bg-slate-900/30">
                {isStandalone && (
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="text-slate-400 hover:text-white"
                  onClick={closeChat}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                )}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <div 
                    className="flex items-center gap-3 flex-grow min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setIsSharedFilesOpen(true)}
                  >
                    <Avatar className="h-10 w-10 rounded-xl">
                      <AvatarFallback className="text-sm font-semibold rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                        {chatAvatarFallback}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate text-slate-100">{chatTitle}</h3>
                      <p className="text-[11px] text-slate-400 truncate">
                        {activeChat?.participants?.length || 0} members
                      </p>
                    </div>
                  </div>
                  {activeChat?.isGroup && (
                    <Button size="icon-xs" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-white rounded-lg flex items-center justify-center p-0 shrink-0" onClick={() => setIsGroupSettingsOpen(true)} title="Group Settings">
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="relative hidden sm:block w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <Input 
                    placeholder="Search in chat..."
                    className="pl-8 h-8 text-xs bg-slate-950/40 border-slate-800 focus:border-slate-700 text-slate-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Message Feed */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {notifyPermission === 'default' && !notifyDismissed && (
                  <div className="flex items-center justify-between gap-3 p-3 bg-slate-950/40 border border-slate-850 rounded-xl text-xs">
                    <span className="text-slate-300">Enable desktop popups for instant incoming message notifications.</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="xs" variant="outline" className="border-slate-800 bg-slate-900 text-slate-300" onClick={requestNotificationPermission}>Enable</Button>
                      <Button size="xs" variant="ghost" className="text-slate-500 hover:text-slate-300" onClick={() => { localStorage.setItem('chat_notify_dismissed', 'true'); setNotifyDismissed(true) }}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}

                {hasMoreMessages && (
                  <div className="text-center">
                    <Button variant="link" size="sm" className="text-slate-400 hover:text-slate-200" onClick={handleLoadOlder} disabled={loading}>
                      {loading ? 'Loading history...' : 'Load older messages'}
                    </Button>
                  </div>
                )}

                <div className="space-y-1">
                  {filteredMessages.map((msg, i) => {
                    const isMine = msg.senderId === uid
                    const isHovered = hoveredMessageId === msg.id
                    const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0

                    // ── Consecutive message grouping ──────────────────────────
                    // Group messages from same sender within 3 minutes (180s)
                    const prevMsg = i > 0 ? filteredMessages[i - 1] : null
                    const prevTime = prevMsg?.createdAt?.toMillis?.() || (prevMsg?.createdAt ? new Date(prevMsg.createdAt).getTime() : 0)
                    const currTime = msg.createdAt?.toMillis?.() || (msg.createdAt ? new Date(msg.createdAt).getTime() : 0)
                    const isGrouped = prevMsg && prevMsg.senderId === msg.senderId && (currTime - prevTime) < 180000 && !!msg.createdAt

                    // ── Delivery / Read status ────────────────────────────────
                    const isSending = isMine && !msg.createdAt
                    const otherReaders = isMine ? Object.keys(msg.readBy || {}).filter(id => id !== uid) : []
                    const isSeen = isMine && msg.createdAt && otherReaders.length > 0

                    return (
                      <div 
                        key={msg.id || i} 
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${isGrouped ? 'mt-1' : 'mt-3'}`}
                        onMouseEnter={() => setHoveredMessageId(msg.id || null)}
                        onMouseLeave={() => { setHoveredMessageId(null); setReactionPickerMsgId(null) }}
                      >
                        {msg.replyTo && (
                          <div className="max-w-[75%] text-[10px] px-2 py-1 rounded-t-lg bg-slate-850/80 border-l border-slate-700 italic text-slate-400 mb-0.5 truncate">
                            Replying to {msg.replyTo.senderName}: &ldquo;{msg.replyTo.textPreview}&rdquo;
                          </div>
                        )}
                        <div className="relative max-w-[75%] flex gap-2">
                          <div 
                            className={`rounded-2xl px-4 py-2.5 border text-sm transition-all shadow-md relative ${
                              isMine 
                                ? 'rounded-tr-none text-slate-950' 
                                : 'rounded-tl-none text-slate-100 bg-slate-800/60 border-slate-700/50'
                            }`}
                            style={isMine ? {
                              backgroundColor: brandColor,
                              borderColor: `${brandColor}30`,
                            } : undefined}
                          >
                            {!isMine && !isGrouped && <p className="text-[10px] font-bold tracking-wide text-slate-300 mb-1">{msg.senderName}</p>}
                            
                            {msg.attachment && (
                              <AttachmentMessageCard 
                                attachment={msg.attachment} 
                                onPreview={(url, name) => {
                                  setPreviewUrl(url)
                                  setPreviewTitle(name)
                                  setIsPreviewOpen(true)
                                }}
                              />
                            )}

                            <p className="leading-relaxed select-text">{renderMessageContent(msg, isMine)}</p>

                            {/* JobCard structured message cards */}
                            {msg.entityTags?.filter(t => t.type === 'job_card').map(tag => (
                              <JobCardMessageCard key={tag.id} tag={tag} brandColor={brandColor} />
                            ))}
                            
                            <div className="flex items-center justify-end gap-1.5 mt-1.5 select-none">
                              <span className={`text-[9px] ${isMine ? 'text-slate-800/70' : 'text-slate-400/60'}`}>
                                {msg.createdAt?.toDate?.()?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) || 'Sending...'}
                              </span>
                              {isMine && (
                                isSending ? (
                                  <Clock className="h-3 w-3 text-slate-800/60" />
                                ) : isSeen ? (
                                  <CheckCheck className="h-3.5 w-3.5" style={{ color: `color-mix(in srgb, ${brandColor} 35%, #000)` }} />
                                ) : (
                                  <CheckCheck className="h-3.5 w-3.5 text-slate-800/50" />
                                )
                              )}
                            </div>
                          </div>

                          {/* Hover Overlay Actions */}
                          {isHovered && (
                            <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-full px-2 py-0.5 shadow-xl z-20`}>
                              <button className="p-1 hover:bg-slate-850 text-slate-400 hover:text-white rounded-full transition-all" onClick={() => setReplyTarget(msg)} title="Reply">
                                <Reply className="h-3 w-3" />
                              </button>
                              <button className="p-1 hover:bg-slate-850 text-slate-400 hover:text-white rounded-full transition-all" onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : (msg.id || null))} title="React">
                                <Smile className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {/* Emoji reaction picker */}
                          {reactionPickerMsgId === msg.id && (
                            <div className={`absolute -top-12 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-full px-2 py-1 shadow-2xl z-30`}>
                              {REACTION_EMOJIS.map(emoji => (
                                <button key={emoji} className="p-1 hover:bg-slate-800 text-lg rounded-full transition-all hover:scale-125" onClick={() => handleReaction(msg.id!, emoji)}>
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Active reactions list */}
                        {hasReactions && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions || {}).map(([emoji, userIds]) => (
                              <button 
                                key={emoji} 
                                onClick={() => handleReaction(msg.id!, emoji)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border transition-all ${
                                  userIds.includes(uid) 
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                                }`}
                              >
                                <span>{emoji}</span>
                                <span>{userIds.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Optimistic upload bubble — shows progress while uploading */}
                {uploading && (
                  <div className="flex flex-col items-end mt-3">
                    <div
                      className="rounded-2xl rounded-tr-none px-4 py-3 border text-sm shadow-md relative max-w-[75%]"
                      style={{
                        backgroundColor: brandColor,
                        borderColor: `${brandColor}30`,
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-950/70" />
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <p className="text-xs font-semibold text-slate-950">
                            Uploading attachment... {uploadProgress}%
                          </p>
                          <div className="h-1.5 bg-slate-950/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-950/50 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input Area */}
              <div className="border-t border-slate-800/85 p-4 bg-slate-950/20 shrink-0">
                <div className="h-6 px-1 text-[11px] text-slate-400 select-none">
                  {activeTypists.length === 1 && `${activeTypists[0]} is typing...`}
                  {activeTypists.length === 2 && `${activeTypists[0]} and ${activeTypists[1]} are typing...`}
                  {activeTypists.length > 2 && 'Several people are typing...'}
                </div>

                {replyTarget && (
                  <div className="flex items-center justify-between gap-2 p-2 bg-slate-950/60 border border-slate-850 rounded-xl text-xs text-slate-400 mb-2">
                    <div className="flex items-center gap-2 truncate">
                      <Reply className="h-3.5 w-3.5 text-slate-500" />
                      <span>Replying to <strong>{replyTarget.senderName}</strong>: &ldquo;{replyTarget.text}&rdquo;</span>
                    </div>
                    <button onClick={() => setReplyTarget(null)} className="p-0.5 hover:bg-slate-850 rounded text-slate-500 hover:text-slate-300">
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>
                )}

                {attachmentFile && (
                  <div className="flex items-center justify-between gap-2 p-2 bg-slate-950/60 border border-slate-850 rounded-xl text-xs text-slate-400 mb-2">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span>{attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    {uploading ? (
                      <span className="text-[10px] text-emerald-400 font-medium">Uploading: {uploadProgress}%</span>
                    ) : (
                      <button onClick={() => { setAttachmentFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} className="p-0.5 hover:bg-slate-850 rounded text-slate-500 hover:text-slate-300">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="relative flex gap-2 items-center">
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
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.tar,.js,.json,.html,.css"
                    onChange={handleFileSelect}
                    disabled={uploading}
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-10 w-10 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl"
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
                    <AtSign className="h-5 w-5" />
                  </Button>
                  <Input 
                    ref={inputRef}
                    value={messageText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={uploading ? 'Uploading attachment...' : 'Write your message, @ to mention, / to link details...'}
                    className="flex-1 h-10 bg-slate-950/60 border-slate-800 focus:border-slate-700 text-slate-200 placeholder:text-slate-650 rounded-xl text-sm"
                    disabled={uploading}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={(!messageText.trim() && !attachmentFile) || uploading}
                    className="h-10 px-4 rounded-xl text-slate-950 font-semibold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:translate-y-px transition-all"
                    style={{ backgroundColor: brandColor }}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center p-8 select-none">
              <div className="max-w-md text-center flex flex-col items-center">
                <div className="h-16 w-16 rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-2xl mb-6">
                  <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
                </div>
                <h2 className="text-xl font-bold tracking-wide mb-2 text-slate-200">Standalone Chat Module</h2>
                <p className="text-sm text-slate-500 leading-relaxed mb-6">
                  Securely synced real-time chat with direct linkages to project management job cards, quotes, customers, and staff. Select a channel or user to start messaging.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl h-10 px-6" onClick={() => setIsNewChatOpen(true)}>
                    Start Chat
                  </Button>
                  <Button className="rounded-xl h-10 px-6 text-slate-950 font-semibold" style={{ backgroundColor: brandColor }} onClick={() => setIsGroupDialogOpen(true)}>
                    Create Group
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Mobile Bottom Navigation Bar (only when viewing chats list) */}
      {!activeChatId && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 z-50 flex items-center justify-around px-2 glass-surface border-t border-white/[0.06]">
          <button
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors flex-1 h-full ${
              viewMode === 'chat' ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setViewMode('chat')}
            title="Messages"
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] font-medium">Chats</span>
          </button>
          <button
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors flex-1 h-full ${
              viewMode === 'vault' ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setViewMode('vault')}
            title="File Vault"
          >
            <FolderOpen className="h-5 w-5" />
            <span className="text-[9px] font-medium">Vault</span>
          </button>
          <button
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-white transition-colors flex-1 h-full"
            onClick={() => setIsGroupDialogOpen(true)}
            title="Create Group"
          >
            <Users className="h-5 w-5" />
            <span className="text-[9px] font-medium">Group</span>
          </button>
          <button
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-white transition-colors flex-1 h-full"
            onClick={() => setIsNewChatOpen(true)}
            title="Start Chat"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[9px] font-medium">New Chat</span>
          </button>
          <button
            className="flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-white transition-colors flex-1 h-full"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <Settings className="h-5 w-5" />
            <span className="text-[9px] font-medium">Settings</span>
          </button>
        </div>
      )}

      {/* New Private Chat Dialog */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl max-w-sm p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-wide text-slate-100">Start Conversation</DialogTitle>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <p className="text-xs text-slate-400">Select an active user from the roster:</p>
            <ScrollArea className="h-60 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
              <div className="space-y-1">
                {users.map(u => (
                  <button 
                    key={u.id} 
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                      selectedUserId === u.id 
                        ? 'bg-slate-800 text-slate-200 font-semibold' 
                        : 'hover:bg-slate-850/60 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="text-xs font-medium rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                        {getInitials(u.displayName || u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-xs truncate">{u.displayName || 'User'}</p>
                      <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                    </div>
                    {selectedUserId === u.id && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="border-slate-850 bg-slate-950 text-slate-400 hover:text-white rounded-xl h-9" onClick={() => setIsNewChatOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl h-9 text-slate-950 font-semibold" style={{ backgroundColor: brandColor }} onClick={handleNewChat} disabled={!selectedUserId}>
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl max-w-sm p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-wide text-slate-100">Create Group Chat</DialogTitle>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Group Name</p>
              <Input 
                value={groupName} 
                onChange={(e) => setGroupName(e.target.value)} 
                placeholder="Enter group name..." 
                className="bg-slate-950/60 border-slate-800 focus:border-slate-700 text-slate-200 placeholder:text-slate-650 h-9 rounded-xl text-xs w-full"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Add Members</p>
              <ScrollArea className="h-44 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
                <div className="space-y-1">
                  {users.map(u => (
                    <button 
                      key={u.id} 
                      onClick={() => {
                        setGroupMembers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])
                      }}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                        groupMembers.includes(u.id) 
                          ? 'bg-slate-800 text-slate-200 font-semibold' 
                          : 'hover:bg-slate-850/60 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="text-xs font-medium rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                          {getInitials(u.displayName || u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-xs truncate">{u.displayName || 'User'}</p>
                        <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                      </div>
                      {groupMembers.includes(u.id) && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="border-slate-850 bg-slate-950 text-slate-400 hover:text-white rounded-xl h-9" onClick={() => setIsGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl h-9 text-slate-950 font-semibold" style={{ backgroundColor: brandColor }} onClick={handleCreateGroup} disabled={!groupName.trim() || groupMembers.length === 0}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (Theme Selector) */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl max-w-sm p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-wide text-slate-100">Chat Settings</DialogTitle>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-350">Default / Gradient Backgrounds</p>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  className={`h-9 text-xs rounded-xl border-slate-800 ${isBgSelected('/background-farming.svg') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950/40 text-slate-400'}`}
                  onClick={() => handleBgSelect("url('/background-farming.svg')")}
                >
                  Default (Farming)
                </Button>
                <Button 
                  variant="outline" 
                  className={`h-9 text-xs rounded-xl border-slate-800 ${isBgSelected('none') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950/40 text-slate-400'}`}
                  onClick={() => handleBgSelect("none")}
                >
                  Minimalist Slate
                </Button>
                <Button 
                  variant="outline" 
                  className={`h-9 text-xs rounded-xl border-slate-800 ${isBgSelected('#090514') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950/40 text-slate-400'}`}
                  onClick={() => handleBgSelect("linear-gradient(135deg, #090514 0%, #0d0d2b 100%)")}
                >
                  Cosmic Purple
                </Button>
                <Button 
                  variant="outline" 
                  className={`h-9 text-xs rounded-xl border-slate-800 ${isBgSelected('#021a0d') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950/40 text-slate-400'}`}
                  onClick={() => handleBgSelect("linear-gradient(135deg, #021a0d 0%, #0b0f19 100%)")}
                >
                  Forest Green
                </Button>
                <Button 
                  variant="outline" 
                  className={`h-9 text-xs rounded-xl border-slate-800 ${isBgSelected('#021526') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950/40 text-slate-400'}`}
                  onClick={() => handleBgSelect("linear-gradient(135deg, #021526 0%, #030a16 100%)")}
                >
                  Deep Ocean
                </Button>
              </div>
            </div>

            {/* Admin Gallery Wallpapers */}
            {Array.isArray(adminStore.appSettings?.backgroundImages) && adminStore.appSettings.backgroundImages.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-850">
                <p className="text-xs font-medium text-slate-350 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: brandColor }} />
                  Admin Uploaded Wallpapers
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {(adminStore.appSettings.backgroundImages as any[]).map((img, idx) => {
                    const imgUrlVal = `url('${img.url}')`
                    const isSelected = isBgSelected(img.url)
                    return (
                      <Button 
                        key={img.url || idx}
                        variant="outline" 
                        className={`h-12 text-xs rounded-xl border-slate-800 relative overflow-hidden group ${isSelected ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 ring-1 ring-emerald-500/30' : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'}`}
                        onClick={() => handleBgSelect(imgUrlVal)}
                      >
                        <img src={img.url} alt={img.name} className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:opacity-50 group-hover:scale-105 transition-all duration-300" />
                        <span className="relative z-10 truncate w-full text-center px-1 font-medium text-white drop-shadow-md">{img.name || `Wallpaper ${idx + 1}`}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t border-slate-850">
              <p className="text-xs font-medium text-slate-350">Custom Image URL</p>
              <div className="flex gap-2">
                <Input 
                  value={customBgUrl} 
                  onChange={(e) => setCustomBgUrl(e.target.value)} 
                  placeholder="https://example.com/image.jpg" 
                  className="bg-slate-950/60 border-slate-800 focus:border-slate-700 text-slate-200 placeholder:text-slate-650 h-9 rounded-xl text-xs flex-1"
                />
                <Button 
                  className="rounded-xl h-9 text-slate-950 font-semibold text-xs px-3" 
                  style={{ backgroundColor: brandColor }}
                  onClick={() => {
                    if (customBgUrl.trim()) {
                      const val = `url('${customBgUrl.trim()}')`
                      handleBgSelect(val)
                      toast.success('Applied custom background')
                    }
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-850">
              <Button 
                variant="destructive" 
                className="w-full rounded-xl h-9 text-xs font-semibold flex items-center justify-center gap-1.5 bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-950 hover:text-white"
                onClick={() => {
                  setIsSettingsOpen(false)
                  handleSignOut()
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button className="rounded-xl h-9 text-slate-950 font-semibold w-full" style={{ backgroundColor: brandColor }} onClick={() => setIsSettingsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Settings / Administration Dialog */}
      <Dialog open={isGroupSettingsOpen} onOpenChange={setIsGroupSettingsOpen}>
        <DialogContent className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl max-w-sm p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-wide text-slate-100">Group Settings</DialogTitle>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Group Name: <span className="text-slate-100 font-semibold">{activeChat?.groupName}</span></p>
              <p className="text-[11px] text-slate-400">Created by: {users.find(u => u.id === activeChat?.createdBy)?.displayName || 'Unknown'}</p>
            </div>
            
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-300">Members ({activeChat?.participants?.length})</p>
              <ScrollArea className="h-40 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
                <div className="space-y-1">
                  {activeChat?.participants?.map(pId => {
                    const member = users.find(u => u.id === pId) || (pId === uid ? authUser : null);
                    const memberName = member?.displayName || member?.email || 'User';
                    const isAdmin = activeChat?.admins?.includes(pId);
                    const isSelfAdmin = activeChat?.admins?.includes(uid);
                    return (
                      <div key={pId} className="flex items-center justify-between p-1.5 rounded hover:bg-slate-900/30 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <Avatar className="h-6 w-6 rounded-md">
                            <AvatarFallback className="text-[10px]" style={{ backgroundColor: `color-mix(in srgb, ${brandColor} 12%, transparent)`, color: brandColor }}>
                              {getInitials(memberName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-slate-200">{memberName} {pId === uid && '(You)'}</span>
                          {isAdmin && <Badge className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0 rounded ml-1">Admin</Badge>}
                        </div>
                        {isSelfAdmin && pId !== uid && (
                          <Button 
                            size="icon-xs" 
                            variant="ghost" 
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/30 h-6 w-6" 
                            onClick={async () => {
                              if (confirm(`Remove ${memberName} from the group?`) && activeChatId) {
                                await removeGroupMember(activeChatId, pId)
                                toast.success('Member removed')
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Admin actions: Add members */}
            {activeChat?.admins?.includes(uid) && (
              <div className="space-y-1.5 border-t border-slate-850 pt-3">
                <p className="text-xs font-medium text-slate-305">Add Member</p>
                <div className="flex gap-2">
                  <select
                    value={selectedNewMemberId}
                    onChange={(e) => setSelectedNewMemberId(e.target.value)}
                    className="flex-1 h-9 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-700"
                  >
                    <option value="">Select a user...</option>
                    {users
                      .filter(u => !activeChat?.participants?.includes(u.id))
                      .map(u => (
                        <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                          {u.displayName || u.email}
                        </option>
                      ))}
                  </select>
                  <Button
                    className="rounded-xl h-9 text-slate-950 font-semibold text-xs px-3"
                    style={{ backgroundColor: brandColor }}
                    disabled={!selectedNewMemberId}
                    onClick={async () => {
                      if (activeChatId) {
                        await addGroupMember(activeChatId, selectedNewMemberId)
                        setSelectedNewMemberId("")
                        toast.success("Member added successfully")
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-2 border-t border-slate-850 pt-3">
            {activeChat?.admins?.includes(uid) ? (
              <Button
                variant="destructive"
                className="rounded-xl h-9 text-red-300 font-semibold w-full bg-red-950/20 border border-red-500/20 hover:bg-red-950/40 text-xs"
                onClick={async () => {
                  if (confirm("Are you sure you want to delete this group? This cannot be undone.") && activeChatId) {
                    await deleteGroupChat(activeChatId)
                    setIsGroupSettingsOpen(false)
                    toast.success("Group deleted")
                  }
                }}
              >
                Delete Group
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="rounded-xl h-9 text-red-400 font-semibold w-full bg-red-950/20 border border-red-500/20 hover:bg-red-950/40 text-xs"
                onClick={async () => {
                  if (confirm("Leave this group?") && activeChatId) {
                    await removeGroupMember(activeChatId, uid)
                    closeChat()
                    setIsGroupSettingsOpen(false)
                    toast.success("Left group")
                  }
                }}
              >
                Leave Group
              </Button>
            )}
            <Button variant="outline" className="border-slate-850 bg-slate-950 text-slate-400 hover:text-white rounded-xl h-9 w-full text-xs" onClick={() => setIsGroupSettingsOpen(false)}>
              Close
            </Button>
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
