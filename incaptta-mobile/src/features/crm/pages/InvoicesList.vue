<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Invoices</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search invoices..." />

      <ion-list>
        <ion-item v-for="invoice in filteredInvoices" :key="invoice.id" button @click="viewDetail(invoice.id)">
          <ion-label>
            <h2>{{ invoice.invoiceNumber }}</h2>
            <h3>{{ invoice.customerName }}</h3>
            <p>Due: {{ formatDate(invoice.dueDate) }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ invoice.total }}</h2>
            <p :color="getStatusColor(invoice.status)">{{ invoice.status }}</p>
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

const filteredInvoices = computed(() => {
  let invoices = crmStore.invoices

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    invoices = invoices.filter(i => 
      i.invoiceNumber.toLowerCase().includes(query) ||
      i.customerName.toLowerCase().includes(query)
    )
  }

  return invoices
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SENT: 'primary',
    PAID: 'success',
    OVERDUE: 'danger',
    CANCELLED: 'warning'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/crm/invoices/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/crm/invoices/${id}`)
}

onMounted(() => {
  crmStore.fetchInvoices()
})
</script>
