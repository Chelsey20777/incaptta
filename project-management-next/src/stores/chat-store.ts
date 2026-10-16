'use client'

import { create } from 'zustand'
import { db, storage } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
  orderBy,
  where,
  updateDoc,
  limit,
  getDoc,
  getDocs,
  increment,
  endBefore,
  limitToLast,
  deleteField,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'

export interface ChatAttachment {
  url: string
  name: string
  type: string
  size: number
}

export interface Message {
  id?: string
  senderId: string
  senderName: string
  text: string
  createdAt: any
  readBy?: Record<string, any>
  reactions?: Record<string, string[]>
  replyTo?: {
    messageId: string
    senderName: string
    textPreview: string
  }
  /** Legacy single-attachment field (still written as the first file for vault queries). */
  attachment?: ChatAttachment
  /** Multi-file attachments on a single message. Prefer this when rendering. */
  attachments?: ChatAttachment[]
  mentions?: Array<{ uid: string; displayName: string }>
  entityTags?: Array<{ type: string; id: string; label: string; url: string }>
}

/** Normalize legacy `attachment` + newer `attachments[]` into one list. */
export function getMessageAttachments(msg: Pick<Message, 'attachment' | 'attachments'>): ChatAttachment[] {
  if (msg.attachments?.length) return msg.attachments
  if (msg.attachment) return [msg.attachment]
  return []
}

export interface Chat {
  id: string
  participants: string[]
  lastMessage?: string
  lastMessageAt?: any
  unreadCount: Record<string, number>
  typing?: Record<string, any>
  isGroup?: boolean
  groupName?: string
  groupAvatar?: string
  createdBy?: string
  admins?: string[]
  /** 'mbdi' for initiative-linked group chats */
  type?: 'mbdi' | string
  mbdiInitiativeId?: string
}

export interface VaultFile {
  id: string
  chatId: string
  chatTitle: string
  senderId: string
  senderName: string
  createdAt: any
  url: string
  name: string
  type: string
  size: number
}

interface ChatState {
  chats: Chat[]
  activeChatId: string | null
  isChatOpen: boolean
  messages: Message[]
  loading: boolean
  hasMoreMessages: boolean
  sendError: string | null

  // Vault state
  vaultFiles: VaultFile[]
  loadingVault: boolean
  fetchVaultFiles: (uid: string, usersList: any[]) => Promise<void>

  subscriptions: (() => void)[]
  typingTimeout: any | null
  oldestMessageDoc: any | null
  // Older history kept outside the live listener window (pagination + evicted docs)
  olderMessages: Message[]
  replyTarget: Message | null
  searchQuery: string
  uploadProgress: number
  uploading: boolean
  activeMessageUnsubscribe: (() => void) | null

  fetchChats: (uid: string) => () => void
  openChat: (chatId: string, uid: string) => () => void
  closeChat: () => void
  loadMoreMessages: (uid: string) => Promise<void>
  startPrivateChat: (otherUserId: string, uid: string) => Promise<string | null>
  createGroupChat: (groupName: string, participants: string[], uid: string) => Promise<string | null>
  /** Deterministic get-or-create for an MBDI initiative group chat (`mbdi_{initiativeId}`). */
  getOrCreateMbdiChat: (
    initiativeId: string,
    meta: {
      groupName: string
      ownerUid?: string | null
      extraParticipantUids?: string[]
    },
    uid: string
  ) => Promise<string | null>
  addGroupMember: (chatId: string, userId: string) => Promise<void>
  removeGroupMember: (chatId: string, userId: string) => Promise<void>
  sendMessage: (text: string, user: { uid: string; displayName?: string; email?: string }, replyTarget?: Message | null, attachment?: ChatAttachment | ChatAttachment[], mentions?: Array<{uid: string; displayName: string}>, entityTags?: Array<{type: string; id: string; label: string; url: string}>) => Promise<void>
  markAsRead: (chatId: string, uid: string) => Promise<void>
  markMessageRead: (chatId: string, messageId: string, uid: string) => Promise<void>
  addReaction: (chatId: string, messageId: string, emoji: string, uid: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setReplyTarget: (msg: Message | null) => void
  setTyping: (isTyping: boolean, uid: string) => Promise<void>
  setChatOpen: (isOpen: boolean) => void
  uploadAttachment: (chatId: string, file: File) => Promise<ChatAttachment>
  uploadAttachments: (chatId: string, files: File[]) => Promise<ChatAttachment[]>
  cleanup: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  isChatOpen: false,
  messages: [],
  loading: false,
  hasMoreMessages: false,
  sendError: null,

  // Vault initial state
  vaultFiles: [],
  loadingVault: false,

  subscriptions: [],
  typingTimeout: null,
  oldestMessageDoc: null,
  olderMessages: [],
  replyTarget: null,
  searchQuery: '',
  uploadProgress: 0,
  uploading: false,
  activeMessageUnsubscribe: null,

  setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),

