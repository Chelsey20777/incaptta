<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Attendance</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Today's Attendance</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="record in todayAttendance" :key="record.id">
              <ion-label>
                <h3>{{ record.employeeName }}</h3>
                <p>Clock In: {{ formatTime(record.clockInTime) }}</p>
                <p v-if="record.clockOutTime">Clock Out: {{ formatTime(record.clockOutTime) }}</p>
                <p v-if="record.hoursWorked">Hours: {{ record.hoursWorked?.toFixed(2) }}</p>
              </ion-label>
              <ion-button v-if="!record.clockOutTime" slot="end" color="warning" @click="clockOut(record.id)">
                Clock Out
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-button expand="block" @click="handleClockIn">
        <ion-icon slot="start" :icon="timeOutline" />
        Clock In
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonList, IonItem, IonBadge, IonButton, IonIcon
} from '@ionic/vue'
import { timeOutline } from 'ionicons/icons'
import { useHrStore } from '../store/hrStore'

const router = useRouter()
const hrStore = useHrStore()

const todayAttendance = computed(() => hrStore.todayAttendance)

const clockOut = async (id: string) => {
  try {
    await hrStore.clockOut(id)
  } catch (err) {
    console.error('Clock-out failed:', err)
  }
}

const formatTime = (time: any) => {
  if (!time) return '--:--'
  const date = time instanceof Date ? time : (time?.toDate?.() || new Date(time))
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const handleClockIn = () => {
  router.push('/tabs/more/hr/clock-in')
}

onMounted(() => {
  hrStore.fetchAttendance()
  if (hrStore.employees.length === 0) {
    hrStore.fetchEmployees()
  }
})
</script>
