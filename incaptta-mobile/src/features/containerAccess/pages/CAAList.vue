<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Container Access</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item v-for="caa in caaRecords" :key="caa.id" button @click="viewDetail(caa.id)">
          <ion-label>
            <h2>{{ caa.caaNumber }}</h2>
            <h3>{{ caa.requestedByName }}</h3>
            <p>{{ caa.containerLocation }}</p>
            <p>{{ formatDate(caa.date) }} | {{ caa.startTime }} - {{ caa.endTime }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getStatusColor(caa.status)">
            {{ caa.status }}
          </ion-badge>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useContainerAccessStore } from '../store/containerAccessStore'

const router = useRouter()
const caaStore = useContainerAccessStore()

const caaRecords = computed(() => caaStore.caaRecords)

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/more/container-access/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/container-access/${id}`)
}

onMounted(() => {
  caaStore.fetchCAARecords()
})
</script>
