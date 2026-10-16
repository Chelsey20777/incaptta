<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Expense Detail</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="expense">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ expense.expenseNumber || 'EXP-TEMP' }}</ion-card-title>
            <ion-card-title>{{ expense.title }}</ion-card-title>
            <ion-card-subtitle>{{ expense.category }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ expense.description }}</p>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(expense.status)">{{ expense.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Date Submitted</p>
                <h3>{{ formatDate(expense.createdAt) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="expense.beneficiary">
              <ion-label>
                <p>Beneficiary</p>
                <h3>{{ expense.beneficiary }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <!-- Line Items -->
        <ion-card v-if="expense.items && expense.items.length > 0">
          <ion-card-header>
            <ion-card-subtitle>Line Items</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item v-for="(item, index) in expense.items" :key="index">
                <ion-label>
                  <h3>{{ item.description }}</h3>
                  <p>{{ item.quantity }} x ${{ formatCurrency(item.estCost) }}</p>
                </ion-label>
                <ion-note slot="end" color="dark">
                  ${{ formatCurrency(item.quantity * item.estCost) }}
                </ion-note>
              </ion-item>
              <ion-item lines="none">
                <ion-label slot="end" class="total-label">
                  <p>Grand Total</p>
                  <h2>${{ formatCurrency(expense.amount) }}</h2>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="(expense.attachmentUrls && expense.attachmentUrls.length > 0) || expense.attachmentUrl || expense.receiptUrl">
          <ion-card-header>
            <ion-card-title>Attachments</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div class="space-y-4">
              <div v-for="(url, idx) in (expense.attachmentUrls && expense.attachmentUrls.length > 0 ? expense.attachmentUrls : [expense.attachmentUrl || expense.receiptUrl])" :key="idx" class="attachment-item">
                <p class="text-xs font-bold mb-2">Attachment {{ idx + 1 }}</p>
                <div v-if="isImage(url)" class="receipt-preview">
                  <img :src="url" alt="Receipt" class="attachment-img" />
                </div>
                <div v-else class="document-preview-card">
                  <ion-icon :icon="documentOutline" class="doc-icon" />
                  <span class="doc-name">{{ getFileName(url) }}</span>
                </div>
                <ion-button expand="block" fill="outline" size="small" @click="openDocument(url)" class="ion-margin-top">
                  <ion-icon slot="start" :icon="eyeOutline" />
                  Open Document
                </ion-button>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <ion-card v-if="canApprove">
          <ion-card-content>
            <ion-button expand="block" color="success" @click="approve" :disabled="loading">
              <ion-spinner v-if="loading" name="crescent"></ion-spinner>
              <span v-else>{{ approvalActionText }}</span>
            </ion-button>
            <ion-button expand="block" color="danger" @click="reject" :disabled="loading">
              Reject
            </ion-button>
          </ion-card-content>
        </ion-card>

        <div v-if="expense.rejectionReason" class="rejection-box">
          <ion-item lines="none" color="danger">
            <ion-label>
              <p color="light">Rejection Reason</p>
              <h3 color="light">{{ expense.rejectionReason }}</h3>
            </ion-label>
          </ion-item>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonItem, IonLabel, IonButton, IonSpinner,
  IonList, IonNote, IonIcon, alertController
} from '@ionic/vue'
import { useOperationalExpensesStore } from '../store/operationalExpensesStore'
import { useAuthStore } from '@/stores/authStore'
import { documentOutline, eyeOutline } from 'ionicons/icons'

const route = useRoute()
const router = useRouter()
const opexStore = useOperationalExpensesStore()
const authStore = useAuthStore()

const expense = computed(() => 
  opexStore.expenses.find(e => e.id === route.params.id)
)

const canApprove = computed(() => {
  if (!expense.value) return false
  const status = expense.value.status
  const isSuper = authStore.hasRole('SUPER_ADMIN' as any) || authStore.hasRole('ADMIN' as any)

  if (status === 'PENDING_ACCOUNTANT') {
    return isSuper || authStore.hasRole('ACCOUNTANT' as any)
  }
  if (status === 'APPROVED_ACCOUNTANT') {
    return isSuper || authStore.hasRole('MANAGER' as any)
  }
  return false
})

const approvalActionText = computed(() => {
  if (expense.value?.status === 'PENDING_ACCOUNTANT') return 'Accountant Approval'
  if (expense.value?.status === 'APPROVED_ACCOUNTANT') return 'Manager Final Approval'
  return 'Approve'
})

const loading = ref(false)

const formatCurrency = (val?: number) => {
  if (val === undefined || val === null) return '0.00'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

const formatDate = (date: any) => {
  if (!date) return 'N/A'
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    PENDING_ACCOUNTANT: 'warning',
    APPROVED_ACCOUNTANT: 'primary',
    PENDING_MANAGER: 'warning',
    APPROVED: 'success',
    APPROVED_FOR_PAYMENT: 'success',
    PAYMENT_PROCESSED: 'success',
    REJECTED: 'danger'
  }
  return colors[status] || 'medium'
}

const approve = async () => {
  if (expense.value) {
    loading.value = true
    try {
      await opexStore.handleApproval(
        expense.value.id, 
        expense.value.status, 
        authStore.userRoles[0] || 'TECHNICAL', 
        authStore.userEmail!, 
        authStore.displayName || ''
      )
    } finally {
      loading.value = false
    }
  }
}

const reject = async () => {
  if (expense.value) {
    const alert = await alertController.create({
      header: 'Reject Expense',
      inputs: [{
        name: 'reason',
        type: 'textarea',
        placeholder: 'Please provide a reason for rejection',
      }],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Reject',
          handler: (data) => {
            if (data.reason) {
              handleRejection(data.reason)
            }
          },
        },
      ],
    })
    await alert.present()
  }
}

const handleRejection = async (reason: string) => {
  if (expense.value) {
    loading.value = true
    try {
      await opexStore.rejectExpense(expense.value.id, authStore.userEmail!, reason)
    } finally {
      loading.value = false
    }
  }
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

const openDocument = (url: string) => {
  if (url) window.open(url, '_blank')
}

onMounted(() => {
  if (opexStore.expenses.length === 0) {
    opexStore.fetchExpenses()
  }
})
</script>

<style scoped>
.attachment-img {
  max-width: 100%;
  border-radius: 8px;
  display: block;
  margin: 0 auto;
}

.attachment-item {
  border: 1px solid var(--ion-color-light-shade);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.document-preview-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--ion-color-light);
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
}

.doc-icon {
  font-size: 32px;
  color: var(--ion-color-primary);
}

.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ion-color-dark);
  word-break: break-all;
}

.receipt-preview {
  margin-top: 8px;
  text-align: center;
}

.total-label {
  text-align: right;
}

.rejection-box {
  margin: 16px;
  border-radius: 8px;
  overflow: hidden;
}
</style>
