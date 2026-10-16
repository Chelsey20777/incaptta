<script setup lang="ts">
import { ref, watch, reactive, computed } from 'vue'
import { useAdminStore } from '../store/adminStore'
import { storeToRefs } from 'pinia'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, X, Loader2, Image as ImageIcon, Save, Building2, Landmark, ShieldAlert, Palette, PenLine } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import { hashInventoryPin } from '@/features/inventory/utils/inventoryAccessPin'

const store = useAdminStore()
const { appSettings, loading } = storeToRefs(store)
const { hasAnyRole } = useSession()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)

const sealInput = ref<HTMLInputElement | null>(null)
const selectedSealFile = ref<File | null>(null)
const sealPreviewUrl = ref<string | null>(null)

const sealInput2 = ref<HTMLInputElement | null>(null)
const selectedSealFile2 = ref<File | null>(null)
const sealPreviewUrl2 = ref<string | null>(null)

const signatureInput = ref<HTMLInputElement | null>(null)
const selectedSignatureFile = ref<File | null>(null)
const signaturePreviewUrl = ref<string | null>(null)

const inventoryManagerPin = ref('')
const inventoryManagerPinConfirm = ref('')

const canManageInventoryPin = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN']))
const inventoryPinConfigured = computed(() => !!appSettings.value?.inventoryManagerPinHash)

// Reactive form state
const form = reactive({
  managerName: '',
  managerPosition: '',
  companyName: '',
  address: '',
  city: '',
  country: '',
  phone1: '',
  phone2: '',
  email: '',
  website: '',
  bankName: '',
  bankAccount: '',
  swiftCode: '',
  branchCode: '',
  bankName2: '',
  bankAccount2: '',
  swiftCode2: '',
  branchCode2: '',
  accountName: '',
  accountName2: '',
  termsAdvised: '',
  termsOther: '',
  paymentTerms: '',
  moreTerms: '',
  vatRate: 0,
  vatEnabled: true,
  uiColors: {
    lowStockColor: '#ff8903',
    outOfStockColor: '#ef4444',
    ecocashBalanceColor: '#ff8903',
    bankBalanceColor: '#eab308',
    irdBalanceColor: '#ef4444',
    pieChartIncomeColor: '#79c21b',
    pieChartExpenseColor: '#ff8903',
    brandPrimaryColor: '#79c21b',
    brandSecondaryColor: '#ff8903',
    gridHeaderBgColor: '#2a0808',
    gridHeaderTextColor: '#ff8903',
    gridSecondaryBgColor: '#1a0505',
    gridBorderColor: 'rgba(255,137,3,0.1)',
    // CRM Grid
    crmGridHeaderBg: '#2a0808',
    crmGridHeaderTextColor: '#ff8903',
    crmGridBorderColor: 'rgba(255,137,3,0.1)',
    // OPEX Grid
    opexGridHeaderBg: '#2a0808',
    opexGridHeaderTextColor: '#ff8903',
    opexGridBorderColor: 'rgba(255,137,3,0.1)',
    // Job Cards Grid
    jobCardsGridHeaderBg: '#2a0808',
    jobCardsGridHeaderTextColor: '#ff8903',
    jobCardsGridBorderColor: 'rgba(255,137,3,0.1)',
    // Ledger Grid
    ledgerGridHeaderBg: '#2a0808',
    ledgerGridHeaderTextColor: '#ff8903',
    ledgerGridBorderColor: 'rgba(255,137,3,0.1)',
    // Inventory Grid
    inventoryGridHeaderBg: '#2a0808',
    inventoryGridHeaderTextColor: '#ff8903',
    inventoryGridSecondaryBg: '#1a0505',
    inventoryGridBorderColor: 'rgba(255,137,3,0.1)'
  }
})

