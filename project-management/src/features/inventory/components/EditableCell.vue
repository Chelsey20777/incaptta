<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatPercent } from '../utils/pricing'
import { Search } from 'lucide-vue-next'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'

const props = defineProps<{
    value: any
    type?: 'text' | 'number' | 'select' | 'searchable-select' | 'currency' | 'percent' | 'textarea'
    options?: { value: string; label: string; stockCount?: number; uom?: string }[]
    readOnly?: boolean
    loading?: boolean
    className?: string
    placeholder?: string
    isActive?: boolean
    isEditing?: boolean
}>()

const emit = defineEmits<{
    (e: 'update', value: any): void
    (e: 'start-edit'): void
    (e: 'cancel-edit'): void
    (e: 'commit'): void
}>()

const localIsEditing = ref(false)
const editValue = ref(props.value)
const inputRef = ref<HTMLInputElement | null>(null)
const cellRef = ref<HTMLElement | null>(null)

// Searchable select state
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const dropdownOpen = ref(false)

const filteredOptions = computed(() => {
    if (!props.options) return []
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return props.options
    return props.options.filter(o => o.label.toLowerCase().includes(query))
})

watch(() => props.value, (newVal) => {
    editValue.value = newVal
})

watch(() => props.isEditing, async (newVal) => {
    localIsEditing.value = !!newVal
    if (newVal) {
        await nextTick()
        focusInput()
    }
})

watch(() => props.isActive, (newVal) => {
    if (newVal && cellRef.value && !localIsEditing.value) {
        cellRef.value.focus()
    }
})

onMounted(() => {
    if (props.isActive && cellRef.value) {
        cellRef.value.focus()
    }
})

function focusInput() {
    if (props.type === 'searchable-select') {
        nextTick(() => {
            searchInputRef.value?.focus()
        })
        return
    }
    if (inputRef.value) {
        const el = (inputRef.value as any).$el || inputRef.value
        const target = el instanceof HTMLInputElement ? el : el.querySelector?.('input') || el
        if (typeof target?.focus === 'function') {
            target.focus()
            if (props.type !== 'number' && props.type !== 'select' && typeof target.select === 'function') {
                target.select()
            }
        }
    }
}

async function startEdit() {
    if (props.readOnly || props.loading) return
    localIsEditing.value = true
    if (props.type === 'searchable-select') {
        searchQuery.value = ''
        dropdownOpen.value = true
    }
    emit('start-edit')
    await nextTick()
    focusInput()
}

function commitEdit() {
    if (!localIsEditing.value) return
    localIsEditing.value = false
    dropdownOpen.value = false
    if (editValue.value !== props.value) {
        emit('update', props.type === 'number' || props.type === 'currency' || props.type === 'percent'
            ? Number(editValue.value)
            : editValue.value)
    }
    emit('commit')
}

function cancelEdit() {
    localIsEditing.value = false
    dropdownOpen.value = false
    searchQuery.value = ''
    editValue.value = props.value
    emit('cancel-edit')
}

function selectSearchableOption(value: string) {
    editValue.value = value
    localIsEditing.value = false
    dropdownOpen.value = false
    searchQuery.value = ''
    if (value !== props.value) {
        emit('update', value)
    }
    emit('commit')
}

function displayValue() {
    if (props.type === 'currency') return formatCurrency(props.value)
    if (props.type === 'percent') return formatPercent(props.value)
    if (props.type === 'select' || props.type === 'searchable-select') {
        return props.options?.find(o => o.value === props.value)?.label || props.value || props.placeholder || ''
    }
    return props.value ?? '—'
}
</script>

