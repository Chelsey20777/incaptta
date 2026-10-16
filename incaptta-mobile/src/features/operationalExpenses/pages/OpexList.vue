<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Operational Expenses</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search expenses..." />

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
        <ion-item v-for="expense in filteredExpenses" :key="expense.id" button @click="viewDetail(expense.id)">
          <ion-label>
            <h2>{{ expense.expenseNumber }}</h2>
            <h3>{{ expense.title }}</h3>
            <p>{{ expense.category }}</p>
            <p>{{ formatDate(expense.createdAt) }}</p>
          </ion-label>
          <ion-label slot="end">
            <h2>${{ expense.amount }}</h2>
            <p :color="getStatusColor(expense.status)">{{ expense.status }}</p>
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
  IonSearchbar, IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonButton, IonButtons, IonIcon
} from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useOperationalExpensesStore } from '../store/operationalExpensesStore'

const router = useRouter()
const opexStore = useOperationalExpensesStore()

const searchQuery = ref('')
const filterStatus = ref('all')

const filteredExpenses = computed(() => {
  let expenses = opexStore.expenses

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    expenses = expenses.filter(e => 
      e.expenseNumber.toLowerCase().includes(query) ||
      e.title.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query)
    )
  }

  if (filterStatus.value === 'pending') {
    expenses = opexStore.pendingExpenses
  } else if (filterStatus.value === 'approved') {
    expenses = opexStore.approvedExpenses
  }

  return expenses
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger'
  }
  return colors[status] || 'medium'
}

const formatDate = (date: any) => {
  if (!date) return 'N/A'
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/more/opex/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/more/opex/${id}`)
}

onMounted(() => {
  opexStore.fetchExpenses()
})
</script>
