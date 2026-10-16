import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'

export interface QuoteFormData {
  name: string
  email: string
  phone: string
  farmLocation: string
  birdCapacity: string
  servicesNeeded: string[]
  message: string
  fullName: string
  additionalNotes: string
  referralSource: string
}

export const useQuoteFormStore = defineStore('quoteForm', () => {
  // Calculator state
  const selectedLength = ref(0)
  const selectedWidth = ref(0)

  // Form state
  const formData = ref<QuoteFormData>({
    name: '',
    email: '',
    phone: '',
    farmLocation: '',
    birdCapacity: '',
    servicesNeeded: [],
    message: '',
    fullName: '',
    additionalNotes: '',
    referralSource: ''
  })

  const isSubmitting = ref(false)
  const submitError = ref<string | null>(null)
  const submitSuccess = ref(false)
  const submittedLeadId = ref<string | null>(null)

  // Getters
  const isValid = computed(() => {
    return (
      formData.value.name.length > 0 &&
      formData.value.email.length > 0 &&
      formData.value.phone.length > 0 &&
      formData.value.birdCapacity.length > 0 &&
      formData.value.servicesNeeded.length > 0
    )
  })

  // Actions
  function setSize(length: number, width: number) {
    selectedLength.value = length
    selectedWidth.value = width
  }

  function setFormData(data: Partial<QuoteFormData>) {
    formData.value = { ...formData.value, ...data }
  }

  function markSubmitted(leadId: string) {
    submittedLeadId.value = leadId
    submitSuccess.value = true
  }

  function updateField<K extends keyof QuoteFormData>(field: K, value: QuoteFormData[K]) {
    formData.value[field] = value
  }

  function toggleService(service: string) {
    const index = formData.value.servicesNeeded.indexOf(service)
    if (index > -1) {
      formData.value.servicesNeeded.splice(index, 1)
    } else {
      formData.value.servicesNeeded.push(service)
    }
  }

  function resetForm() {
    formData.value = {
      name: '',
      email: '',
      phone: '',
      farmLocation: '',
      birdCapacity: '',
      servicesNeeded: [],
      message: '',
      fullName: '',
      additionalNotes: '',
      referralSource: ''
    }
    submitError.value = null
    submitSuccess.value = false
    submittedLeadId.value = null
  }

  function reset() {
    selectedLength.value = 0
    selectedWidth.value = 0
    resetForm()
  }

  async function submitQuote() {
    if (!isValid.value) {
      submitError.value = 'Please fill in all required fields'
      return false
    }

    isSubmitting.value = true
    submitError.value = null

    try {
      const leadsRef = collection(db, 'leads')
      await addDoc(leadsRef, {
        ...formData.value,
        source: 'incaptta-web',
        createdAt: serverTimestamp(),
        status: 'new'
      })

      submitSuccess.value = true
      return true
    } catch (error) {
      submitError.value = 'Failed to submit. Please try again or contact us directly.'
      console.error('Quote submission error:', error)
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    // Calculator state
    selectedLength,
    selectedWidth,
    // Form state
    formData,
    isSubmitting,
    submitError,
    submitSuccess,
    submittedLeadId,
    isValid,
    // Actions
    setSize,
    setFormData,
    markSubmitted,
    updateField,
    toggleService,
    resetForm,
    reset,
    submitQuote
  }
})
