<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Job Cards</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search job cards..." />

      <ion-segment v-model="filterStatus">
        <ion-segment-button value="all">
          <ion-label>All</ion-label>
        </ion-segment-button>
        <ion-segment-button value="active">
          <ion-label>Active</ion-label>
        </ion-segment-button>
        <ion-segment-button value="pending">
          <ion-label>Pending</ion-label>
        </ion-segment-button>
        <ion-segment-button value="completed">
          <ion-label>Completed</ion-label>
        </ion-segment-button>
      </ion-segment>

      <!-- Loading Skeleton -->
      <div v-if="jobCardsStore.loading">
        <ion-list>
          <ion-item v-for="i in 5" :key="i">
            <ion-label>
              <h3><ion-skeleton-text animated style="width: 50%" /></h3>
              <p><ion-skeleton-text animated style="width: 80%" /></p>
              <p><ion-skeleton-text animated style="width: 60%" /></p>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredJobCards.length === 0" class="empty-state">
        <ion-icon :icon="documentOutline" size="large" color="medium" />
        <h2>No Job Cards Found</h2>
        <p>Create a new job card or adjust your search filters.</p>
      </div>

      <!-- Job Cards List -->
      <ion-list v-else>
        <ion-item v-for="jobCard in filteredJobCards" :key="jobCard.id" button @click="viewDetail(jobCard.id)">
          <ion-label>
            <h2>{{ jobCard.generalInfo?.jobNumber || jobCard.jobNumber }}</h2>
            <h3>{{ jobCard.generalInfo?.jobTitle || jobCard.jobTitle }}</h3>
            <p>{{ jobCard.generalInfo?.recipientName || jobCard.customerName }}</p>
            <p>{{ formatDate(jobCard.createdAt) }}</p>
            <p :color="getStatusColor(jobCard.status)">{{ jobCard.status }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getPriorityColor(jobCard.generalInfo?.priority || jobCard.priority || 'MEDIUM')">
            {{ jobCard.generalInfo?.priority || jobCard.priority || 'MEDIUM' }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <ion-infinite-scroll @ionInfinite="loadMore">
        <ion-infinite-scroll-content></ion-infinite-scroll-content>
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonSearchbar, IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon,
  IonInfiniteScroll, IonInfiniteScrollContent
} from '@ionic/vue'
import { addOutline, documentOutline } from 'ionicons/icons'
import { useJobCardsStore } from '../store/jobCardsStore'

const router = useRouter()
const jobCardsStore = useJobCardsStore()

const searchQuery = ref('')
const filterStatus = ref('all')

const filteredJobCards = computed(() => {
  let cards = jobCardsStore.jobCards

  if (filterStatus.value === 'active') {
    cards = jobCardsStore.activeJobCards
  } else if (filterStatus.value === 'pending') {
    cards = jobCardsStore.pendingApprovals
  } else if (filterStatus.value === 'completed') {
    cards = jobCardsStore.completedJobCards
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    cards = cards.filter(jc => 
      jc.jobNumber.toLowerCase().includes(query) ||
      jc.jobTitle.toLowerCase().includes(query) ||
      jc.customerName.toLowerCase().includes(query)
    )
  }

  return cards
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    DRAFT: 'medium',
    SUBMITTED: 'warning',
    APPROVED: 'success',
    IN_PROGRESS: 'primary',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return colors[status] || 'medium'
}

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    LOW: 'success',
    MEDIUM: 'warning',
    HIGH: 'danger',
    URGENT: 'danger'
  }
  return colors[priority] || 'medium'
}

const createNew = () => {
  router.push('/tabs/jobs/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/jobs/${id}`)
}

const formatDate = (date: any) => {
  if (!date) return ''
  const d = date.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const loadMore = (event: any) => {
  setTimeout(() => {
    event.target.complete()
  }, 500)
}

onMounted(() => {
  jobCardsStore.fetchJobCards()
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}
.empty-state ion-icon {
  margin-bottom: 16px;
}
.empty-state h2 {
  margin: 8px 0;
  font-size: 20px;
}
.empty-state p {
  margin: 4px 0;
  font-size: 14px;
}
</style>
