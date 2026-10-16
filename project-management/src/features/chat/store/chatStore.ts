import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import {
    collection,
    query,
    onSnapshot,
    doc,
    addDoc,
    serverTimestamp,
    orderBy,
    where,
    Timestamp,
    updateDoc,
    limit,
    getDocs,
    increment,
    endBefore,
    limitToLast,
    deleteField
} from 'firebase/firestore'
import { useSession } from '@/composables/useSession'

export interface Message {
    id?: string
    senderId: string
    senderName: string
    text: string
    createdAt: Timestamp | any
}

export interface Chat {
    id: string
    participants: string[]
    lastMessage?: string
    lastMessageAt?: Timestamp | any
    unreadCount: Record<string, number>
    typing?: Record<string, Timestamp | any>
}

export const useChatStore = defineStore('chat', () => {
    const { user } = useSession()

    const chats = ref<Chat[]>([])
    const activeChatId = ref<string | null>(null)
    const isChatOpen = ref(false)
    const messages = ref<Message[]>([])
    const loading = ref(false)
    const hasMoreMessages = ref(false)
    const sendError = ref<string | null>(null)

    let chatSubscription: (() => void) | null = null
    let messageSubscription: (() => void) | null = null
    let oldestMessageDoc: any = null
    let typingTimeout: ReturnType<typeof setTimeout> | null = null

    function cleanup() {
        if (chatSubscription) {
            chatSubscription()
            chatSubscription = null
        }
        if (messageSubscription) {
            messageSubscription()
            messageSubscription = null
        }
        if (typingTimeout) {
            clearTimeout(typingTimeout)
            typingTimeout = null
        }
    }

    // Fetch all chats for the current user
    function fetchChats() {
        if (!user.value?.uid) return

        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.value.uid)
        )

        chatSubscription = onSnapshot(q, (snapshot) => {
            const fetchedChats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat))
            chats.value = fetchedChats.sort((a, b) => {
                const timeA = a.lastMessageAt?.toMillis?.() || 0
                const timeB = b.lastMessageAt?.toMillis?.() || 0
                return timeB - timeA
            })
        })
    }

    // Open a specific chat and subscribe to latest messages
    function openChat(chatId: string) {
        activeChatId.value = chatId
        messages.value = []
        hasMoreMessages.value = false
        oldestMessageDoc = null

        if (messageSubscription) messageSubscription()

        const q = query(
            collection(db, `chats/${chatId}/messages`),
            orderBy('createdAt', 'asc'),
            limit(50)
        )

        messageSubscription = onSnapshot(q, (snapshot) => {
            messages.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message))
            if (snapshot.docs.length >= 50) {
                hasMoreMessages.value = true
                oldestMessageDoc = snapshot.docs[0]
            } else {
                hasMoreMessages.value = false
            }
            markAsRead(chatId)
        })
    }

    // Load older messages (pagination)
    async function loadMoreMessages() {
        if (!activeChatId.value || !oldestMessageDoc || !hasMoreMessages.value) return
        loading.value = true

        try {
            const q = query(
                collection(db, `chats/${activeChatId.value}/messages`),
                orderBy('createdAt', 'asc'),
                endBefore(oldestMessageDoc),
                limitToLast(50)
            )

            const snapshot = await getDocs(q)
            const olderMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message))
            messages.value = [...olderMessages, ...messages.value]

            if (snapshot.docs.length < 50) {
                hasMoreMessages.value = false
            } else {
                oldestMessageDoc = snapshot.docs[0]
            }
        } finally {
            loading.value = false
        }
    }

    // Start or get a private chat with another user
    async function startPrivateChat(otherUserId: string) {
        if (!user.value?.uid) return null

        const q = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.value.uid)
        )

        const snapshot = await getDocs(q)
        const existingChat = snapshot.docs.find(d => {
            const participants = d.data().participants as string[]
            return participants.length === 2 && participants.includes(otherUserId)
        })

        if (existingChat) {
            openChat(existingChat.id)
            return existingChat.id
        }

        const newChatRef = await addDoc(collection(db, 'chats'), {
            participants: [user.value.uid, otherUserId],
            lastMessageAt: serverTimestamp(),
            unreadCount: {
                [user.value.uid]: 0,
                [otherUserId]: 0
            }
        })

        openChat(newChatRef.id)
        return newChatRef.id
    }

    async function sendMessage(text: string) {
        if (!activeChatId.value || !user.value?.uid) return
        sendError.value = null

        const chatId = activeChatId.value
        const messageData = {
            senderId: user.value.uid,
            senderName: user.value.displayName || user.value.email || 'Anonymous',
            text,
            createdAt: serverTimestamp()
        }

        try {
            await addDoc(collection(db, `chats/${chatId}/messages`), messageData)

            // Build update: use dot-notation + increment to avoid race conditions
            const chatDoc = chats.value.find(c => c.id === chatId)
            const participants = chatDoc?.participants || []

            const updates: Record<string, any> = {
                lastMessage: text.length > 120 ? text.substring(0, 120) + '…' : text,
                lastMessageAt: serverTimestamp()
            }

            participants.forEach(pId => {
                if (pId !== user.value?.uid) {
                    updates[`unreadCount.${pId}`] = increment(1)
                }
            })

            // Clear own typing status on send
            updates[`typing.${user.value.uid}`] = deleteField()

            await updateDoc(doc(db, 'chats', chatId), updates)
        } catch (e: any) {
            sendError.value = e?.message || 'Failed to send message. Please try again.'
            throw e
        }
    }

    // Mark current user's unread count as 0 using dot-notation (no read required)
    async function markAsRead(chatId: string) {
        if (!user.value?.uid) return
        const uid = user.value.uid
        const chatDoc = chats.value.find(c => c.id === chatId)
        if (chatDoc && (chatDoc.unreadCount?.[uid] || 0) > 0) {
            await updateDoc(doc(db, 'chats', chatId), {
                [`unreadCount.${uid}`]: 0
            })
        }
    }

    // Typing indicator
    async function setTyping(isTyping: boolean) {
        if (!activeChatId.value || !user.value?.uid) return
        const chatRef = doc(db, 'chats', activeChatId.value)
        const uid = user.value.uid

        if (isTyping) {
            await updateDoc(chatRef, { [`typing.${uid}`]: serverTimestamp() })
            if (typingTimeout) clearTimeout(typingTimeout)
            typingTimeout = setTimeout(() => setTyping(false), 3000)
        } else {
            if (typingTimeout) {
                clearTimeout(typingTimeout)
                typingTimeout = null
            }
            await updateDoc(chatRef, { [`typing.${uid}`]: deleteField() })
        }
    }

    onUnmounted(cleanup)

    return {
        chats,
        activeChatId,
        isChatOpen,
        messages,
        loading,
        hasMoreMessages,
        sendError,
        fetchChats,
        openChat,
        loadMoreMessages,
        startPrivateChat,
        sendMessage,
        markAsRead,
        setTyping
    }
})
