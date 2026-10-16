<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Job Cards</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="searchQuery" placeholder="Search Job Cards..."></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list v-if="filteredJobs.length > 0">
        <ion-item v-for="job in filteredJobs" :key="job.id" detail @click="viewDetail(job.id)">
          <ion-icon slot="start" :icon="documentTextOutline" color="primary"></ion-icon>
          <ion-label>
            <div class="job-header">
              <h3>{{ job.generalInfo?.jobNumber || 'No Number' }}</h3>
              <ion-badge :color="getStatusColor(job.status)" mode="ios">
                {{ job.status }}
              </ion-badge>
            </div>
            <p>{{ job.generalInfo?.recipientName || 'Unassigned' }}</p>
            <p class="date">{{ formatDate(job.createdAt) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <div v-else class="empty-state ion-padding">
        <ion-icon :icon="searchOutline"></ion-icon>
        <p>No job cards found matching your search.</p>
      </div>

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="createNewJob">
          <ion-icon :icon="add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonList, IonItem, IonLabel, IonIcon, IonSearchbar,
  IonBadge, IonFab, IonFabButton
} from '@ionic/vue';
import { documentTextOutline, searchOutline, add } from 'ionicons/icons';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

const router = useRouter();
const searchQuery = ref('');
const jobs = ref<any[]>([]);

onMounted(() => {
  const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    jobs.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
});

const filteredJobs = computed(() => {
  if (!searchQuery.value) return jobs.value;
  const q = searchQuery.value.toLowerCase();
  return jobs.value.filter(j => 
    j.generalInfo?.jobNumber?.toLowerCase().includes(q) ||
    j.generalInfo?.recipientName?.toLowerCase().includes(q)
  );
});

const getStatusColor = (status: string) => {
  switch (status) {
    case 'APPROVED_MANAGER': return 'success';
    case 'DRAFT': return 'medium';
    case 'PENDING': return 'warning';
    case 'REJECTED': return 'danger';
    default: return 'primary';
  }
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
};

const viewDetail = (id: string) => {
  router.push(`/tabs/jobs/${id}`);
};

const createNewJob = () => {
  // Logic for creating a new job card from mobile
};
</script>

<style scoped>
.job-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

h3 {
  font-weight: 700;
  margin: 0;
}

ion-badge {
  font-size: 10px;
  padding: 4px 8px;
}

.date {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.empty-state {
  text-align: center;
  margin-top: 60px;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
</style>
