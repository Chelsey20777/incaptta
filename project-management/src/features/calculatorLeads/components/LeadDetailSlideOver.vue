<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Phone,
  Mail,
  MapPin,
  Calculator,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
  DollarSign,
  Maximize2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useLeads } from '../composables/useLeads'
import type { Lead, LeadStatus, BOQItem } from '../types/lead.types'
import { LEAD_STATUS_CONFIG } from '../types/lead.types'
import LeadStatusBadge from './LeadStatusBadge.vue'

const props = defineProps<{
  open: boolean
  lead: Lead | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { updateLeadStatus, updateLeadNotes, assignLead } = useLeads()

const isUpdatingStatus = ref(false)
const isSavingNotes = ref(false)
const isAssigning = ref(false)
const showBOQ = ref(false)
const internalNotes = ref('')

// Watch for lead changes to sync internal notes
watch(
  () => props.lead,
  (newLead) => {
    if (newLead) {
      internalNotes.value = newLead.internalNotes || ''
    }
  },
  { immediate: true }
)

const statusOptions: LeadStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost']

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value || 0)
}

const formatNumber = (value: number): string => {
  return value?.toLocaleString('en-US') || '0'
}

const formatDate = (timestamp: any): string => {
  if (!timestamp) return 'N/A'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const firstName = computed(() => {
  if (!props.lead?.fullName) return ''
  return props.lead.fullName.split(' ')[0]
})

const birdCapacity = computed(() => {
  if (!props.lead?.structureArea) return 0
  return props.lead.structureArea * 10
})

const grandTotal = computed(() => {
  if (!props.lead?.boqSnapshot?.length) return 0
  return props.lead.boqSnapshot.reduce((sum: number, item: BOQItem) => sum + (item.total || 0), 0)
})

const whatsappUrl = computed(() => {
  if (!props.lead?.phone) return '#'
  const message = `Hi ${firstName.value}, this is Incaptta regarding your fowlrun quote request.`
  return `https://wa.me/${props.lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
})

const telUrl = computed(() => {
  if (!props.lead?.phone) return '#'
  return `tel:${props.lead.phone}`
})

async function handleStatusChange(newStatus: LeadStatus) {
  if (!props.lead) return
  isUpdatingStatus.value = true
  try {
    await updateLeadStatus(props.lead.id, newStatus)
    toast.success(`Status updated to ${LEAD_STATUS_CONFIG[newStatus].label}`)
  } catch (err: any) {
    toast.error('Failed to update status', { description: err.message })
  } finally {
    isUpdatingStatus.value = false
  }
}

async function handleSaveNotes() {
  if (!props.lead) return
  isSavingNotes.value = true
  try {
    await updateLeadNotes(props.lead.id, internalNotes.value)
    toast.success('Notes saved')
  } catch (err: any) {
    toast.error('Failed to save notes', { description: err.message })
  } finally {
    isSavingNotes.value = false
  }
}

async function handleQuickStatus(status: LeadStatus) {
  if (!props.lead || props.lead.status === status) return
  await handleStatusChange(status)
}

const materialItems = computed(() => {
  if (!props.lead?.boqSnapshot) return []
  return props.lead.boqSnapshot.filter((item: BOQItem) => item.category === 'material')
})

const labourItems = computed(() => {
  if (!props.lead?.boqSnapshot) return []
  return props.lead.boqSnapshot.filter((item: BOQItem) => item.category === 'labour')
})

const transportItems = computed(() => {
  if (!props.lead?.boqSnapshot) return []
  return props.lead.boqSnapshot.filter((item: BOQItem) => item.category === 'transport')
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent v-if="lead" side="right" class="w-full sm:max-w-xl overflow-hidden flex flex-col p-0">
      <!-- Header -->
      <SheetHeader class="px-6 py-4 border-b shrink-0">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <SheetTitle class="text-xl truncate">{{ lead.fullName }}</SheetTitle>
            <SheetDescription class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="flex items-center gap-1">
                <Phone class="h-3 w-3" />
                {{ lead.phone }}
              </span>
              <LeadStatusBadge :status="lead.status" />
            </SheetDescription>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Badge variant="outline" class="text-xs">
              <Calculator class="h-3 w-3 mr-1" />
              Calculator
            </Badge>
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-2">
          Received {{ formatDate(lead.createdAt) }}
        </p>
      </SheetHeader>

      <ScrollArea class="flex-1">
        <div class="px-6 py-4 space-y-6">
          <!-- Contact Info Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <User class="h-4 w-4" />
              Contact Information
            </h3>
            <div class="grid gap-3 p-4 bg-muted/50 rounded-lg">
              <div class="flex items-center gap-3">
                <Phone class="h-4 w-4 text-muted-foreground shrink-0" />
                <a :href="telUrl" class="text-sm hover:underline text-primary">{{ lead.phone }}</a>
                <span class="text-xs text-muted-foreground">(tap to call)</span>
              </div>
              <div v-if="lead.email" class="flex items-center gap-3">
                <Mail class="h-4 w-4 text-muted-foreground shrink-0" />
                <a :href="`mailto:${lead.email}`" class="text-sm hover:underline">{{ lead.email }}</a>
              </div>
              <div class="flex items-center gap-3">
                <MapPin class="h-4 w-4 text-muted-foreground shrink-0" />
                <span class="text-sm">{{ lead.farmLocation }}</span>
              </div>
              <div v-if="lead.referralSource" class="flex items-center gap-3">
                <ExternalLink class="h-4 w-4 text-muted-foreground shrink-0" />
                <span class="text-sm text-muted-foreground">Via: {{ lead.referralSource }}</span>
              </div>
            </div>
          </div>

          <Separator />

          <!-- Structure Details Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Building2 class="h-4 w-4" />
              Structure Details
            </h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="p-3 bg-muted/50 rounded-lg">
                <p class="text-xs text-muted-foreground">Size</p>
                <p class="font-medium">{{ lead.structureSize }}</p>
              </div>
              <div class="p-3 bg-muted/50 rounded-lg">
                <p class="text-xs text-muted-foreground">Floor Area</p>
                <p class="font-medium">{{ lead.structureArea }} m²</p>
              </div>
              <div class="p-3 bg-muted/50 rounded-lg">
                <p class="text-xs text-muted-foreground">Est. Bird Capacity</p>
                <p class="font-medium">{{ formatNumber(birdCapacity) }} birds</p>
              </div>
              <div class="p-3 bg-muted/50 rounded-lg">
                <p class="text-xs text-muted-foreground">Material Cost</p>
                <p class="font-semibold text-brand-primary">{{ formatCurrency(lead.estimatedMaterialCost) }}</p>
              </div>
            </div>
          </div>

          <Separator />

          <!-- BOQ Snapshot Section -->
          <div class="space-y-3">
            <button
              @click="showBOQ = !showBOQ"
              class="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span class="flex items-center gap-2">
                <DollarSign class="h-4 w-4" />
                BOQ Snapshot
              </span>
              <component :is="showBOQ ? ChevronUp : ChevronDown" class="h-4 w-4" />
            </button>

            <div v-show="showBOQ" class="space-y-3">
              <Table v-if="lead.boqSnapshot?.length">
                <TableHeader>
                  <TableRow>
                    <TableHead class="text-xs">Description</TableHead>
                    <TableHead class="text-xs text-right">Qty</TableHead>
                    <TableHead class="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(item, index) in lead.boqSnapshot" :key="index">
                    <TableCell class="text-xs py-2">{{ item.description }}</TableCell>
                    <TableCell class="text-xs text-right py-2">{{ formatNumber(item.qty) }}</TableCell>
                    <TableCell class="text-xs text-right py-2">{{ formatCurrency(item.total) }}</TableCell>
                  </TableRow>
                  <TableRow class="font-semibold bg-muted/50">
                    <TableCell class="text-xs py-2" colspan="2">Grand Total</TableCell>
                    <TableCell class="text-xs text-right py-2">{{ formatCurrency(grandTotal) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p v-else class="text-sm text-muted-foreground italic">No BOQ data available</p>
            </div>
          </div>

          <Separator />

          <!-- Status & Assignment Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 class="h-4 w-4" />
              Status & Assignment
            </h3>

            <div class="space-y-3">
              <div class="space-y-2">
                <label class="text-sm font-medium">Lead Status</label>
                <Select
                  :model-value="lead.status"
                  @update:model-value="handleStatusChange($event as LeadStatus)"
                  :disabled="isUpdatingStatus"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="status in statusOptions" :key="status" :value="status">
                      <div class="flex items-center gap-2">
                        <span
                          class="w-2 h-2 rounded-full"
                          :style="{ backgroundColor: LEAD_STATUS_CONFIG[status].color }"
                        />
                        {{ LEAD_STATUS_CONFIG[status].label }}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Quick Actions -->
              <div v-if="lead.status !== 'won' && lead.status !== 'lost'" class="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  class="flex-1 bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                  @click="handleQuickStatus('won')"
                  :disabled="isUpdatingStatus"
                >
                  <CheckCircle2 class="h-4 w-4 mr-1" />
                  Mark as Won
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  class="flex-1 bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                  @click="handleQuickStatus('lost')"
                  :disabled="isUpdatingStatus"
                >
                  <XCircle class="h-4 w-4 mr-1" />
                  Mark as Lost
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          <!-- Customer Notes Section -->
          <div v-if="lead.additionalNotes" class="space-y-3">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <MessageCircle class="h-4 w-4" />
              Customer Notes
            </h3>
            <div class="p-3 bg-muted/50 rounded-lg">
              <p class="text-sm whitespace-pre-wrap">{{ lead.additionalNotes }}</p>
            </div>
          </div>

          <Separator v-if="lead.additionalNotes" />

          <!-- Internal Notes Section -->
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Maximize2 class="h-4 w-4" />
              Internal Notes
            </h3>
            <div class="space-y-2">
              <Textarea
                v-model="internalNotes"
                placeholder="Add internal notes about this lead..."
                rows="4"
              />
              <div class="flex items-center justify-between">
                <span v-if="lead.updatedAt" class="text-xs text-muted-foreground">
                  Last updated: {{ formatDate(lead.updatedAt) }}
                </span>
                <Button
                  size="sm"
                  @click="handleSaveNotes"
                  :disabled="isSavingNotes || internalNotes === (lead.internalNotes || '')"
                >
                  <Loader2 v-if="isSavingNotes" class="h-4 w-4 mr-1 animate-spin" />
                  Save Notes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Footer Actions -->
      <div class="px-6 py-4 border-t shrink-0 bg-muted/30">
        <div class="flex gap-2">
          <Button class="flex-1" as-child>
            <a :href="telUrl">
              <Phone class="h-4 w-4 mr-2" />
              Call
            </a>
          </Button>
          <Button variant="outline" class="flex-1" as-child>
            <a :href="whatsappUrl" target="_blank" rel="noopener noreferrer">
              <MessageCircle class="h-4 w-4 mr-2" />
              WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