// Initialize form and previews from store
watch(appSettings, (newSettings) => {
  if (newSettings) {
    if (newSettings.logoUrl && !previewUrl.value) {
      previewUrl.value = newSettings.logoUrl
    }
    if (newSettings.sealUrl && !sealPreviewUrl.value) {
      sealPreviewUrl.value = newSettings.sealUrl
    }
    if (newSettings.sealUrl2 && !sealPreviewUrl2.value) {
      sealPreviewUrl2.value = newSettings.sealUrl2
    }
    if (newSettings.managerSignatureUrl && !signaturePreviewUrl.value) {
      signaturePreviewUrl.value = newSettings.managerSignatureUrl
    }
    // Update form fields
    form.managerName = newSettings.managerName || ''
    form.managerPosition = newSettings.managerPosition || ''
    form.companyName = newSettings.companyName || ''
    form.address = newSettings.address || ''
    form.city = newSettings.city || ''
    form.country = newSettings.country || ''
    form.phone1 = newSettings.phone1 || ''
    form.phone2 = newSettings.phone2 || ''
    form.email = newSettings.email || ''
    form.website = newSettings.website || ''
    form.bankName = newSettings.bankName || ''
    form.bankAccount = newSettings.bankAccount || ''
    form.swiftCode = newSettings.swiftCode || ''
    form.branchCode = newSettings.branchCode || ''
    form.bankName2 = newSettings.bankName2 || ''
    form.bankAccount2 = newSettings.bankAccount2 || ''
    form.swiftCode2 = newSettings.swiftCode2 || ''
    form.branchCode2 = newSettings.branchCode2 || ''
    form.accountName = newSettings.accountName || ''
    form.accountName2 = newSettings.accountName2 || ''
    form.termsAdvised = newSettings.termsAdvised || ''
    form.termsOther = newSettings.termsOther || ''
    form.paymentTerms = newSettings.paymentTerms || ''
    form.moreTerms = newSettings.moreTerms || ''
    form.vatRate = newSettings.vatRate ?? 0
    form.vatEnabled = newSettings.vatEnabled ?? true
    if (newSettings.uiColors) {
      form.uiColors = { ...form.uiColors, ...newSettings.uiColors }
    }
  }
}, { immediate: true })

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type. Please select an image.')
      return
    }
    selectedFile.value = file
    previewUrl.value = URL.createObjectURL(file)
  }
}

const handleSealSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type. Please select an image.')
      return
    }
    selectedSealFile.value = file
    sealPreviewUrl.value = URL.createObjectURL(file)
  }
}

const handleSealSelect2 = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type. Please select an image.')
      return
    }
    selectedSealFile2.value = file
    sealPreviewUrl2.value = URL.createObjectURL(file)
  }
}

const clearSelection = () => {
  selectedFile.value = null
  previewUrl.value = appSettings.value.logoUrl || null
  if (fileInput.value) fileInput.value.value = ''
}

const clearSealSelection = () => {
  selectedSealFile.value = null
  sealPreviewUrl.value = appSettings.value.sealUrl || null
  if (sealInput.value) sealInput.value.value = ''
}

const clearSealSelection2 = () => {
  selectedSealFile2.value = null
  sealPreviewUrl2.value = appSettings.value.sealUrl2 || null
  if (sealInput2.value) sealInput2.value.value = ''
}

const handleSignatureSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type. Please select an image.')
      return
    }
    selectedSignatureFile.value = file
    signaturePreviewUrl.value = URL.createObjectURL(file)
  }
}

const clearSignatureSelection = () => {
  selectedSignatureFile.value = null
  signaturePreviewUrl.value = appSettings.value.managerSignatureUrl || null
  if (signatureInput.value) signatureInput.value.value = ''
}

const handleSignatureUpload = async () => {
  if (!selectedSignatureFile.value) return
  try {
    await store.uploadManagerSignature(selectedSignatureFile.value)
    selectedSignatureFile.value = null
    toast.success('Manager signature updated successfully')
  } catch (err) {
    console.error('Upload failed:', err)
  }
}

const removeSignature = async () => {
  if (confirm('Are you sure you want to remove the manager signature?')) {
    try {
      await store.saveSettings({ managerSignatureUrl: '', managerSignatureDataUrl: '' })
      signaturePreviewUrl.value = null
      selectedSignatureFile.value = null
      toast.success('Manager signature removed')
    } catch (err) {
      console.error('Removal failed:', err)
    }
  }
}

const handleUpload = async () => {
  if (!selectedFile.value) return
  try {
    await store.uploadLogo(selectedFile.value)
    selectedFile.value = null
    toast.success('Logo updated successfully')
  } catch (err) {
    console.error('Upload failed:', err)
  }
}

const handleSealUpload = async () => {
  if (!selectedSealFile.value) return
  try {
    await store.uploadSeal(selectedSealFile.value)
    selectedSealFile.value = null
    toast.success('Seal updated successfully')
  } catch (err) {
    console.error('Upload failed:', err)
  }
}

