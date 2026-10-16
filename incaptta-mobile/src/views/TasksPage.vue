<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Tasks</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="filterStatus" mode="ios">
          <ion-segment-button value="Todo">
            <ion-label>Todo</ion-label>
          </ion-segment-button>
          <ion-segment-button value="In Progress">
            <ion-label>Doing</ion-label>
          </ion-segment-button>
          <ion-segment-button value="Done">
            <ion-label>Done</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list v-if="filteredTasks.length > 0">
        <ion-item v-for="task in filteredTasks" :key="task.id" class="task-item">
          <ion-checkbox slot="start" :checked="task.status === 'Done'" @ionChange="toggleTask(task)"></ion-checkbox>
          <ion-label :class="{ 'done': task.status === 'Done' }">
            <h3>{{ task.title }}</h3>
            <p>{{ task.description }}</p>
            <div class="task-footer">
              <ion-chip :color="getPriorityColor(task.priority)" outline>
                {{ task.priority }}
              </ion-chip>
              <span class="due-date">Due: {{ task.dueDate }}</span>
            </div>
          </ion-label>
        </ion-item>
      </ion-list>

      <div v-else class="empty-state ion-padding">
        <ion-icon :icon="checkmarkCircleOutline" color="success"></ion-icon>
        <p>No tasks in this category. Well done!</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonList, IonItem, IonLabel, IonCheckbox, IonSegment,
  IonSegmentButton, IonChip, IonIcon
} from '@ionic/vue';
import { checkmarkCircleOutline } from 'ionicons/icons';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const filterStatus = ref('Todo');
const tasks = ref<any[]>([]);

onMounted(() => {
  const q = query(collection(db, 'projectTasks'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    tasks.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
});

const filteredTasks = computed(() => {
  return tasks.value.filter(t => t.status === filterStatus.value);
});

const toggleTask = async (task: any) => {
  const newStatus = task.status === 'Done' ? 'Todo' : 'Done';
  try {
    const taskRef = doc(db, 'projectTasks', task.id);
    await updateDoc(taskRef, {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Error updating task:', err);
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'Urgent': return 'danger';
    case 'High': return 'warning';
    case 'Medium': return 'primary';
    default: return 'medium';
  }
};
</script>

<style scoped>
h3 {
  font-weight: 600;
  margin-bottom: 4px;
}

.done h3, .done p {
  text-decoration: line-through;
  opacity: 0.6;
}

.task-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

ion-chip {
  --height: 24px;
  font-size: 10px;
  margin: 0;
}

.due-date {
  font-size: 11px;
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

.task-item {
  --padding-start: 8px;
  margin-bottom: 8px;
}
</style>
