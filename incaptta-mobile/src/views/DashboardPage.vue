<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>InCaptta</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleLogout">
            <ion-icon :icon="logOutOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">InCaptta</ion-title>
        </ion-toolbar>
      </ion-header>

      <div class="ion-padding">
        <!-- Dashboard Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon jobs">
              <ion-icon :icon="constructOutline"></ion-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ activeJobsCount }}</span>
              <span class="stat-label">Active Jobs</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon tasks">
              <ion-icon :icon="calendarOutline"></ion-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ pendingTasksCount }}</span>
              <span class="stat-label">Tasks Due</span>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="section-header">
          <h2>Recent Activity</h2>
          <ion-button fill="clear" size="small">See All</ion-button>
        </div>

        <ion-list lines="none" class="activity-list">
          <ion-item v-for="job in recentJobs" :key="job.id" detail @click="viewJob(job.id)">
            <ion-avatar slot="start">
              <div class="job-initials">{{ job.generalInfo?.jobNumber?.substring(3, 7) || 'JC' }}</div>
            </ion-avatar>
            <ion-label>
              <h3>{{ job.generalInfo?.recipientName || 'Unassigned User' }}</h3>
              <p>{{ job.status }} • {{ formatDate(job.updatedAt) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonGrid, IonRow, IonCol, IonCard, IonCardContent,
  IonList, IonItem, IonLabel, IonAvatar, IonIcon,
  IonButton, IonButtons
} from '@ionic/vue';
import { 
  constructOutline, calendarOutline, logOutOutline,
  trendingUpOutline, alertCircleOutline
} from 'ionicons/icons';
import { auth, db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';

import { useAuthStore } from '@/stores/authStore';
import { watch } from 'vue';

const router = useRouter();
const authStore = useAuthStore();
const activeJobsCount = ref(0);
const pendingTasksCount = ref(0);
const recentJobs = ref<any[]>([]);

const startListeners = () => {
  // Listen for active jobs
  const jobsQuery = query(
    collection(db, 'jobCards'), 
    orderBy('updatedAt', 'desc'),
    limit(5)
  );

  onSnapshot(jobsQuery, (snapshot) => {
    recentJobs.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    activeJobsCount.value = snapshot.size; 
  }, (error) => {
    console.error('[Dashboard] Jobs listener error:', error);
  });

  // Listen for tasks
  const tasksQuery = query(
    collection(db, 'projectTasks'),
    where('status', '!=', 'Done')
  );
  onSnapshot(tasksQuery, (snapshot) => {
    pendingTasksCount.value = snapshot.size;
  }, (error) => {
    console.error('[Dashboard] Tasks listener error:', error);
  });
};

onMounted(() => {
  if (authStore.isAuthenticated) {
    startListeners();
  }
});

watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    startListeners();
  }
});

const handleLogout = async () => {
  await auth.signOut();
  router.replace('/login');
};

const viewJob = (id: string) => {
  router.push(`/tabs/jobs/${id}`);
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
};
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--ion-background-color);
  padding: 16px;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  border: 1px solid var(--ion-color-step-50);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 12px;
}

.stat-icon.jobs {
  background: rgba(0, 166, 62, 0.1);
  color: #00A63E;
}

.stat-icon.tasks {
  background: rgba(82, 96, 255, 0.1);
  color: #5260ff;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--ion-color-dark);
}

.stat-label {
  font-size: 12px;
  color: var(--ion-color-medium);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.activity-list {
  background: transparent;
}

ion-item {
  --background: var(--ion-background-color);
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
  border: 1px solid var(--ion-color-step-50);
}

.job-initials {
  width: 100%;
  height: 100%;
  background: var(--ion-color-light);
  color: var(--ion-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}
</style>
