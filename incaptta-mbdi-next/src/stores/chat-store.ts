'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
  orderBy,
  updateDoc,
  limit,
  getDoc,
  increment,
  arrayUnion,
  deleteField,
} from 'firebase/firestore'

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
  attachment?: ChatAttachment
  attachments?: ChatAttachment[]
  mentions?: Array<{ uid: string; displayName: string }>
  entityTags?: Array<{ type: string; id: string; label: string; url: string }>
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
  type?: 'mbdi' | string
  mbdiInitiativeId?: string
}

interface ChatState {
  chats: Chat[]
  activeChatId: string | null
  messages: Message[]
  loading: boolean
  sendError: string | null
  activeMessageUnsubscribe: (() => void) | null

  getOrCreateMbdiChat: (
    initiativeId: string,
    meta: {
      groupName: string
      ownerUid?: string | null
      extraParticipantUids?: string[]
    },
    uid: string
  ) => Promise<string | null>
  openChat: (chatId: string, uid: string) => () => void
  closeChat: () => void
  sendMessage: (
    text: string,
    user: { uid: string; displayName?: string; email?: string },
    replyTarget?: Message | null,
    attachment?: ChatAttachment | ChatAttachment[],
    mentions?: Array<{ uid: string; displayName: string }>,
    entityTags?: Array<{ type: string; id: string; label: string; url: string }>
  ) => Promise<void>
  markAsRead: (chatId: string, uid: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  loading: false,
  sendError: null,
  activeMessageUnsubscribe: null,

  openChat: (chatId, uid) => {
    const currentUnsub = get().activeMessageUnsubscribe
    if (currentUnsub) {
      currentUnsub()
    }

    set({
      activeChatId: chatId,
      messages: [],
    })

    const q = query(
      collection(db, `chats/${chatId}/messages`),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (get().activeChatId !== chatId) {
          unsub()
          return
        }

        const windowMessages = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as Message))
          .reverse()

        set({ messages: windowMessages })
        get().markAsRead(chatId, uid)
      },
      (error) => {
        console.error(`Message listener error for chat ${chatId}:`, error)
        set({ sendError: 'Could not load messages. Please refresh or check your access.' })
      }
    )

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
      activeMessageUnsubscribe: null,
    })
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
        const toAdd = [uid, meta.ownerUid, ...(meta.extraParticipantUids || [])].filter(
          (id): id is string => !!id && !participants.includes(id)
        )
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

  sendMessage: async (text, user, replyTarget, attachment, mentions, entityTags) => {
    const { activeChatId, chats } = get()
    if (!activeChatId || !user?.uid) return
    set({ sendError: null })

    const chatId = activeChatId
    const messageData: any = {
      senderId: user.uid,
      senderName: user.displayName || user.email || 'Anonymous',
      text,
      createdAt: serverTimestamp(),
    }

    if (attachment) {
      const list = Array.isArray(attachment) ? attachment : [attachment]
      if (list.length > 0) {
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
        textPreview: replyTarget.text,
      }
    }

    try {
      await addDoc(collection(db, `chats/${chatId}/messages`), messageData)

      let participants = chats.find((c) => c.id === chatId)?.participants || []
      if (participants.length === 0) {
        const freshChat = await getDoc(doc(db, 'chats', chatId))
        participants = (freshChat.data()?.participants as string[]) || []
      }

      const updates: Record<string, any> = {
        lastMessage: text.length > 120 ? text.substring(0, 120) + '…' : text,
        lastMessageAt: serverTimestamp(),
      }

      participants.forEach((pId) => {
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
    const localChat = get().chats.find((c) => c.id === chatId)

    if (localChat) {
      if ((localChat.unreadCount?.[uid] || 0) > 0) {
        await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${uid}`]: 0 })
      }
      return
    }

    const freshChat = await getDoc(doc(db, 'chats', chatId))
    const unread = (freshChat.data()?.unreadCount as Record<string, number>)?.[uid] || 0
    if (unread > 0) {
      await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${uid}`]: 0 })
    }
  },
}))
