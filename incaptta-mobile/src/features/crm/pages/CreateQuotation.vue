<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Feature Coming Soon</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding ion-text-center">
      <div class="coming-soon-container">
        <ion-icon :icon="constructOutline" class="large-icon" />
        <h1>Feature Coming Soon</h1>
        <p>This module is currently being migrated for mobile use. Please check back later.</p>
        <ion-button expand="block" @click="goBack">Go Back</ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonIcon, IonButton } from '@ionic/vue'
import { constructOutline } from 'ionicons/icons'
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => router.back()
</script>

<style scoped>
.coming-soon-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80%;
}
.large-icon {
  font-size: 120px;
  color: var(--ion-color-primary);
  margin-bottom: 24px;
}
</style>
