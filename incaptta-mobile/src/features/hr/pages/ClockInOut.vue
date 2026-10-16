<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Clock In/Out</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Record Attendance</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="floating">Employee</ion-label>
            <ion-select v-model="selectedEmployee">
              <ion-select-option v-for="emp in hrStore.employees" :key="emp.id" :value="emp.id">
                {{ emp.fullName || `${emp.firstName} ${emp.lastName}` }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="floating">Location</ion-label>
            <ion-input v-model="location" />
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-button v-if="!todayAttendance" expand="block" size="large" color="success" @click="handleClockIn" :disabled="!selectedEmployee">
        <ion-icon slot="start" :icon="timeOutline" />
        Clock In
      </ion-button>
      <ion-button v-else expand="block" size="large" color="danger" @click="handleClockOut" :disabled="!todayAttendance">
        <ion-icon slot="start" :icon="timeOutline" />
        Clock Out
      </ion-button>

      <ion-card v-if="todayAttendance">
        <ion-card-header>
          <ion-card-title>Today's Attendance</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item lines="none">
            <ion-label>
              <p>Clock In Time</p>
              <h3>{{ formatTime(todayAttendance.clockInTime) }}</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none" v-if="todayAttendance.clockOutTime">
            <ion-label>
              <p>Clock Out Time</p>
              <h3>{{ formatTime(todayAttendance.clockOutTime) }}</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none" v-if="todayAttendance.location">
            <ion-label>
              <p>Location</p>
              <h3>{{ todayAttendance.location }}</h3>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption
} from '@ionic/vue'
import { timeOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const hrStore = useHrStore()
const authStore = useAuthStore()

const selectedEmployee = ref('')
const location = ref('')
const loading = ref(false)

const todayAttendance = computed(() => {
  if (!selectedEmployee.value) return null
  const today = new Date().toISOString().split('T')[0]
  return hrStore.attendanceRecords.find(a => {
    if (!a.employeeId || a.employeeId !== selectedEmployee.value) return false
    const dateStr = a.date instanceof Date 
      ? a.date.toISOString().split('T')[0] 
      : (a.date as any)?.toDate?.()?.toISOString().split('T')[0] || a.date
    return dateStr === today && a.status === 'IN'
  })
})

const formatTime = (timestamp: any) => {
  if (!timestamp) return ''
  const t = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const handleClockIn = async () => {
  if (!selectedEmployee.value) return
  
  loading.value = true
  try {
    const emp = hrStore.employees.find(e => e.id === selectedEmployee.value)
    if (!emp) return
    
    await hrStore.clockIn(selectedEmployee.value, emp.fullName || `${emp.firstName} ${emp.lastName}`, location.value || undefined)
  } catch (err) {
    console.error('Clock-in failed:', err)
  } finally {
    loading.value = false
  }
}

const handleClockOut = async () => {
  if (!todayAttendance.value) return
  
  loading.value = true
  try {
    await hrStore.clockOut(todayAttendance.value.id)
  } catch (err) {
    console.error('Clock-out failed:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (hrStore.employees.length === 0) {
    hrStore.fetchEmployees()
  }
  hrStore.fetchAttendance()
})
</script>
