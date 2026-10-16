<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/jobs"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ job?.generalInfo?.jobNumber || 'Loading...' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" v-if="job">
      <div class="job-status-banner" :class="job.status.toLowerCase()">
        {{ job.status }}
      </div>

      <div class="ion-padding">
        <section class="info-section">
          <h2>Recipient Information</h2>
          <ion-card mode="ios">
            <ion-card-content>
              <div class="info-row">
                <ion-icon :icon="personOutline"></ion-icon>
                <span>{{ job.generalInfo?.recipientName || 'N/A' }}</span>
              </div>
              <div class="info-row">
                <ion-icon :icon="locationOutline"></ion-icon>
                <span>{{ job.generalInfo?.recipientAddress || 'N/A' }}</span>
              </div>
              <div class="info-row">
                <ion-icon :icon="callOutline"></ion-icon>
                <span>{{ job.generalInfo?.recipientPhone || 'N/A' }}</span>
              </div>
            </ion-card-content>
          </ion-card>
        </section>

        <section class="items-section">
          <div class="section-header">
            <h2>Requisition Items</h2>
            <ion-badge color="primary">{{ itemsCount }}</ion-badge>
          </div>
          <ion-list lines="full">
            <ion-item v-for="item in job.requisitionItems" :key="item.id">
              <ion-label>
                <h3>{{ item.description }}</h3>
                <p>Qty: {{ item.quantity }} • Unit: {{ item.unit || 'pcs' }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <section class="photos-section">
          <div class="section-header">
            <h2>Site Photos</h2>
            <ion-button fill="clear" @click="takePhoto">
              <ion-icon slot="icon-only" :icon="cameraOutline"></ion-icon>
            </ion-button>
          </div>
          
          <div class="photo-grid" v-if="photos.length > 0">
            <div v-for="(photo, index) in photos" :key="index" class="photo-item">
              <img :src="photo.webPath" />
            </div>
          </div>
          <div v-else class="empty-photos">
            <p>No photos uploaded yet.</p>
          </div>
        </section>
      </div>

      <!-- Action Buttons -->
      <div class="ion-padding footer-actions">
        <ion-button expand="block" color="success" @click="handleCheckIn" v-if="job.status === 'DRAFT'">
          Submit for Approval
        </ion-button>
      </div>
    </ion-content>

    <div v-else class="loading-state">
      <ion-spinner name="crescent"></ion-spinner>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { 
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, 
  IonButtons, IonBackButton, IonCard, IonCardContent,
  IonList, IonItem, IonLabel, IonIcon, IonBadge, IonButton,
  IonSpinner, IonActionSheet
} from '@ionic/vue';
import { 
  personOutline, locationOutline, callOutline, 
  cameraOutline, documentTextOutline
} from 'ionicons/icons';
import { db, storage } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';

const route = useRoute();
const jobId = route.params.id as string;
const job = ref<any>(null);
const photos = ref<any[]>([]);

const itemsCount = computed(() => job.value?.requisitionItems?.length || 0);

onMounted(() => {
  const docRef = doc(db, 'jobCards', jobId);
  onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      job.value = snap.data();
      // Logic for existing photos would go here
    }
  });
});

const takePhoto = async () => {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt
    });

    if (image.base64String) {
      // Upload to Firebase Storage
      const path = `job-photos/${jobId}/${Date.now()}.jpg`;
      const sRef = storageRef(storage, path);
      await uploadString(sRef, image.base64String, 'base64');
      const url = await getDownloadURL(sRef);
      
      // Update Job Card record (example logic)
      const docRef = doc(db, 'jobCards', jobId);
      // Push to an array called 'sitePhotos'
      const updatedPhotos = [...(job.value.sitePhotos || []), url];
      await updateDoc(docRef, { 
        sitePhotos: updatedPhotos,
        updatedAt: serverTimestamp()
      });
      
      photos.value.push({ webPath: `data:image/jpeg;base64,${image.base64String}` });
    }
  } catch (err) {
    console.error('Camera error:', err);
  }
};

const handleCheckIn = async () => {
  // Update status example
  const docRef = doc(db, 'jobCards', jobId);
  await updateDoc(docRef, { 
    status: 'SUBMITTED',
    updatedAt: serverTimestamp()
  });
};
</script>

<style scoped>
.job-status-banner {
  padding: 12px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  color: white;
}

.job-status-banner.draft { background: var(--ion-color-medium); }
.job-status-banner.submitted { background: var(--ion-color-primary); }
.job-status-banner.approved_manager { background: var(--ion-color-success); }
.job-status-banner.rejected { background: var(--ion-color-danger); }

h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 24px 0 12px 0;
  color: var(--ion-color-dark);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  color: var(--ion-color-step-700);
}

.info-row ion-icon {
  margin-right: 12px;
  font-size: 20px;
  color: var(--ion-color-primary);
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.photo-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
}

.empty-photos {
  padding: 20px;
  text-align: center;
  background: var(--ion-color-light);
  border-radius: 12px;
  color: var(--ion-color-medium);
}

.footer-actions {
  position: sticky;
  bottom: 0;
  background: var(--ion-background-color);
  border-top: 1px solid var(--ion-color-step-100);
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
