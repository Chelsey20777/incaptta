import { ref, onMounted } from 'vue'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'vue-sonner'

export interface AgricRates {
  brickUnitCost: number
  cementUnitCost: number
  includeLabour: boolean
  includeTransport: boolean
  lastUpdatedAt?: any
}

const DEFAULT_RATES: AgricRates = {
  brickUnitCost: 0.10,
  cementUnitCost: 10.00,
  includeLabour: true,
  includeTransport: true,
}

export function useAgricRates() {
  const rates = ref<AgricRates>({ ...DEFAULT_RATES })
  const loading = ref(false)

  async function fetchRates() {
    loading.value = true
    try {
      const docRef = doc(db, 'agricStructureSettings', 'rates')
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        rates.value = { ...DEFAULT_RATES, ...snap.data() }
      } else {
        // Initialize if not exists
        await setDoc(docRef, { ...DEFAULT_RATES, createdAt: serverTimestamp() })
      }
    } catch (err: any) {
      console.error('[useAgricRates] Fetch failed:', err)
      toast.error('Failed to load Agric rates')
    } finally {
      loading.value = false
    }
  }

  async function updateRates(newRates: Partial<AgricRates>) {
    loading.value = true
    try {
      const docRef = doc(db, 'agricStructureSettings', 'rates')
      const data = { ...rates.value, ...newRates, updatedAt: serverTimestamp() }
      await setDoc(docRef, data, { merge: true })
      rates.value = data
      toast.success('Agric rates updated')
    } catch (err: any) {
      console.error('[useAgricRates] Update failed:', err)
      toast.error('Failed to update Agric rates')
      throw err
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchRates()
  })

  return {
    rates,
    loading,
    fetchRates,
    updateRates,
  }
}
