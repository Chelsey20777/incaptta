<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>More</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-list-header>Finance</ion-list-header>
        <ion-item button @click="navigateTo('/tabs/more/opex')">
          <ion-icon slot="start" :icon="cashOutline" />
          <ion-label>Operational Expenses</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/transfers')">
          <ion-icon slot="start" :icon="swapHorizontalOutline" />
          <ion-label>Fund Transfers</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/ledger')">
          <ion-icon slot="start" :icon="listOutline" />
          <ion-label>Ledger</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>

        <ion-list-header>HR</ion-list-header>
        <ion-item button @click="navigateTo('/tabs/more/hr/employees')">
          <ion-icon slot="start" :icon="peopleOutline" />
          <ion-label>Employees</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/hr/attendance')">
          <ion-icon slot="start" :icon="timeOutline" />
          <ion-label>Attendance</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/hr/payroll')">
          <ion-icon slot="start" :icon="walletOutline" />
          <ion-label>Payroll</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>

        <ion-list-header>Operations</ion-list-header>
        <ion-item button @click="navigateTo('/tabs/more/bom-templates')">
          <ion-icon slot="start" :icon="documentTextOutline" />
          <ion-label>BOM Templates</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/procurement/requisitions')">
          <ion-icon slot="start" :icon="cartOutline" />
          <ion-label>Procurement</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/container-access')">
          <ion-icon slot="start" :icon="cubeOutline" />
          <ion-label>Container Access</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>

        <ion-list-header>Settings</ion-list-header>
        <ion-item button @click="navigateTo('/tabs/more/settings')">
          <ion-icon slot="start" :icon="settingsOutline" />
          <ion-label>Settings</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/profile')">
          <ion-icon slot="start" :icon="personOutline" />
          <ion-label>Profile</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
        <ion-item button @click="navigateTo('/tabs/more/support')">
          <ion-icon slot="start" :icon="helpCircleOutline" />
          <ion-label>Support</ion-label>
          <ion-icon slot="end" :icon="chevronForwardOutline" />
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonListHeader, IonItem, IonLabel, IonIcon
} from '@ionic/vue'
import {
  cashOutline, swapHorizontalOutline, listOutline,
  peopleOutline, timeOutline, walletOutline,
  documentTextOutline, cartOutline, cubeOutline,
  settingsOutline, personOutline, helpCircleOutline,
  chevronForwardOutline
} from 'ionicons/icons'

const router = useRouter()

const navigateTo = (path: string) => {
  router.push(path)
}
</script>
