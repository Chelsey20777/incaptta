<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Customers</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search customers..." />

      <ion-list>
        <ion-item v-for="customer in filteredCustomers" :key="customer.id" button @click="viewDetail(customer.id)">
          <ion-label>
            <h2>{{ customer.customerNumber }}</h2>
            <h3>{{ customer.name }}</h3>
            <p>{{ customer.company || customer.email || customer.phone }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getStatusColor(customer.status)">
            {{ customer.status }}
          </ion-badge>
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
  IonSearchbar, IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon, IonLabel
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useCrmStore } from '../store/crmStore'

const router = useRouter()
const crmStore = useCrmStore()

const searchQuery = ref('')

const filteredCustomers = computed(() => {
  let customers = crmStore.customers

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    customers = customers.filter(c => 
      c.customerNumber.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      (c.company && c.company.toLowerCase().includes(query)) ||
      (c.email && c.email.toLowerCase().includes(query))
    )
  }

  return customers
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    ACTIVE: 'success',
    INACTIVE: 'medium',
    BLACKLISTED: 'danger'
  }
  return colors[status] || 'medium'
}

const createNew = () => {
  router.push('/tabs/crm/customers/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/crm/customers/${id}`)
}

onMounted(() => {
  crmStore.fetchCustomers()
})
</script>
