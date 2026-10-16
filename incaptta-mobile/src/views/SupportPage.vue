<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button />
        </ion-buttons>
        <ion-title>Support</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Need Help?</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Contact support for assistance with the InCaptta Mobile app.</p>
          <ion-item lines="none">
            <ion-label>
              <p>Email</p>
              <h3>support@incaptta.com</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>Phone</p>
              <h3>+263 XXX XXX XXX</h3>
            </ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButtons, IonBackButton, IonItem, IonLabel
} from '@ionic/vue'
</script>
