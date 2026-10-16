<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '../store/chatStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import ChatList from './ChatList.vue'
import ChatWindow from './ChatWindow.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, UserPlus, ArrowLeft, X } from 'lucide-vue-next'

const chatStore = useChatStore()
const adminStore = useAdminStore()
const { user: currentUser } = useSession()
const { activeChatId, chats } = storeToRefs(chatStore)
const { users } = storeToRefs(adminStore)

const showUserSearch = ref(false)
const searchQuery = ref('')

const activeChatOtherParticipant = computed(() => {
    if (!activeChatId.value) return null
    const chat = chats.value.find(c => c.id === activeChatId.value)
    if (!chat) return null
    const otherId = chat.participants.find((id: string) => id !== currentUser.value?.uid)
    return users.value.find(u => u.id === otherId) || null
})

const filteredUsers = computed(() => {
    if (!searchQuery.value.trim()) return []
    const query = searchQuery.value.toLowerCase()
    return users.value.filter(u =>
        u.id !== currentUser.value?.uid &&
        (u.displayName?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query))
    )
})

async function startChat(user: any) {
    await chatStore.startPrivateChat(user.id)
    showUserSearch.value = false
    searchQuery.value = ''
}

function handleBack() {
    if (activeChatId.value) {
        chatStore.activeChatId = null
    } else {
        showUserSearch.value = false
    }
}
</script>

<template>
    <div class="flex flex-col flex-1 min-h-0 bg-background border-l shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="h-14 border-b px-4 flex items-center justify-between bg-muted/30 shrink-0">
            <div class="flex items-center gap-2">
                <Button v-if="activeChatId || showUserSearch" variant="ghost" size="icon" class="h-8 w-8"
                    @click="handleBack">
                    <ArrowLeft class="size-4" />
                </Button>
                <h2 v-if="!activeChatId && !showUserSearch"
                    class="font-bold text-sm uppercase tracking-wider text-muted-foreground">In-App Chat</h2>
                <h2 v-if="showUserSearch" class="font-bold text-sm">New Conversation</h2>
                <h2 v-if="activeChatId && !showUserSearch" class="font-bold text-sm truncate max-w-[180px]">
                    {{ activeChatOtherParticipant?.displayName || activeChatOtherParticipant?.email || 'Conversation' }}
                </h2>
            </div>

            <div class="flex items-center gap-1">
                <Button v-if="!showUserSearch && !activeChatId" variant="ghost" size="icon"
                    class="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                    @click="showUserSearch = true">
                    <UserPlus class="size-4" />
                </Button>
                <Button variant="ghost" size="icon"
                    class="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors group"
                    @click="chatStore.isChatOpen = false">
                    <X class="size-4 group-hover:rotate-90 transition-transform" />
                </Button>
            </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-hidden relative">
            <!-- User Search Overlay -->
            <div v-if="showUserSearch && !activeChatId"
                class="absolute inset-0 z-20 bg-background flex flex-col anim-slide-up">
                <div class="p-4 border-b">
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input v-model="searchQuery" placeholder="Search users by name or email..."
                            class="pl-9 h-10 w-full" autofocus />
                    </div>
                </div>
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-1">
                        <div v-for="user in filteredUsers" :key="user.id" @click="startChat(user)"
                            class="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors">
                            <Avatar class="h-9 w-9 border border-muted-foreground/20">
                                <AvatarFallback>{{ user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase() }}
                                </AvatarFallback>
                            </Avatar>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold truncate">{{ user.displayName || 'Unnamed User' }}</p>
                                <p class="text-[10px] text-muted-foreground truncate">{{ user.email }}</p>
                            </div>
                        </div>
                        <div v-if="searchQuery && filteredUsers.length === 0"
                            class="p-8 text-center opacity-40 italic text-sm">
                            No users found.
                        </div>
                        <div v-if="!searchQuery" class="p-8 text-center opacity-40 italic text-sm">
                            Type to begin searching...
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <!-- Main Layout: List or Window -->
            <ChatList v-if="!activeChatId" @new-chat="showUserSearch = true" />
            <ChatWindow v-else :other-participant="activeChatOtherParticipant" />
        </div>
    </div>
</template>

<style scoped>
.anim-slide-up {
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideUp {
    from {
        transform: translateY(10%);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}
</style>
