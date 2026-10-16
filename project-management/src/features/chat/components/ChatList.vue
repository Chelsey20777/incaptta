<script setup lang="ts">
import { useChatStore } from '../store/chatStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { MessageSquarePlus } from 'lucide-vue-next'
import { formatDistanceToNow } from 'date-fns'

const emit = defineEmits<{ 'new-chat': [] }>()

const chatStore = useChatStore()
const adminStore = useAdminStore()
const { user: currentUser } = useSession()
const { chats } = storeToRefs(chatStore)
const { users } = storeToRefs(adminStore)

function getOtherParticipant(chat: any) {
    const otherId = chat.participants.find((id: string) => id !== currentUser.value?.uid)
    return users.value.find(u => u.id === otherId) || { displayName: 'Unknown User', email: '' }
}

function getUnreadCount(chat: any) {
    return chat.unreadCount?.[currentUser.value?.uid || ''] || 0
}

function formatTime(timestamp: any) {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return formatDistanceToNow(date, { addSuffix: true })
}
</script>

<template>
    <div class="absolute inset-0 flex flex-col bg-background">
        <ScrollArea class="flex-1">
            <div class="p-2 space-y-1">
                <div v-for="chat in chats" :key="chat.id" @click="chatStore.openChat(chat.id)"
                    class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent group relative"
                    :class="{ 'bg-accent': chatStore.activeChatId === chat.id }">

                    <Avatar class="h-10 w-10 border">
                        <AvatarFallback>{{ getOtherParticipant(chat).displayName?.charAt(0) || '?' }}</AvatarFallback>
                    </Avatar>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-0.5">
                            <span class="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                                {{ getOtherParticipant(chat).displayName }}
                            </span>
                            <span class="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                {{ formatTime(chat.lastMessageAt) }}
                            </span>
                        </div>
                        <p class="text-xs text-muted-foreground truncate line-clamp-1 italic opacity-80">
                            {{ chat.lastMessage || 'No messages yet' }}
                        </p>
                    </div>

                    <Badge v-if="getUnreadCount(chat) > 0"
                        class="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold shadow-sm">
                        {{ getUnreadCount(chat) }}
                    </Badge>
                </div>

                <div v-if="chats.length === 0"
                    class="flex flex-col items-center justify-center p-10 text-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center opacity-40">
                        <MessageSquarePlus class="size-6" />
                    </div>
                    <div class="opacity-40">
                        <p class="text-sm font-medium">No conversations yet</p>
                        <p class="text-xs italic mt-0.5">Start a chat with a team member</p>
                    </div>
                    <Button variant="outline" size="sm" class="mt-1 text-xs gap-1.5 h-8"
                        @click="emit('new-chat')">
                        <MessageSquarePlus class="size-3" />
                        New Conversation
                    </Button>
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
