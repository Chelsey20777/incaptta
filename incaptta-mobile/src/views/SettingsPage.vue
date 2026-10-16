<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-list-header>Preferences</ion-list-header>
        <ion-item>
          <ion-label>Dark Mode</ion-label>
          <ion-toggle slot="end" />
        </ion-item>
        <ion-item>
          <ion-label>Notifications</ion-label>
          <ion-toggle slot="end" />
        </ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>Account</ion-list-header>
        <ion-item button @click="logout">
          <ion-icon slot="start" :icon="logOutOutline" />
          <ion-label>Logout</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonListHeader, IonItem, IonLabel, IonToggle, IonIcon, IonButtons, IonBackButton, IonButton
} from '@ionic/vue'
import { logOutOutline } from 'ionicons/icons'

const router = useRouter()

const logout = () => {
  router.push('/login')
}
</script>
