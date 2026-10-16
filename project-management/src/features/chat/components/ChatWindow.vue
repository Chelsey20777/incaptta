<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useChatStore } from '../store/chatStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, ChevronUp, AlertCircle } from 'lucide-vue-next'
import { format, isToday, isYesterday } from 'date-fns'

const props = defineProps<{
    otherParticipant?: { displayName?: string; email?: string } | null
}>()

const chatStore = useChatStore()
const { user: currentUser } = useSession()
const { messages, activeChatId, loading, hasMoreMessages, sendError } = storeToRefs(chatStore)

const newMessage = ref('')
const isSending = ref(false)
const scrollAreaRef = ref<any>(null)

// Enrich messages with date separators
const enrichedMessages = computed(() => {
    const result: { type: 'date' | 'message'; value: any }[] = []
    let lastDateKey = ''

    for (const msg of messages.value) {
        const date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt || 0)
        const dateKey = format(date, 'yyyy-MM-dd')

        if (dateKey !== lastDateKey) {
            lastDateKey = dateKey
            let label = ''
            if (isToday(date)) label = 'Today'
            else if (isYesterday(date)) label = 'Yesterday'
            else label = format(date, 'MMMM d, yyyy')
            result.push({ type: 'date', value: label })
        }
        result.push({ type: 'message', value: msg })
    }
    return result
})

// Typing indicator: other participants typing within last 5s
const isOtherTyping = computed(() => {
    if (!activeChatId.value) return false
    const chat = chatStore.chats.find(c => c.id === activeChatId.value)
    if (!chat?.typing) return false
    const now = Date.now()
    return Object.entries(chat.typing).some(([uid, ts]: [string, any]) => {
        if (uid === currentUser.value?.uid) return false
        const tsMs = ts?.toMillis?.() || 0
        return (now - tsMs) < 5000
    })
})

async function handleSendMessage() {
    if (!newMessage.value.trim() || isSending.value) return
    const text = newMessage.value
    isSending.value = true
    newMessage.value = ''

    try {
        await chatStore.sendMessage(text)
        await scrollToBottom()
    } catch {
        // sendError is set in the store
        newMessage.value = text // restore on failure
    } finally {
        isSending.value = false
    }
}

function handleInput() {
    chatStore.setTyping(newMessage.value.length > 0)
}

async function scrollToBottom() {
    await nextTick()
    if (scrollAreaRef.value) {
        const viewport = scrollAreaRef.value.$el?.querySelector('[data-radix-scroll-area-viewport]')
        if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
}

onMounted(async () => {
    await scrollToBottom()
})

watch(messages, async () => {
    await scrollToBottom()
}, { deep: true })

function formatMessageTime(timestamp: any) {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return format(date, 'HH:mm')
}

function isMine(msg: any) {
    return msg.senderId === currentUser.value?.uid
}
</script>

<template>
    <div class="absolute inset-0 flex flex-col bg-background">
        <div v-if="!activeChatId" class="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-40">
            <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Send class="size-8" />
            </div>
            <h3 class="text-lg font-bold">Your Messages</h3>
            <p class="text-sm italic">Select a conversation to start chatting.</p>
        </div>

        <template v-else>
            <!-- Load More -->
            <div v-if="hasMoreMessages" class="px-4 pt-3 pb-1 flex justify-center">
                <Button variant="outline" size="sm" class="h-7 text-xs gap-1.5" :disabled="loading"
                    @click="chatStore.loadMoreMessages()">
                    <Loader2 v-if="loading" class="size-3 animate-spin" />
                    <ChevronUp v-else class="size-3" />
                    Load earlier messages
                </Button>
            </div>

            <!-- Messages -->
            <ScrollArea ref="scrollAreaRef" class="flex-1 min-h-0 px-4 pt-2 pb-1">
                <div class="space-y-1 pb-2">
                    <template v-for="item in enrichedMessages" :key="item.type === 'date' ? item.value : item.value.id">

                        <!-- Date separator -->
                        <div v-if="item.type === 'date'" class="flex items-center gap-2 my-3">
                            <div class="flex-1 h-px bg-border" />
                            <span class="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
                                {{ item.value }}
                            </span>
                            <div class="flex-1 h-px bg-border" />
                        </div>

                        <!-- Message bubble -->
                        <div v-else class="flex flex-col max-w-[80%] mt-1"
                            :class="[isMine(item.value) ? 'ml-auto items-end' : 'mr-auto items-start']">
                            <div class="px-3 py-2 rounded-2xl text-sm shadow-sm"
                                :class="[isMine(item.value)
                                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                    : 'bg-muted text-foreground rounded-tl-sm border']">
                                <p class="whitespace-pre-wrap break-words leading-relaxed">{{ item.value.text }}</p>
                                <span class="text-[9px] opacity-50 mt-0.5 block"
                                    :class="[isMine(item.value) ? 'text-right' : 'text-left']">
                                    {{ formatMessageTime(item.value.createdAt) }}
                                </span>
                            </div>
                            <span v-if="!isMine(item.value)"
                                class="text-[10px] text-muted-foreground mt-0.5 ml-1 opacity-60">
                                {{ item.value.senderName }}
                            </span>
                        </div>
                    </template>

                    <!-- Typing indicator -->
                    <div v-if="isOtherTyping" class="flex items-end gap-1 mr-auto mt-2 max-w-[80px]">
                        <div
                            class="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-muted border flex items-center gap-1 shadow-sm">
                            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <!-- Send error -->
            <div v-if="sendError"
                class="mx-4 mb-1 flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle class="size-3 shrink-0" />
                {{ sendError }}
            </div>

            <!-- Input bar -->
            <div class="p-3 border-t bg-muted/20">
                <form @submit.prevent="handleSendMessage" class="flex items-center gap-2">
                    <Input v-model="newMessage" placeholder="Type a message…" class="flex-1 bg-background"
                        :disabled="isSending" @input="handleInput"
                        @keydown.enter.exact.prevent="handleSendMessage" />
                    <Button type="submit" size="icon" :disabled="!newMessage.trim() || isSending"
                        class="shrink-0 rounded-full">
                        <Loader2 v-if="isSending" class="size-4 animate-spin" />
                        <Send v-else class="size-4" />
                    </Button>
                </form>
            </div>
        </template>
    </div>
</template>