  fetchChats: (uid) => {
    if (!uid) return () => { }
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', uid)
    )

    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedChats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat))
      const sorted = fetchedChats.sort((a, b) => {
        const timeA = a.lastMessageAt?.toMillis?.() || 0
        const timeB = b.lastMessageAt?.toMillis?.() || 0
        return timeB - timeA
      })
      set({ chats: sorted })
    }, (error) => {
      console.error('Chat fetch error:', error)
    })

    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  openChat: (chatId, uid) => {
    // 1. Unsubscribe from the previous active message listener first
    const currentUnsub = get().activeMessageUnsubscribe
    if (currentUnsub) {
      currentUnsub()
    }

    set({
      activeChatId: chatId,
      messages: [],
      olderMessages: [],
      hasMoreMessages: false,
      oldestMessageDoc: null
    })

    // Listen to the NEWEST 50 messages so new arrivals always enter the window,
    // regardless of how long the conversation is. Older history is loaded on demand.
    const q = query(
      collection(db, `chats/${chatId}/messages`),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsub = onSnapshot(q, (snapshot) => {
      // 2. Ensure we only set messages if this snapshot matches the active chat ID
      if (get().activeChatId !== chatId) {
        unsub()
        return
      }

      const previousMessages = get().messages
      // Snapshot is newest-first; reverse to chronological order for rendering
      const windowMessages = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Message))
        .reverse()

      set((state) => {
        // Messages that slid out of the live window (window advanced past them)
        // are kept as older history so they don't vanish mid-conversation.
        const windowIds = new Set(windowMessages.map(m => m.id))
        const olderIds = new Set(state.olderMessages.map(m => m.id))
        const evicted = state.messages.filter(m =>
          m.id && !windowIds.has(m.id) && !olderIds.has(m.id)
        )
        const olderMessages = evicted.length
          ? [...state.olderMessages, ...evicted]
          : state.olderMessages

        const updates: Partial<ChatState> = {
          olderMessages,
          messages: [...olderMessages, ...windowMessages]
        }

        // Set the pagination cursor once, when the window first saturates.
        // loadMoreMessages takes over cursor management afterwards.
        if (!state.oldestMessageDoc) {
          if (snapshot.docs.length >= 50) {
            updates.hasMoreMessages = true
            updates.oldestMessageDoc = snapshot.docs[snapshot.docs.length - 1]
          } else {
            updates.hasMoreMessages = false
          }
        }
        return updates
      })

      // Browser notification for new incoming messages
      if (previousMessages.length > 0) {
        windowMessages.forEach(msg => {
          const existing = previousMessages.find(m => m.id === msg.id)
          if (!existing && msg.senderId !== uid) {
            if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted' && document.visibilityState === 'hidden') {
              try {
                new window.Notification(msg.senderName, {
                  body: msg.text,
                  icon: '/favicon.ico'
                })
              } catch (e) {
                // Notification not supported
              }
            }
          }
        })
      }

      get().markAsRead(chatId, uid)
    }, (error) => {
      console.error(`Message listener error for chat ${chatId}:`, error)
      set({ sendError: 'Could not load messages. Please refresh or check your access.' })
    })

    set({ activeMessageUnsubscribe: unsub })
    return unsub
  },

  closeChat: () => {
    const currentUnsub = get().activeMessageUnsubscribe
    if (currentUnsub) {
      currentUnsub()
    }
    set({
      activeChatId: null,
      messages: [],
      olderMessages: [],
      activeMessageUnsubscribe: null,
      replyTarget: null
    })
  },

  loadMoreMessages: async (uid) => {
    const { activeChatId, oldestMessageDoc, hasMoreMessages } = get()
    if (!activeChatId || !oldestMessageDoc || !hasMoreMessages) return
    set({ loading: true })

    try {
      // Fetch the 50 messages immediately preceding the oldest one we have
      const q = query(
        collection(db, `chats/${activeChatId}/messages`),
        orderBy('createdAt', 'asc'),
        endBefore(oldestMessageDoc),
        limitToLast(50)
      )

      const snapshot = await getDocs(q)
      const fetchedOlder = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message))

      set((state) => ({
        olderMessages: [...fetchedOlder, ...state.olderMessages],
        messages: [...fetchedOlder, ...state.messages],
        hasMoreMessages: snapshot.docs.length >= 50,
        oldestMessageDoc: snapshot.docs.length > 0 ? snapshot.docs[0] : state.oldestMessageDoc
      }))
    } finally {
      set({ loading: false })
    }
  },

  startPrivateChat: async (otherUserId, uid) => {
    if (!uid) return null

    try {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', uid)
      )

      const snapshot = await getDocs(q)
      const existingChat = snapshot.docs.find(d => {
        const data = d.data()
        const participants = data.participants as string[]
        return !data.isGroup && participants.length === 2 && participants.includes(otherUserId)
      })

      if (existingChat) {
        get().openChat(existingChat.id, uid)
        return existingChat.id
      }

      // Deterministic DM ID: both users always resolve to the same chat document,
      // preventing duplicate parallel conversations when both start a chat at once.
      const dmChatId = [uid, otherUserId].sort().join('_')
      await setDoc(doc(db, 'chats', dmChatId), {
        participants: [uid, otherUserId],
        admins: [uid],
        createdBy: uid,
        lastMessageAt: serverTimestamp(),
        unreadCount: {
          [uid]: 0,
          [otherUserId]: 0
        },
        isGroup: false
      })

      get().openChat(dmChatId, uid)
      return dmChatId
    } catch (e: any) {
      console.error('Failed to start private chat:', e)
      set({ sendError: e?.message || 'Failed to start chat. Please try again.' })
      return null
    }
  },

  createGroupChat: async (groupName, participants, uid) => {
    if (!uid) return null
    try {
      const newChatRef = await addDoc(collection(db, 'chats'), {
        participants,
        groupName,
        isGroup: true,
        createdBy: uid,
        admins: [uid],
        lastMessageAt: serverTimestamp(),
        unreadCount: participants.reduce((acc, pId) => ({ ...acc, [pId]: 0 }), {})
      })
      get().openChat(newChatRef.id, uid)
      return newChatRef.id
    } catch (e: any) {
      console.error('Failed to create group chat:', e)
      return null
    }
  },

  getOrCreateMbdiChat: async (initiativeId, meta, uid) => {
    if (!uid || !initiativeId) return null
    const chatId = `mbdi_${initiativeId}`
    try {
      const chatRef = doc(db, 'chats', chatId)
      const snap = await getDoc(chatRef)

      if (snap.exists()) {
        const data = snap.data()
        const participants: string[] = Array.isArray(data.participants) ? data.participants : []
        // Ensure current user (and owner) can participate
        const toAdd = [uid, meta.ownerUid, ...(meta.extraParticipantUids || [])]
          .filter((id): id is string => !!id && !participants.includes(id))
        if (toAdd.length > 0) {
          const patch: Record<string, unknown> = {
            participants: arrayUnion(...toAdd),
          }
          for (const id of toAdd) {
            patch[`unreadCount.${id}`] = 0
          }
          await updateDoc(chatRef, patch)
        }
        get().openChat(chatId, uid)
        return chatId
      }

      const participants = Array.from(
        new Set(
          [uid, meta.ownerUid, ...(meta.extraParticipantUids || [])].filter(
            (id): id is string => !!id
          )
        )
      )

      await setDoc(chatRef, {
        type: 'mbdi',
        mbdiInitiativeId: initiativeId,
        isGroup: true,
        groupName: meta.groupName || 'MBDI Initiative',
        participants,
        createdBy: uid,
        admins: [uid],
        lastMessageAt: serverTimestamp(),
        unreadCount: participants.reduce(
          (acc, pId) => ({ ...acc, [pId]: 0 }),
          {} as Record<string, number>
        ),
      })

      get().openChat(chatId, uid)
      return chatId
    } catch (e: any) {
      console.error('Failed to get/create MBDI chat:', e)
      set({ sendError: e?.message || 'Failed to open initiative chat.' })
      return null
    }
  },

  addGroupMember: async (chatId, userId) => {
    const chatRef = doc(db, 'chats', chatId)
    await updateDoc(chatRef, {
      participants: arrayUnion(userId),
      [`unreadCount.${userId}`]: 0
    })
  },

  removeGroupMember: async (chatId, userId) => {
    const chatRef = doc(db, 'chats', chatId)
    await updateDoc(chatRef, {
      participants: arrayRemove(userId),
      [`unreadCount.${userId}`]: deleteField()
    })
  },

  sendMessage: async (text, user, replyTarget, attachment, mentions, entityTags) => {
    const { activeChatId, chats } = get()
    if (!activeChatId || !user?.uid) return
    set({ sendError: null })

    const chatId = activeChatId
    const messageData: any = {
      senderId: user.uid,
      senderName: user.displayName || user.email || 'Anonymous',
      text,
      createdAt: serverTimestamp()
    }

    if (attachment) {
      const list = Array.isArray(attachment) ? attachment : [attachment]
      if (list.length > 0) {
        // Always set singular `attachment` (first file) so existing vault
        // queries on `attachment != null` keep working.
        messageData.attachment = list[0]
        if (list.length > 1) messageData.attachments = list
      }
    }
    if (mentions?.length) messageData.mentions = mentions
    if (entityTags?.length) messageData.entityTags = entityTags

    if (replyTarget) {
      messageData.replyTo = {
        messageId: replyTarget.id,
        senderName: replyTarget.senderName,
        textPreview: replyTarget.text
      }
    }

    try {
      await addDoc(collection(db, `chats/${chatId}/messages`), messageData)

      // Resolve participants from the authoritative chat document rather than the
      // in-memory list. The local `chats` array can be empty or stale (e.g. right
      // after starting a new chat, before the fetchChats snapshot arrives), which
      // would otherwise skip the unread-count increment and leave recipients'
      // badges stuck at zero.
      let participants = chats.find(c => c.id === chatId)?.participants || []
      if (participants.length === 0) {
        const freshChat = await getDoc(doc(db, 'chats', chatId))
        participants = (freshChat.data()?.participants as string[]) || []
      }

      const updates: Record<string, any> = {
        lastMessage: text.length > 120 ? text.substring(0, 120) + '…' : text,
        lastMessageAt: serverTimestamp()
      }

      participants.forEach(pId => {
        if (pId !== user?.uid) {
          updates[`unreadCount.${pId}`] = increment(1)
        }
      })

      updates[`typing.${user.uid}`] = deleteField()

      await updateDoc(doc(db, 'chats', chatId), updates)
    } catch (e: any) {
      set({ sendError: e?.message || 'Failed to send message. Please try again.' })
      throw e
    }
  },

  markAsRead: async (chatId, uid) => {
    if (!uid) return
    const localChat = get().chats.find(c => c.id === chatId)

    // When the chat is present locally (the usual case on the chat page, where
    // fetchChats keeps it live), trust it to avoid an extra read on every
    // incoming-message snapshot.
    if (localChat) {
      if ((localChat.unreadCount?.[uid] || 0) > 0) {
        await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${uid}`]: 0 })
      }
      return
    }

    // Chat not yet in local state (e.g. opened before the list loaded): fall back
    // to the authoritative document so the badge still clears.
    const freshChat = await getDoc(doc(db, 'chats', chatId))
    const unread = (freshChat.data()?.unreadCount as Record<string, number>)?.[uid] || 0
    if (unread > 0) {
      await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${uid}`]: 0 })
    }
  },

  markMessageRead: async (chatId, messageId, uid) => {
    const msgRef = doc(db, `chats/${chatId}/messages`, messageId)
    await updateDoc(msgRef, {
      [`readBy.${uid}`]: serverTimestamp()
    })
  },

  addReaction: async (chatId, messageId, emoji, uid) => {
    const msgRef = doc(db, `chats/${chatId}/messages`, messageId)
    const messages = get().messages
    const msg = messages.find(m => m.id === messageId)
    const currentReactions = msg?.reactions?.[emoji] || []

    if (currentReactions.includes(uid)) {
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: arrayRemove(uid)
      })
    } else {
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: arrayUnion(uid)
      })
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setReplyTarget: (msg) => set({ replyTarget: msg }),

  uploadAttachment: async (chatId, file) => {
    set({ uploading: true, uploadProgress: 0 })
    try {
      const fileRef = ref(storage, `chats/${chatId}/attachments/${crypto.randomUUID()}-${file.name}`)
      const uploadTask = uploadBytesResumable(fileRef, file)

      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            set({ uploadProgress: progress })
          },
          (error) => {
            set({ uploading: false, uploadProgress: 0 })
            reject(error)
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref)
              const fileData = { url, name: file.name, type: file.type, size: file.size }
              set({ uploading: false, uploadProgress: 0 })
              resolve(fileData)
            } catch (err) {
              set({ uploading: false, uploadProgress: 0 })
              reject(err)
            }
          }
        )
      })
    } catch (e: any) {
      set({ uploading: false, uploadProgress: 0 })
      throw e
    }
  },

  uploadAttachments: async (chatId, files) => {
    if (!files.length) return []
    if (files.length === 1) return [await get().uploadAttachment(chatId, files[0])]

    set({ uploading: true, uploadProgress: 0 })
    const results: ChatAttachment[] = []
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileRef = ref(storage, `chats/${chatId}/attachments/${crypto.randomUUID()}-${file.name}`)
        const uploadTask = uploadBytesResumable(fileRef, file)

        const fileData = await new Promise<ChatAttachment>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const fileFraction = snapshot.bytesTransferred / snapshot.totalBytes
              const overall = Math.round(((i + fileFraction) / files.length) * 100)
              set({ uploadProgress: overall })
            },
            reject,
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref)
                resolve({ url, name: file.name, type: file.type, size: file.size })
              } catch (err) {
                reject(err)
              }
            }
          )
        })
        results.push(fileData)
      }
      set({ uploading: false, uploadProgress: 0 })
      return results
    } catch (e) {
      set({ uploading: false, uploadProgress: 0 })
      throw e
    }
  },

  setTyping: async (isTyping, uid) => {
    const { activeChatId, typingTimeout, chats } = get()
    if (!activeChatId || !uid) return
    const chatRef = doc(db, 'chats', activeChatId)

    const chatDoc = chats.find(c => c.id === activeChatId)
    const isCurrentlyTypingInDb = chatDoc?.typing?.[uid] !== undefined

    if (isTyping) {
      if (!isCurrentlyTypingInDb) {
        await updateDoc(chatRef, { [`typing.${uid}`]: serverTimestamp() })
      }
      if (typingTimeout) clearTimeout(typingTimeout)

      const newTimeout = setTimeout(() => get().setTyping(false, uid), 3000)
      set({ typingTimeout: newTimeout })
    } else {
      if (typingTimeout) {
        clearTimeout(typingTimeout)
        set({ typingTimeout: null })
      }
      await updateDoc(chatRef, { [`typing.${uid}`]: deleteField() })
    }
  },

  fetchVaultFiles: async (uid, usersList) => {
    if (!uid) return
    set({ loadingVault: true })
    try {
      const { chats } = get()
      const promises = chats.map(async (chat) => {
        try {
          const messagesRef = collection(db, `chats/${chat.id}/messages`)
          const q = query(messagesRef, where('attachment', '!=', null))
          const snapshot = await getDocs(q)

          let chatTitle = 'Chat'
          if (chat.isGroup) {
            chatTitle = chat.groupName || 'Group Chat'
          } else {
            const otherParticipantId = chat.participants.find(p => p !== uid)
            const otherUser = usersList.find(u => u.id === otherParticipantId)
            chatTitle = otherUser?.displayName || otherUser?.email || 'Direct Chat'
          }

          return snapshot.docs.flatMap(docSnap => {
            const data = docSnap.data()
            const files = getMessageAttachments(data as Message)
            return files.map((file, idx) => ({
              id: `${docSnap.id}-${idx}`,
              chatId: chat.id,
              chatTitle,
              senderId: data.senderId,
              senderName: data.senderName || 'Unknown',
              createdAt: data.createdAt,
              url: file.url || '',
              name: file.name || 'Untitled File',
              type: file.type || 'application/octet-stream',
              size: file.size || 0
            } as VaultFile))
          })
        } catch (err) {
          console.error(`Failed to fetch attachments for chat ${chat.id}:`, err)
          return []
        }
      })

      const results = await Promise.all(promises)
      const allFiles = results.flat().sort((a, b) => {
        const timeA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0
        const timeB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0
        return timeB - timeA
      })

      set({ vaultFiles: allFiles })
    } catch (e) {
      console.error('Failed to fetch vault files:', e)
    } finally {
      set({ loadingVault: false })
    }
  },

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    const currentUnsub = get().activeMessageUnsubscribe
    if (currentUnsub) {
      currentUnsub()
    }
    if (get().typingTimeout) {
      clearTimeout(get().typingTimeout)
    }
    set({ subscriptions: [], typingTimeout: null, activeMessageUnsubscribe: null })
  }
}))