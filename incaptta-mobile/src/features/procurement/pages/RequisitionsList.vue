<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Requisitions</ion-title>
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
        <ion-segment-button value="approved">
          <ion-label>Approved</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-list>
        <ion-item v-for="req in filteredRequisitions" :key="req.id" button @click="viewDetail(req.id)">
          <ion-label>
            <h2>{{ req.requisitionNumber }}</h2>
            <h3>{{ req.requestedByName }}</h3>
            <p>{{ req.department }}</p>
            <p>Required: {{ formatDate(req.requiredDate) }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ req.totalEstimatedCost }}</h2>
            <p :color="getStatusColor(req.status)">{{ req.status }}</p>
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
import { useProcurementStore } from '../store/procurementStore'

const router = useRouter()
const procurementStore = useProcurementStore()

const filterStatus = ref('all')

const filteredRequisitions = computed(() => {
  if (filterStatus.value === 'pending') {
    return procurementStore.pendingRequisitions
  } else if (filterStatus.value === 'approved') {
    return procurementStore.approvedRequisitions
  }
  return procurementStore.requisitions
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    ORDERED: 'primary',
    RECEIVED: 'success'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/more/procurement/requisitions/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/procurement/requisitions/${id}`)
}

onMounted(() => {
  procurementStore.fetchRequisitions()
})
</script>
