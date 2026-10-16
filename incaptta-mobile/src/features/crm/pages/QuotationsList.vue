<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Quotations</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search quotations..." />

      <ion-list>
        <ion-item v-for="quotation in filteredQuotations" :key="quotation.id" button @click="viewDetail(quotation.id)">
          <ion-label>
            <h2>{{ quotation.quotationNumber }}</h2>
            <h3>{{ quotation.customerName }}</h3>
            <p>{{ formatDate(quotation.date) }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ quotation.total }}</h2>
            <p :color="getStatusColor(quotation.status)">{{ quotation.status }}</p>
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
  IonSearchbar, IonList, IonItem, IonButton, IonButtons, IonIcon, IonLabel
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useCrmStore } from '../store/crmStore'

const router = useRouter()
const crmStore = useCrmStore()

const searchQuery = ref('')

const filteredQuotations = computed(() => {
  let quotations = crmStore.quotations

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    quotations = quotations.filter(q => 
      q.quotationNumber.toLowerCase().includes(query) ||
      q.customerName.toLowerCase().includes(query)
    )
  }

  return quotations
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SENT: 'primary',
    ACCEPTED: 'success',
    REJECTED: 'danger',
    EXPIRED: 'warning'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/crm/quotations/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/crm/quotations/${id}`)
}

onMounted(() => {
  crmStore.fetchQuotations()
})
</script>
