<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Expense</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="save" :disabled="!isFormValid">
            <ion-icon slot="icon-only" :icon="checkmarkOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Expense Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Title *</ion-label>
            <ion-input v-model="formData.title" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Description</ion-label>
            <ion-textarea v-model="formData.description" :rows="3" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Category *</ion-label>
            <ion-select v-model="formData.category">
              <ion-select-option value="Travel">Travel</ion-select-option>
              <ion-select-option value="Supplies">Supplies</ion-select-option>
              <ion-select-option value="Utilities">Utilities</ion-select-option>
              <ion-select-option value="Maintenance">Maintenance</ion-select-option>
              <ion-select-option value="Communication">Communication</ion-select-option>
              <ion-select-option value="Other">Other</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Amount *</ion-label>
            <ion-input v-model="formData.amount" type="number" />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Date *</ion-label>
            <ion-datetime v-model="formData.date" presentation="date" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Expense Items</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-button expand="block" size="small" @click="addItem">
            <ion-icon slot="start" :icon="addOutline" />
            Add Item
          </ion-button>
          <ion-list>
            <ion-item v-for="(item, index) in items" :key="index">
              <ion-label position="stacked">Description</ion-label>
              <ion-input v-model="item.description" placeholder="e.g. Fuel" />
              <ion-label position="stacked">Qty</ion-label>
              <ion-input v-model="item.quantity" type="number" />
              <ion-label position="stacked">Est. Cost</ion-label>
              <ion-input v-model="item.estCost" type="number" @ionChange="updateTotal" />
              <ion-button slot="end" fill="clear" color="danger" @click="removeItem(index)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
          <ion-item lines="none">
            <ion-label slot="end">
              <p>Total Amount</p>
              <h2>${{ formatCurrency(totalAmount) }}</h2>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Receipts / Attachments</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-button expand="block" @click="captureReceipt">
            <ion-icon slot="start" :icon="cameraOutline" />
            Capture Attachment
          </ion-button>
          
          <ion-list v-if="formData.attachmentUrls && formData.attachmentUrls.length > 0" class="ion-margin-top">
            <ion-item v-for="(url, idx) in formData.attachmentUrls" :key="idx">
              <ion-thumbnail slot="start" class="ion-flex ion-align-items-center ion-justify-content-center">
                <img v-if="isImage(url)" :src="url" alt="Receipt preview" />
                <ion-icon v-else :icon="documentOutline" style="font-size: 24px; color: var(--ion-color-primary);" />
              </ion-thumbnail>
              <ion-label>
                <h3>{{ getFileName(url) }}</h3>
                <p>Attachment {{ idx + 1 }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" color="danger" @click="removeAttachment(idx)">
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Submit Expense
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonDatetime, IonList, IonThumbnail
} from '@ionic/vue'
import { checkmarkOutline, cameraOutline, addOutline, trashOutline, documentOutline } from 'ionicons/icons'
import { useOperationalExpensesStore } from '../store/operationalExpensesStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const opexStore = useOperationalExpensesStore()
const authStore = useAuthStore()

const items = ref<Array<{ description: string; quantity: number; estCost: number }>>([
  { description: '', quantity: 1, estCost: 0 }
])

const formData = ref({
  title: '',
  description: '',
  category: '',
  attachmentUrl: '',
  attachmentUrls: [] as string[],
  department: '',
  beneficiary: '',
  paymentMethod: 'CASH',
  amount: 0,
  date: new Date().toISOString()
})

const totalAmount = computed(() => {
  return items.value.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.estCost)), 0)
})

const updateTotal = () => {
  // Computed property handles this automatically
}

const isFormValid = computed(() => {
  return formData.value.title && 
         formData.value.category &&
         totalAmount.value > 0 &&
         items.value.every(i => i.description && i.quantity > 0 && i.estCost >= 0)
})

import { takePhotoAndUpload } from '@/utils/camera'

const loading = ref(false)

const addItem = () => {
  items.value.push({ description: '', quantity: 1, estCost: 0 })
}

const removeItem = (index: number) => {
  items.value.splice(index, 1)
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const isImage = (url: string) => {
  if (!url) return false
  const cleanUrl = url.split('?')[0].toLowerCase()
  return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.webp')
}

const getFileName = (url: string) => {
  if (!url) return 'Document'
  try {
    const decoded = decodeURIComponent(url)
    const pathPart = decoded.split('?')[0]
    const parts = pathPart.split('/')
    const fullName = parts[parts.length - 1]
    return fullName.replace(/^\d+_/g, '')
  } catch (err) {
    return 'Document'
  }
}

const captureReceipt = async () => {
  try {
    const url = await takePhotoAndUpload('opex_receipts')
    if (!formData.value.attachmentUrls) {
      formData.value.attachmentUrls = []
    }
    formData.value.attachmentUrls.push(url)
    formData.value.attachmentUrl = formData.value.attachmentUrls[0] || url
  } catch (err) {
    console.error('Failed to capture receipt:', err)
  }
}

const removeAttachment = (index: number) => {
  formData.value.attachmentUrls.splice(index, 1)
  formData.value.attachmentUrl = formData.value.attachmentUrls[0] || ''
}

const save = async () => {
  if (!isFormValid.value) return
  
  loading.value = true
  try {
    await opexStore.createExpense(
      {
        ...formData.value,
        amount: totalAmount.value,
        items: items.value,
        createdAt: new Date().toISOString() as any
      }, 
      authStore.userId, 
      authStore.userEmail
    )
    router.push('/tabs/more/opex')
  } catch (err) {
    console.error('Failed to save expense:', err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.receipt-preview {
  margin-top: 16px;
  text-align: center;
}

.receipt-preview img {
  max-width: 100%;
  border-radius: 8px;
}
</style>