<template>
    <!-- Searchable Select Type -->
    <Popover v-if="type === 'searchable-select'" :open="localIsEditing" @update:open="(val) => !val && cancelEdit()">
        <PopoverTrigger as-child>
            <div ref="cellRef" tabindex="0"
                class="relative min-h-[36px] flex items-center px-2 py-1 cursor-text hover:bg-accent/50 transition-colors border border-transparent outline-none"
                :class="[
                    className,
                    {
                        'bg-accent/30 ring-1 ring-primary/40': isActive && !localIsEditing,
                        'ring-2 ring-primary/60 bg-background z-10': localIsEditing,
                        'cursor-default': readOnly
                    }
                ]" @click="startEdit" @dblclick="startEdit" @keydown.enter.prevent="!localIsEditing && startEdit()">
                <div :class="['w-full text-[12px]', { 'truncate': type !== 'textarea' }]">
                    <slot :displayValue="displayValue()">
                        <div>
                            {{ displayValue() }}
                        </div>
                    </slot>
                </div>
                <div v-if="loading" class="absolute inset-0 bg-background/50 flex items-center justify-center">
                    <div class="size-3 border-2 border-primary border-t-transparent animate-spin rounded-full"></div>
                </div>
            </div>
        </PopoverTrigger>
        <PopoverContent 
            class="p-0 border border-border/80 shadow-2xl bg-popover z-50 overflow-hidden" 
            align="start" 
            :side-offset="5"
            style="width: clamp(300px, 40vw, 500px);"
        >
            <!-- Search Input -->
            <div class="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
                <Search class="size-4 text-muted-foreground shrink-0" />
                <input ref="searchInputRef" v-model="searchQuery" type="text" placeholder="Search items..."
                    class="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground font-medium"
                    @keydown.esc="cancelEdit"
                    @keydown.enter.prevent="filteredOptions.length === 1 && selectSearchableOption(filteredOptions[0]!.value)" />
            </div>
            <!-- Options List -->
            <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                <div v-for="opt in filteredOptions" :key="opt.value"
                    class="flex items-center justify-between gap-3 px-4 py-2 text-[13px] cursor-pointer hover:bg-accent transition-colors border-b border-border/10 last:border-0"
                    :class="{ 'bg-primary/10 font-bold text-primary': opt.value === editValue }"
                    @mousedown.prevent="selectSearchableOption(opt.value)">
                    <span class="truncate">{{ opt.label }}</span>
                    <span v-if="opt.stockCount !== undefined"
                        class="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap border"
                        :class="opt.stockCount > 0 ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'">
                        {{ opt.stockCount }} {{ opt.uom }}
                    </span>
                </div>
                <div v-if="filteredOptions.length === 0"
                    class="px-4 py-6 text-[13px] text-muted-foreground text-center italic">
                    No items found matching "{{ searchQuery }}"
                </div>
            </div>
        </PopoverContent>
    </Popover>

    <!-- Standard Text/Number/Select/Textarea Types -->
    <div v-else ref="cellRef" tabindex="0"
        class="relative min-h-[36px] flex items-center px-2 py-1 cursor-text hover:bg-accent/50 transition-colors border border-transparent outline-none"
        :class="[
            className,
            {
                'bg-accent/30 ring-1 ring-primary/40': isActive && !localIsEditing,
                'ring-2 ring-primary/60 bg-background z-10': localIsEditing,
                'cursor-default': readOnly
            }
        ]" @click="startEdit" @dblclick="startEdit" @keydown.enter.prevent="!localIsEditing && startEdit()">
        <div v-if="!localIsEditing"
            :class="['w-full text-[12px]', { 'truncate': type !== 'textarea', 'break-words overflow-hidden': type === 'textarea' }]">
            <slot :displayValue="displayValue()">
                <div :class="{ 'whitespace-pre-wrap': type === 'textarea' }">
                    {{ displayValue() }}
                </div>
            </slot>
        </div>

        <template v-else>
            <!-- Standard Select -->
            <Select v-if="type === 'select'" v-model="editValue" @update:model-value="commitEdit"
                @close="cancelEdit">
                <SelectTrigger class="h-8 text-[12px] border-none focus:ring-0 px-0">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="opt in options" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                    </SelectItem>
                </SelectContent>
            </Select>

            <Textarea v-else-if="type === 'textarea'" ref="inputRef" v-model="editValue"
                class="min-h-[60px] text-[12px] border-none focus-visible:ring-0 px-0 resize-none"
                :placeholder="placeholder" @blur="commitEdit" @keyup.esc="cancelEdit" />

            <Input v-else ref="inputRef" v-model="editValue"
                :type="type === 'number' || type === 'currency' || type === 'percent' ? 'number' : 'text'"
                step="any"
                class="h-8 text-[12px] border-none focus-visible:ring-0 px-0" :placeholder="placeholder"
                @blur="commitEdit" @keyup.enter="commitEdit" @keyup.esc="cancelEdit" />
        </template>

        <div v-if="loading" class="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div class="size-3 border-2 border-primary border-t-transparent animate-spin rounded-full"></div>
        </div>
    </div>
</template>
