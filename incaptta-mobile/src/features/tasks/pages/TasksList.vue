<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Tasks</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="createNew">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-searchbar v-model="searchQuery" placeholder="Search tasks..." />

      <ion-segment v-model="filterStatus">
        <ion-segment-button value="all">
          <ion-label>All</ion-label>
        </ion-segment-button>
        <ion-segment-button value="pending">
          <ion-label>Pending</ion-label>
        </ion-segment-button>
        <ion-segment-button value="completed">
          <ion-label>Completed</ion-label>
        </ion-segment-button>
        <ion-segment-button value="high">
          <ion-label>High Priority</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-list>
        <ion-item-sliding v-for="task in filteredTasks" :key="task.id">
          <ion-item button @click="viewDetail(task.id)">
            <ion-label>
              <h2>{{ task.title }}</h2>
              <p>{{ task.description }}</p>
              <p :color="getStatusColor(task.status)">{{ task.status }}</p>
              <p v-if="task.dueDate">Due: {{ formatDate(task.dueDate) }}</p>
            </ion-label>
            <ion-badge slot="end" :color="getPriorityColor(task.priority)">
              {{ task.priority }}
            </ion-badge>
          </ion-item>
          <ion-item-options side="start">
            <ion-item-option color="success" @click="completeTask(task.id)">
              <ion-icon slot="icon-only" :icon="checkmarkOutline" />
            </ion-item-option>
          </ion-item-options>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="deleteTask(task.id)">
              <ion-icon slot="icon-only" :icon="trashOutline" />
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
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
  IonList, IonItem, IonBadge, IonButton, IonButtons, IonIcon,
  IonItemSliding, IonItemOptions, IonItemOption
} from '@ionic/vue'
import { addOutline, checkmarkOutline, trashOutline } from 'ionicons/icons'
import { useTasksStore } from '../store/tasksStore'

const router = useRouter()
const tasksStore = useTasksStore()

const searchQuery = ref('')
const filterStatus = ref('all')

const filteredTasks = computed(() => {
  let tasks = tasksStore.tasks

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
    )
  }

  if (filterStatus.value === 'pending') {
    tasks = tasksStore.pendingTasks
  } else if (filterStatus.value === 'completed') {
    tasks = tasksStore.completedTasks
  } else if (filterStatus.value === 'high') {
    tasks = tasksStore.highPriorityTasks
  }

  return tasks
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    TODO: 'medium',
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

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString()
}

const createNew = () => {
  router.push('/tabs/tasks/new')
}

const viewDetail = (id: string) => {
  router.push(`/tabs/tasks/${id}`)
}

const completeTask = (id: string) => {
  tasksStore.completeTask(id)
}

const deleteTask = (id: string) => {
  tasksStore.deleteTask(id)
}

onMounted(() => {
  tasksStore.fetchTasks()
})
</script>
