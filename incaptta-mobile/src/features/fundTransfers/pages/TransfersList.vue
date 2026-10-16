<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Fund Transfers</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-segment v-model="filterStatus">
        <ion-segment-button value="all">
          <ion-label>All</ion-label>
        </ion-segment-button>
        <ion-segment-button value="pending">
          <ion-label>Pending</ion-label>
        </ion-segment-button>
        <ion-segment-button value="completed">
          <ion-label>Completed</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-list>
        <ion-item v-for="transfer in filteredTransfers" :key="transfer.id" button @click="viewDetail(transfer.id)">
          <ion-label>
            <h2>{{ transfer.transferNumber }}</h2>
            <h3>{{ transfer.fromAccountName }} → {{ transfer.toAccountName }}</h3>
            <p>{{ formatDate(transfer.date) }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ transfer.amount }}</h2>
            <p :color="getStatusColor(transfer.status)">{{ transfer.status }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonButton, IonButtons, IonIcon
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useFundTransfersStore } from '../store/fundTransfersStore'

const router = useRouter()
const transfersStore = useFundTransfersStore()

const filterStatus = ref('all')

const filteredTransfers = computed(() => {
  if (filterStatus.value === 'pending') {
    return transfersStore.pendingTransfers
  } else if (filterStatus.value === 'completed') {
    return transfersStore.completedTransfers
  }
  return transfersStore.transfers
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    COMPLETED: 'success'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/more/transfers/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/transfers/${id}`)
}

onMounted(() => {
  transfersStore.fetchTransfers()
})
</script>
