<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Create Task</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="save" :disabled="!isFormValid">
            <ion-icon slot="icon-only" :icon="checkmarkOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Task Information</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Title *</ion-label>
            <ion-input v-model="formData.title" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Description *</ion-label>
            <ion-textarea v-model="formData.description" :rows="3" required />
          </ion-item>
          <ion-item>
            <ion-label position="floating">Priority</ion-label>
            <ion-select v-model="formData.priority">
              <ion-select-option value="LOW">Low</ion-select-option>
              <ion-select-option value="MEDIUM">Medium</ion-select-option>
              <ion-select-option value="HIGH">High</ion-select-option>
              <ion-select-option value="URGENT">Urgent</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Department</ion-label>
            <ion-select v-model="formData.department">
              <ion-select-option value="Sales">Sales</ion-select-option>
              <ion-select-option value="Technical">Technical</ion-select-option>
              <ion-select-option value="Operations">Operations</ion-select-option>
              <ion-select-option value="Finance">Finance</ion-select-option>
              <ion-select-option value="HR">HR</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Assigned To</ion-label>
            <ion-select v-model="formData.assignedTo">
              <ion-select-option value="user1">User 1</ion-select-option>
              <ion-select-option value="user2">User 2</ion-select-option>
              <ion-select-option value="user3">User 3</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Due Date</ion-label>
            <ion-datetime v-model="formData.dueDate" presentation="date" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" size="large" @click="save" :disabled="!isFormValid">
        Create Task
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonDatetime
} from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import { useTasksStore } from '../store/tasksStore'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskFormData } from '../types'

const router = useRouter()
const tasksStore = useTasksStore()
const authStore = useAuthStore()

const formData = ref<TaskFormData>({
  title: '',
  description: '',
  priority: 'MEDIUM',
  assignedTo: '',
  department: '',
  tags: []
})

const loading = ref(false)

const isFormValid = computed(() => {
  return formData.value.title && 
         formData.value.description &&
         formData.value.assignedTo &&
         formData.value.department
})

const save = async () => {
  if (!isFormValid.value) return
  
  try {
    const taskData: Partial<Task> = {
      ...formData.value,
      dueDate: formData.value.dueDate ? new Date(formData.value.dueDate) : undefined
    }
    
    await tasksStore.createTask(
      taskData, 
      authStore.userId, 
      authStore.displayName || authStore.userEmail
    )
    router.push('/tabs/tasks')
  } catch (err) {
    console.error('Failed to create task:', err)
  } finally {
    loading.value = false
  }
}
</script>
