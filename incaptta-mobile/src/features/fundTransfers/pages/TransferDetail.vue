<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Transfer Detail</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="transfer">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ transfer.transferNumber || 'Transfer' }}</ion-card-title>
            <ion-card-subtitle>{{ formatCurrency(transfer.amount) }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p v-if="transfer.description">{{ transfer.description }}</p>
            <ion-item lines="none">
              <ion-label>
                <p>From Account</p>
                <h3>{{ transfer.fromAccount }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>To Account</p>
                <h3>{{ transfer.toAccount }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Amount</p>
                <h2>{{ formatCurrency(transfer.amount) }}</h2>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(transfer.status)">{{ transfer.status }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Date</p>
                <h3>{{ formatDate(transfer.date) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="transfer.reference">
              <ion-label>
                <p>Reference</p>
                <h3>{{ transfer.reference }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="transfer.notes">
              <ion-label>
                <p>Notes</p>
                <h3>{{ transfer.notes }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Created By</p>
                <h3>{{ transfer.createdByName || transfer.createdBy }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Created At</p>
                <h3>{{ formatDate(transfer.createdAt) }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <div v-if="canApprove || canCancel" class="ion-padding">
          <ion-button v-if="canApprove" expand="block" color="success" @click="approve" :disabled="loading" class="ion-margin-bottom">
            <ion-spinner v-if="loading" name="crescent"></ion-spinner>
            <span v-else>Approve Transfer</span>
          </ion-button>

          <ion-button v-if="canCancel" expand="block" color="danger" fill="outline" @click="cancel" :disabled="loading">
            <ion-spinner v-if="loading" name="crescent"></ion-spinner>
            <span v-else>Cancel Transfer</span>
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonItem, IonLabel, IonButton, IonSpinner
} from '@ionic/vue'
import { useFundTransfersStore } from '../store/fundTransfersStore'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const transfersStore = useFundTransfersStore()
const authStore = useAuthStore()

const loading = ref(false)

const transfer = computed(() => 
  transfersStore.transfers.find(t => t.id === route.params.id)
)

const canApprove = computed(() => {
  if (!transfer.value) return false
  const status = transfer.value.status
  const isSuper = authStore.hasRole('SUPER_ADMIN' as any)
  
  if (status === 'PENDING_ACCOUNTANT') return isSuper || authStore.hasRole('ACCOUNTANT' as any)
  if (status === 'PENDING_MANAGER') return isSuper || authStore.hasRole('MANAGER' as any)
  return false
})

const canCancel = computed(() => {
  if (!transfer.value) return false
  const status = transfer.value.status
  const isPending = ['PENDING_ACCOUNTANT', 'PENDING_MANAGER'].includes(status)
  if (!isPending) return false

  const isSuper = authStore.hasRole('SUPER_ADMIN' as any)
  const isAccountant = authStore.hasRole('ACCOUNTANT' as any)
  const isInitiator = transfer.value.initiatedByEmail === authStore.userEmail
  
  return isSuper || isAccountant || isInitiator
})

const approve = async () => {
  if (transfer.value) {
    loading.value = true
    try {
      await transfersStore.handleApproval(
        transfer.value.id,
        transfer.value.status,
        authStore.userRoles[0] as string,
        authStore.displayName || authStore.userEmail
      )
    } catch (err) {
      console.error('Approval failed:', err)
    } finally {
      loading.value = false
    }
  }
}

const cancel = async () => {
  if (transfer.value) {
    loading.value = true
    try {
      await transfersStore.cancelTransfer(
        transfer.value.id,
        authStore.displayName || authStore.userEmail,
        authStore.userEmail
      )
      router.back()
    } catch (err) {
      console.error('Cancellation failed:', err)
    } finally {
      loading.value = false
    }
  }
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    PENDING_ACCOUNTANT: 'warning',
    PENDING_MANAGER: 'primary',
    COMPLETED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'medium'
  }
  return colors[status] || 'medium'
}

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
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  if (transfersStore.transfers.length === 0) {
    transfersStore.fetchTransfers()
  }
})
</script>
