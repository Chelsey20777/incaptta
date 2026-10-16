<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Task Detail</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="editTask">
            <ion-icon slot="icon-only" :icon="pencilOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="task">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ task.title }}</ion-card-title>
            <ion-card-subtitle>{{ task.department }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ task.description }}</p>
            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h3 :color="getStatusColor(task.status)">{{ task.status }}</h3>
              </ion-label>
              <ion-badge slot="end" :color="getPriorityColor(task.priority)">
                {{ task.priority }}
              </ion-badge>
            </ion-item>
            <ion-item lines="none">
              <ion-label>
                <p>Assigned To</p>
                <h3>{{ task.assignedToName || task.assignedTo }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="task.dueDate">
              <ion-label>
                <p>Due Date</p>
                <h3>{{ formatDate(task.dueDate) }}</h3>
              </ion-label>
            </ion-item>
            <ion-item lines="none" v-if="task.completedAt">
              <ion-label>
                <p>Completed At</p>
                <h3>{{ formatDate(task.completedAt) }}</h3>
              </ion-label>
            </ion-item>
          </ion-card-content>
        </ion-card>

        <ion-button v-if="task.status !== 'COMPLETED'" expand="block" color="success" @click="completeTask">
          <ion-icon slot="start" :icon="checkmarkOutline" />
          Mark as Complete
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon, IonBadge, IonItem, IonLabel
} from '@ionic/vue'
import { pencilOutline, checkmarkOutline } from 'ionicons/icons'
import { useTasksStore } from '../store/tasksStore'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const tasksStore = useTasksStore()
const authStore = useAuthStore()

const task = computed(() => 
  tasksStore.tasks.find(t => t.id === route.params.id)
)

const loading = ref(false)

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    PENDING: 'warning',
    IN_PROGRESS: 'primary',
    COMPLETED: 'success',
    CANCELLED: 'danger'
  }
  return colors[status] || 'medium'
}

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    LOW: 'medium',
    MEDIUM: 'primary',
    HIGH: 'warning',
    URGENT: 'danger'
  }
  return colors[priority] || 'medium'
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

const completeTask = async () => {
  if (task.value) {
    loading.value = true
    try {
      await tasksStore.completeTask(task.value.id)
    } finally {
      loading.value = false
    }
  }
}

const editTask = () => {
  if (task.value) {
    router.push(`/tabs/tasks/edit/${task.value.id}`)
  }
}

onMounted(() => {
  if (tasksStore.tasks.length === 0) {
    tasksStore.fetchTasks()
  }
})
</script>
