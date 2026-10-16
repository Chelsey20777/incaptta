import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import type { Asset } from '../utils/taxEngine'

export const useAssetStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])
  const loading = ref(false)

  async function fetchAssets() {
    loading.value = true
    try {
      const snap = await getDocs(collection(db, 'assets'))
      assets.value = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Asset[]
    } catch (error) {
      console.error('Fetch Assets Error:', error)
    } finally {
      loading.value = false
    }
  }

  async function addAsset(asset: Omit<Asset, 'id'>) {
    try {
      await addDoc(collection(db, 'assets'), {
        ...asset,
        createdAt: serverTimestamp()
      })
      await fetchAssets()
    } catch (error) {
      console.error('Add Asset Error:', error)
      throw error
    }
  }

  return {
    assets,
    loading,
    fetchAssets,
    addAsset
  }
})