const handleSealUpload2 = async () => {
  if (!selectedSealFile2.value) return
  try {
    await store.uploadSeal2(selectedSealFile2.value)
    selectedSealFile2.value = null
    toast.success('Secondary seal updated successfully')
  } catch (err) {
    console.error('Upload failed:', err)
  }
}

const handleSaveGeneral = async () => {
  try {
    const { logoUrl, sealUrl, sealUrl2, ...rest } = appSettings.value
    const settingsPatch: Record<string, unknown> = {}

    if (canManageInventoryPin.value && (inventoryManagerPin.value || inventoryManagerPinConfirm.value)) {
      if (inventoryManagerPin.value !== inventoryManagerPinConfirm.value) {
        toast.error('PIN mismatch', { description: 'Inventory PIN and confirmation must match.' })
        return
      }

      if (inventoryManagerPin.value.trim().length < 4) {
        toast.error('PIN too short', { description: 'Use at least 4 digits or characters for the inventory PIN.' })
        return
      }

      settingsPatch.inventoryManagerPinHash = await hashInventoryPin(inventoryManagerPin.value)
    }

    await store.saveSettings({ ...rest, ...form, ...settingsPatch })
    inventoryManagerPin.value = ''
    inventoryManagerPinConfirm.value = ''
  } catch (err) {
    console.error('Save failed:', err)
  }
}

const clearInventoryPin = async () => {
  if (!canManageInventoryPin.value) return
  if (!confirm('Remove the inventory manager PIN? Managers will no longer be prompted before opening inventory master or the admin settings page.')) {
    return
  }

  try {
    await store.saveSettings({ inventoryManagerPinHash: '' })
    inventoryManagerPin.value = ''
    inventoryManagerPinConfirm.value = ''
    toast.success('Inventory PIN removed')
  } catch (err) {
    console.error('Failed to remove inventory PIN:', err)
  }
}

const removeLogo = async () => {
  if (confirm('Are you sure you want to remove the custom logo?')) {
    try {
      await store.saveSettings({ logoUrl: '' })
      previewUrl.value = null
      selectedFile.value = null
      toast.success('Logo removed')
    } catch (err) {
      console.error('Removal failed:', err)
    }
  }
}

const removeSeal = async () => {
  if (confirm('Are you sure you want to remove the company seal?')) {
    try {
      await store.saveSettings({ sealUrl: '' })
      sealPreviewUrl.value = null
      selectedSealFile.value = null
      toast.success('Seal removed')
    } catch (err) {
      console.error('Removal failed:', err)
    }
  }
}

const removeSeal2 = async () => {
  if (confirm('Are you sure you want to remove the secondary company seal?')) {
    try {
      await store.saveSettings({ sealUrl2: '' })
      sealPreviewUrl2.value = null
      selectedSealFile2.value = null
      toast.success('Secondary seal removed')
    } catch (err) {
      console.error('Removal failed:', err)
    }
  }
}
</script>

<template>
  <div class="space-y-8 pb-20">
    <!-- Branding Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <ImageIcon class="size-5" />
          Application Branding
        </CardTitle>
        <CardDescription>
          Customize the appearance of the application with your organization's logo and official seals.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-12">
        <div class="grid lg:grid-cols-2 gap-8">
          <!-- Logo Section -->
          <div class="space-y-4">
            <Label>Application Logo</Label>
            <div class="flex items-start gap-4">
              <div
                class="relative group size-28 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden transition-colors hover:bg-muted/50">
                <template v-if="previewUrl">
                  <img :src="previewUrl" alt="Logo Preview" class="size-full object-contain p-2" />
                  <button v-if="!loading" @click="clearSelection"
                    class="absolute top-1 right-1 size-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg">
                    <X class="size-3" />
                  </button>
                </template>
                <template v-else>
                  <ImageIcon class="size-8 text-muted-foreground/40" />
                </template>
                <div v-if="loading" class="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 class="size-6 animate-spin text-primary" />
                </div>
              </div>

              <div class="flex-1 space-y-4">
                <div class="flex flex-col gap-2">
                  <Button variant="outline" size="sm" @click="fileInput?.click()" :disabled="loading"
                    class="justify-start">
                    <Upload class="mr-2 size-4" />
                    {{ previewUrl ? 'Change Logo' : 'Select Logo' }}
                  </Button>
                  <Button v-if="appSettings.logoUrl" variant="ghost" size="sm" @click="removeLogo" :disabled="loading"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 justify-start">
                    <X class="mr-2 size-4" />
                    Remove Logo
                  </Button>
                  <input ref="fileInput" type="file" class="hidden" accept="image/*" @change="handleFileSelect" />
                </div>
                <Button v-if="selectedFile" @click="handleUpload" size="sm" class="w-full" :disabled="loading">
                  <template v-if="loading">
                    <Loader2 class="mr-2 size-4 animate-spin" />
                    Uploading...
                  </template>
                  <template v-else>
                    Apply Logo
                  </template>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-8">
          <!-- Primary Seal Section -->
          <div class="space-y-4">
            <Label>Primary Company Seal</Label>
            <div class="flex items-start gap-4">
              <div
                class="relative group size-28 rounded-full border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden transition-colors hover:bg-muted/50">
                <template v-if="sealPreviewUrl">
                  <img :src="sealPreviewUrl" alt="Seal Preview" class="size-full object-contain p-2" />
                  <button v-if="!loading" @click="clearSealSelection"
                    class="absolute top-1 right-1 size-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg">
                    <X class="size-3" />
                  </button>
                </template>
                <template v-else>
                  <Building2 class="size-8 text-muted-foreground/40" />
                </template>
                <div v-if="loading" class="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 class="size-6 animate-spin text-primary" />
                </div>
              </div>

              <div class="flex-1 space-y-4">
                <div class="flex flex-col gap-2">
                  <Button variant="outline" size="sm" @click="sealInput?.click()" :disabled="loading"
                    class="justify-start">
                    <Upload class="mr-2 size-4" />
                    {{ sealPreviewUrl ? 'Change Seal' : 'Select Seal' }}
                  </Button>
                  <Button v-if="appSettings.sealUrl" variant="ghost" size="sm" @click="removeSeal" :disabled="loading"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 justify-start">
                    <X class="mr-2 size-4" />
                    Remove Seal
                  </Button>
                  <input ref="sealInput" type="file" class="hidden" accept="image/*" @change="handleSealSelect" />
                </div>
                <Button v-if="selectedSealFile" @click="handleSealUpload" size="sm" class="w-full" :disabled="loading">
                  <template v-if="loading">
                    <Loader2 class="mr-2 size-4 animate-spin" />
                    Uploading...
                  </template>
                  <template v-else>
                    Apply Seal
                  </template>
                </Button>
              </div>
            </div>
          </div>

          <!-- Secondary Seal Section -->
          <div class="space-y-4">
            <Label>Secondary Company Seal</Label>
            <div class="flex items-start gap-4">
              <div
                class="relative group size-28 rounded-full border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden transition-colors hover:bg-muted/50">
                <template v-if="sealPreviewUrl2">
                  <img :src="sealPreviewUrl2" alt="Secondary Seal Preview" class="size-full object-contain p-2" />
                  <button v-if="!loading" @click="clearSealSelection2"
                    class="absolute top-1 right-1 size-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg">
                    <X class="size-3" />
                  </button>
                </template>
                <template v-else>
                  <Building2 class="size-8 text-muted-foreground/40" />
                </template>
                <div v-if="loading" class="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 class="size-6 animate-spin text-primary" />
                </div>
              </div>

              <div class="flex-1 space-y-4">
                <div class="flex flex-col gap-2">
                  <Button variant="outline" size="sm" @click="sealInput2?.click()" :disabled="loading"
                    class="justify-start">
                    <Upload class="mr-2 size-4" />
                    {{ sealPreviewUrl2 ? 'Change Seal' : 'Select Seal' }}
                  </Button>
                  <Button v-if="appSettings.sealUrl2" variant="ghost" size="sm" @click="removeSeal2" :disabled="loading"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 justify-start">
                    <X class="mr-2 size-4" />
                    Remove Seal
                  </Button>
                  <input ref="sealInput2" type="file" class="hidden" accept="image/*" @change="handleSealSelect2" />
                </div>
                <Button v-if="selectedSealFile2" @click="handleSealUpload2" size="sm" class="w-full"
                  :disabled="loading">
                  <template v-if="loading">
                    <Loader2 class="mr-2 size-4 animate-spin" />
                    Uploading...
                  </template>
                  <template v-else>
                    Apply Seal
                  </template>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Manager Authorization -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <PenLine class="size-5" />
          Manager Authorization
        </CardTitle>
        <CardDescription>
          The manager's name, position, and signature appear on approved OPEX PDFs. Unapproved PDFs show a DRAFT watermark without this information.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="managerName">Manager Full Name</Label>
            <Input id="managerName" v-model="form.managerName" placeholder="e.g. John Doe" />
          </div>
          <div class="space-y-2">
            <Label for="managerPosition">Manager Position / Title</Label>
            <Input id="managerPosition" v-model="form.managerPosition" placeholder="e.g. Operations Manager" />
          </div>
        </div>

        <div class="space-y-3">
          <Label>Manager Signature Image</Label>
          <p class="text-xs text-muted-foreground">Upload a transparent PNG or scanned signature. This will appear on all approved OPEX PDFs.</p>
          <div class="flex items-start gap-4">
            <div
              class="relative group w-48 h-20 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden transition-colors hover:bg-muted/50">
              <template v-if="signaturePreviewUrl">
                <img :src="signaturePreviewUrl" alt="Signature Preview" class="size-full object-contain p-2" />
                <button v-if="!loading" @click="clearSignatureSelection"
                  class="absolute top-1 right-1 size-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg">
                  <X class="size-3" />
                </button>
              </template>
              <template v-else>
                <PenLine class="size-8 text-muted-foreground/40" />
              </template>
              <div v-if="loading" class="absolute inset-0 bg-background/60 flex items-center justify-center">
                <Loader2 class="size-6 animate-spin text-primary" />
              </div>
            </div>

            <div class="flex-1 space-y-2">
              <div class="flex flex-col gap-2">
                <Button variant="outline" size="sm" @click="signatureInput?.click()" :disabled="loading"
                  class="justify-start">
                  <Upload class="mr-2 size-4" />
                  {{ signaturePreviewUrl ? 'Change Signature' : 'Select Signature' }}
                </Button>
                <Button v-if="appSettings.managerSignatureUrl" variant="ghost" size="sm" @click="removeSignature" :disabled="loading"
                  class="text-destructive hover:text-destructive hover:bg-destructive/10 justify-start">
                  <X class="mr-2 size-4" />
                  Remove Signature
                </Button>
                <input ref="signatureInput" type="file" class="hidden" accept="image/*" @change="handleSignatureSelect" />
              </div>
              <Button v-if="selectedSignatureFile" @click="handleSignatureUpload" size="sm" class="w-full" :disabled="loading">
                <template v-if="loading">
                  <Loader2 class="mr-2 size-4 animate-spin" />
                  Uploading...
                </template>
                <template v-else>
                  Apply Signature
                </template>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- General Company Information -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Building2 class="size-5" />
          General Information
        </CardTitle>
        <CardDescription>
          Primary identification and contact details for your organization.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-6">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="companyName">Company Name</Label>
            <Input id="companyName" v-model="form.companyName" placeholder="IncapttaPro Ltd" />
          </div>
          <div class="space-y-2">
            <Label for="email">Email Address</Label>
            <Input id="email" v-model="form.email" placeholder="contact@example.com" />
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-4">
          <div class="space-y-2 md:col-span-1">
            <Label for="address">Street Address</Label>
            <Input id="address" v-model="form.address" placeholder="123 Business Way" />
          </div>
          <div class="space-y-2">
            <Label for="city">City</Label>
            <Input id="city" v-model="form.city" placeholder="Harare" />
          </div>
          <div class="space-y-2">
            <Label for="country">Country</Label>
            <Input id="country" v-model="form.country" placeholder="Zimbabwe" />
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="phone1">Phone Number 1</Label>
            <Input id="phone1" v-model="form.phone1" placeholder="+263 ..." />
          </div>
          <div class="space-y-2">
            <Label for="phone2">Phone Number 2</Label>
            <Input id="phone2" v-model="form.phone2" placeholder="+263 ..." />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="website">Website</Label>
          <Input id="website" v-model="form.website" placeholder="https://www.example.com" />
        </div>
      </CardContent>
    </Card>

    <!-- Finance Information -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Landmark class="size-5" />
          Finance Information
        </CardTitle>
        <CardDescription>
          Banking details used for payments, invoices, and transfers.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-8">
        <!-- Primary Account -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold opacity-70">
            <span class="size-2 rounded-full bg-primary"></span>
            Primary Bank Account
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="bankName">Bank Name</Label>
              <Input id="bankName" v-model="form.bankName" placeholder="e.g. Standard Chartered" />
            </div>
            <div class="space-y-2">
              <Label for="accountName">Account Name</Label>
              <Input id="accountName" v-model="form.accountName" placeholder="e.g. IncapttaPro Ltd" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="bankAccount">Bank Account Number</Label>
              <Input id="bankAccount" v-model="form.bankAccount" placeholder="... ..." />
            </div>
            <div class="space-y-2">
              <Label for="swiftCode">Swift Code</Label>
              <Input id="swiftCode" v-model="form.swiftCode" placeholder="ABCDEFGH" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="branchCode">Branch Code</Label>
              <Input id="branchCode" v-model="form.branchCode" placeholder="001" />
            </div>
          </div>
        </div>

        <div class="border-t border-dashed h-px w-full"></div>

        <!-- Secondary Account -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold opacity-70">
            <span class="size-2 rounded-full bg-muted-foreground/50"></span>
            Secondary Bank Account
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="bankName2">Bank Name</Label>
              <Input id="bankName2" v-model="form.bankName2" placeholder="Secondary Bank Name" />
            </div>
            <div class="space-y-2">
              <Label for="accountName2">Account Name</Label>
              <Input id="accountName2" v-model="form.accountName2" placeholder="e.g. IncapttaPro Ltd" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="bankAccount2">Bank Account Number</Label>
              <Input id="bankAccount2" v-model="form.bankAccount2" placeholder="... ..." />
            </div>
            <div class="space-y-2">
              <Label for="swiftCode2">Swift Code</Label>
              <Input id="swiftCode2" v-model="form.swiftCode2" placeholder="ABCDEFGH" />
            </div>
          </div>
          <div class="grid md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="branchCode2">Branch Code</Label>
              <Input id="branchCode2" v-model="form.branchCode2" placeholder="002" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- VAT Settings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Landmark class="size-5" />
          Tax Settings (VAT)
        </CardTitle>
        <CardDescription>
          Configure Value Added Tax. When enabled, VAT is automatically applied to all invoices and quotes.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-6">
        <!-- Toggle row -->
        <div class="flex items-center justify-between rounded-lg border p-4">
          <div class="space-y-0.5">
            <p class="text-sm font-semibold">Apply VAT to Invoices &amp; Quotes</p>
            <p class="text-xs text-muted-foreground">
              Status:
              <span :class="form.vatEnabled ? 'text-emerald-600 font-bold' : 'text-muted-foreground'">
                {{ form.vatEnabled ? 'Enabled' : 'Disabled' }}
              </span>
            </p>
          </div>
          <!-- Tailwind toggle switch -->
          <button
            type="button"
            role="switch"
            :aria-checked="form.vatEnabled"
            @click="form.vatEnabled = !form.vatEnabled"
            :class="[
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              form.vatEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
            ]"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out',
                form.vatEnabled ? 'translate-x-5' : 'translate-x-0'
              ]"
            />
          </button>
        </div>

        <!-- Rate input — only shown when enabled -->
        <div v-if="form.vatEnabled" class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="vatRate">VAT Rate (%)</Label>
            <div class="relative">
              <Input
                id="vatRate"
                v-model.number="form.vatRate"
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="e.g. 15"
                class="pr-10"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">%</span>
            </div>
            <p class="text-xs text-muted-foreground">
              Current rate: <span class="font-semibold text-foreground">{{ form.vatRate > 0 ? form.vatRate + '%' : '0% (enter a value)' }}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Terms and Conditions -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <ShieldAlert class="size-5" />
          Terms and Conditions
        </CardTitle>
        <CardDescription>
          Legal notices and supplementary information shown on documents.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-6">
        <div class="space-y-2">
          <Label for="paymentTerms">Payment Terms</Label>
          <Textarea id="paymentTerms" v-model="form.paymentTerms" placeholder="e.g. 50% Upfront, 50% on Completion..."
            rows="3" />
        </div>
        <div class="space-y-2">
          <Label for="termsAdvised">Please Be Advised</Label>
          <Textarea id="termsAdvised" v-model="form.termsAdvised" placeholder="Important notices for customers..."
            rows="4" />
        </div>
        <div class="space-y-2">
          <Label for="termsOther">Other Information</Label>
          <Textarea id="termsOther" v-model="form.termsOther" placeholder="Additional details..." rows="3" />
        </div>
        <div class="space-y-2">
          <Label for="moreTerms">More Terms and Conditions</Label>
          <Textarea id="moreTerms" v-model="form.moreTerms" placeholder="Supplementary terms and conditions..."
            rows="4" />
        </div>
      </CardContent>
    </Card>

    <!-- UI Color Customizations -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Palette class="size-5" />
          Dashboard & UI Colors
        </CardTitle>
        <CardDescription>
          Customize specific text and chart colors for the dashboard and ledger dynamically.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-6">
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="space-y-2">
            <Label for="lowStockColor">Low Stock Items</Label>
            <div class="flex gap-2">
              <Input type="color" id="lowStockColor" v-model="form.uiColors.lowStockColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.lowStockColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="outOfStockColor">Out of Stock Items</Label>
            <div class="flex gap-2">
              <Input type="color" id="outOfStockColor" v-model="form.uiColors.outOfStockColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.outOfStockColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="ecocashBalanceColor">EcoCash / RTGS Balance</Label>
            <div class="flex gap-2">
              <Input type="color" id="ecocashBalanceColor" v-model="form.uiColors.ecocashBalanceColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.ecocashBalanceColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="bankBalanceColor">Ledger Bank Balance</Label>
            <div class="flex gap-2">
              <Input type="color" id="bankBalanceColor" v-model="form.uiColors.bankBalanceColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.bankBalanceColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="irdBalanceColor">Ledger IRD Balance</Label>
            <div class="flex gap-2">
              <Input type="color" id="irdBalanceColor" v-model="form.uiColors.irdBalanceColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.irdBalanceColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="pieChartIncomeColor">Pie Chart Income</Label>
            <div class="flex gap-2">
              <Input type="color" id="pieChartIncomeColor" v-model="form.uiColors.pieChartIncomeColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.pieChartIncomeColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="pieChartExpenseColor">Pie Chart Expense</Label>
            <div class="flex gap-2">
              <Input type="color" id="pieChartExpenseColor" v-model="form.uiColors.pieChartExpenseColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.pieChartExpenseColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="brandPrimaryColor">Global Brand Primary</Label>
            <div class="flex gap-2">
              <Input type="color" id="brandPrimaryColor" v-model="form.uiColors.brandPrimaryColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.brandPrimaryColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="brandSecondaryColor">Global Brand Secondary</Label>
            <div class="flex gap-2">
              <Input type="color" id="brandSecondaryColor" v-model="form.uiColors.brandSecondaryColor"
                class="w-16 h-10 p-1 cursor-pointer" />
              <Input type="text" v-model="form.uiColors.brandSecondaryColor" class="font-mono uppercase" />
            </div>
          </div>
          <div class="space-y-4 border-t pt-4 md:col-span-2 lg:col-span-3">
            <h4 class="text-sm font-bold uppercase tracking-widest text-brand-primary mb-2">CRM Grid Customization</h4>
            <div class="grid md:grid-cols-3 gap-6">
              <div class="space-y-2">
                <Label>CRM Header Background</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.crmGridHeaderBg" class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.crmGridHeaderBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>CRM Header Text</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.crmGridHeaderTextColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.crmGridHeaderTextColor" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>CRM Border Color</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.crmGridBorderColor" class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.crmGridBorderColor" class="font-mono uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-4 border-t pt-4 md:col-span-2 lg:col-span-3">
            <h4 class="text-sm font-bold uppercase tracking-widest text-brand-primary mb-2">OPEX Grid Customization</h4>
            <div class="grid md:grid-cols-3 gap-6">
              <div class="space-y-2">
                <Label>OPEX Header Background</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.opexGridHeaderBg" class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.opexGridHeaderBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>OPEX Header Text</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.opexGridHeaderTextColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.opexGridHeaderTextColor" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>OPEX Border Color</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.opexGridBorderColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.opexGridBorderColor" class="font-mono uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-4 border-t pt-4 md:col-span-2 lg:col-span-3">
            <h4 class="text-sm font-bold uppercase tracking-widest text-brand-primary mb-2">Job Cards Grid Customization
            </h4>
            <div class="grid md:grid-cols-3 gap-6">
              <div class="space-y-2">
                <Label>Job Cards Header Background</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.jobCardsGridHeaderBg"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.jobCardsGridHeaderBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Job Cards Header Text</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.jobCardsGridHeaderTextColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.jobCardsGridHeaderTextColor" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Job Cards Border Color</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.jobCardsGridBorderColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.jobCardsGridBorderColor" class="font-mono uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-4 border-t pt-4 md:col-span-2 lg:col-span-3">
            <h4 class="text-sm font-bold uppercase tracking-widest text-brand-primary mb-2">Ledger Grid Customization
            </h4>
            <div class="grid md:grid-cols-3 gap-6">
              <div class="space-y-2">
                <Label>Ledger Header Background</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.ledgerGridHeaderBg" class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.ledgerGridHeaderBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Ledger Header Text</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.ledgerGridHeaderTextColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.ledgerGridHeaderTextColor" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Ledger Border Color</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.ledgerGridBorderColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.ledgerGridBorderColor" class="font-mono uppercase" />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-4 border-t pt-4 md:col-span-2 lg:col-span-3">
            <h4 class="text-sm font-bold uppercase tracking-widest text-brand-primary mb-2">Inventory Grid Customization
            </h4>
            <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="space-y-2">
                <Label>Inventory Header Background</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.inventoryGridHeaderBg"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.inventoryGridHeaderBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Inventory Header Text</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.inventoryGridHeaderTextColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.inventoryGridHeaderTextColor" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Inventory Secondary BG</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.inventoryGridSecondaryBg"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.inventoryGridSecondaryBg" class="font-mono uppercase" />
                </div>
              </div>
              <div class="space-y-2">
                <Label>Inventory Border Color</Label>
                <div class="flex gap-2">
                  <Input type="color" v-model="form.uiColors.inventoryGridBorderColor"
                    class="w-16 h-10 p-1 cursor-pointer" />
                  <Input type="text" v-model="form.uiColors.inventoryGridBorderColor" class="font-mono uppercase" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card v-if="canManageInventoryPin" class="border-brand-primary/20 shadow-lg">
      <CardHeader>
        <div class="flex items-center gap-3">
          <ShieldAlert class="h-5 w-5 text-brand-secondary" />
          <div>
            <CardTitle>Inventory Access PIN</CardTitle>
            <CardDescription>Managers must enter this PIN before opening inventory master pages and the admin settings page.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="rounded-lg border border-brand-secondary/20 bg-brand-secondary/5 px-4 py-3 text-sm">
          <span class="font-semibold">Current status:</span>
          {{ inventoryPinConfigured ? 'Configured' : 'Not configured' }}
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="inventoryManagerPin">New Inventory PIN</Label>
            <Input
              id="inventoryManagerPin"
              v-model="inventoryManagerPin"
              type="password"
              autocomplete="new-password"
              placeholder="Enter new PIN"
            />
            <p class="text-xs text-muted-foreground">This same PIN is used for Inventory and `/admin`. Leave blank to keep it unchanged.</p>
          </div>

          <div class="space-y-2">
            <Label for="inventoryManagerPinConfirm">Confirm Inventory PIN</Label>
            <Input
              id="inventoryManagerPinConfirm"
              v-model="inventoryManagerPinConfirm"
              type="password"
              autocomplete="new-password"
              placeholder="Re-enter PIN"
            />
          </div>
        </div>

        <div class="flex justify-end">
          <Button
            v-if="inventoryPinConfigured"
            type="button"
            variant="outline"
            class="border-destructive/40 text-destructive hover:bg-destructive/10"
            @click="clearInventoryPin"
          >
            Remove Inventory PIN
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Save Floating Action -->
    <div class="fixed bottom-6 right-6 z-[60]">
      <Button size="lg" @click="handleSaveGeneral" :disabled="loading" class="shadow-xl px-8 gap-2">
        <Loader2 v-if="loading" class="size-4 animate-spin" />
        <Save v-else class="size-4" />
        Save All Settings
      </Button>
    </div>
  </div>
</template>
