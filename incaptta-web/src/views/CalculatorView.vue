<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSeo } from '@/composables/useSeo'
import { useFowlrunCalculator } from '@/composables/useFowlrunCalculator'
import { PRESET_SIZES } from '@/types/fowlrun.types'
import { db } from '@/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { Calculator, CheckCircle2, Phone, Send, Loader2, FileDown } from 'lucide-vue-next'

useSeo({
  title: 'Free Fowlrun BOQ Calculator | Incaptta Zimbabwe',
  description: 'Get an instant Bill of Quantities for your poultry structure. Calculate material costs for any fowlrun size — from 10m×10m to 126m×14m. Free, no signup required.',
  keywords: ['fowlrun BOQ calculator', 'poultry structure cost Zimbabwe', 'fowlrun material estimate', 'chicken house construction cost Zimbabwe', 'free BOQ calculator'],
  canonicalPath: '/calculator'
})

// Calculator composable
const {
  selectedSize,
  activeSize,
  customLength,
  customWidth,
  useCustom,
  calculation,
  selectSize,
  applyCustomSize
} = useFowlrunCalculator()

// Show form when size is selected
const hasSizeSelected = computed(() => activeSize.value.length > 0 && activeSize.value.width > 0)

// Format currency
const formatCurrency = (value: number): string => {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Format number with commas
const formatNumber = (value: number): string => {
  return value.toLocaleString('en-US')
}

// Form state
const formData = ref({
  fullName: '',
  phone: '',
  email: '',
  farmLocation: '',
  additionalNotes: '',
  referralSource: ''
})

const isSubmitting = ref(false)
const submitSuccess = ref(false)
const submitError = ref('')
const submittedLeadId = ref<string | null>(null)

// Validation errors
const errors = ref<Record<string, string>>({})

const validateForm = (): boolean => {
  errors.value = {}

  if (!formData.value.fullName.trim()) {
    errors.value.fullName = 'Full name is required'
  } else if (formData.value.fullName.length > 100) {
    errors.value.fullName = 'Name must be less than 100 characters'
  }

  if (!formData.value.phone.trim()) {
    errors.value.phone = 'Phone number is required'
  } else if (!formData.value.phone.match(/^\+?263|0?7\d{8}$/)) {
    errors.value.phone = 'Please enter a valid Zimbabwe phone number'
  }

  if (!formData.value.farmLocation.trim()) {
    errors.value.farmLocation = 'Farm location is required'
  }

  return Object.keys(errors.value).length === 0
}

// Get first name for success message
const firstName = computed(() => {
  return formData.value.fullName.split(' ')[0] || 'there'
})

// Submit to Firestore
async function handleSubmit() {
  if (!validateForm()) return

  isSubmitting.value = true
  submitError.value = ''

  try {
    const leadsRef = collection(db, 'leads')
    const docRef = await addDoc(leadsRef, {
      fullName: formData.value.fullName,
      phone: formData.value.phone,
      email: formData.value.email || null,
      farmLocation: formData.value.farmLocation,
      structureSize: `${activeSize.value.length}m × ${activeSize.value.width}m`,
      structureArea: calculation.value.area,
      estimatedMaterialCost: calculation.value.materialsTotal,
      boqSnapshot: calculation.value.items,
      additionalNotes: formData.value.additionalNotes || null,
      referralSource: formData.value.referralSource || null,
      status: 'new',
      createdAt: serverTimestamp(),
      source: 'incaptta-web-calculator'
    })

    submittedLeadId.value = docRef.id
    submitSuccess.value = true
  } catch (error) {
    console.error('Error submitting lead:', error)
    submitError.value = 'Failed to submit. Please try again or contact us directly via WhatsApp.'
  } finally {
    isSubmitting.value = false
  }
}

// Print BOQ
function printBOQ() {
  window.print()
}

// WhatsApp URL with pre-filled message
const whatsappUrl = computed(() => {
  const size = `${activeSize.value.length}m×${activeSize.value.width}m`
  const message = `Hi Incaptta, I just submitted a quote request for a ${size} fowlrun.`
  return `https://wa.me/263774937250?text=${encodeURIComponent(message)}`
})
</script>

<template>
  <div class="min-h-screen bg-surface-light pt-20">
    <!-- Print Styles -->
    <style>
      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        nav, footer, .quote-form-section { display: none !important; }
        .boq-table { box-shadow: none !important; border: 1px solid #ccc !important; }
      }
    </style>

    <!-- Header -->
    <div class="calc-header no-print">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3 mb-4">
          <Calculator class="w-6 h-6 text-accent" />
          <span class="calc-eyebrow">Free BOQ Estimator</span>
        </div>
        <h1 class="calc-h1">Fowlrun Material Calculator</h1>
        <p class="calc-desc">
          Get an instant Bill of Quantities for your poultry structure. Select your size or enter custom dimensions.
        </p>
      </div>
    </div>

    <div class="py-12 lg:py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Size Selector -->
        <div class="no-print mb-12">
          <h2 class="text-xl font-heading font-bold text-text-dark mb-6">
            Select Structure Size
          </h2>

          <!-- Preset Sizes Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <button
              v-for="size in PRESET_SIZES"
              :key="size.label"
              @click="selectSize(size)"
              :class="[
                'px-4 py-3 rounded-lg font-medium transition-all text-sm',
                !useCustom && selectedSize.label === size.label
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-text-dark border border-gray-200 hover:border-primary hover:bg-primary/5'
              ]"
            >
              {{ size.length }}m × {{ size.width }}m
            </button>
          </div>

          <!-- Custom Size Toggle -->
          <div class="bg-white rounded-xl p-6 border border-gray-200">
            <button
              @click="useCustom = !useCustom"
              :class="[
                'flex items-center gap-2 font-medium transition-colors',
                useCustom ? 'text-primary' : 'text-text-muted hover:text-text-dark'
              ]"
            >
              <span class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                :class="useCustom ? 'bg-primary border-primary' : 'border-gray-300'"
              >
                <CheckCircle2 v-if="useCustom" class="w-3 h-3 text-white" />
              </span>
              Custom Size
            </button>

            <!-- Custom Size Inputs -->
            <div v-if="useCustom" class="mt-4 grid sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-text-dark mb-2">Length (meters)</label>
                <input
                  v-model.number="customLength"
                  type="number"
                  min="5"
                  max="200"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="e.g. 80"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-text-dark mb-2">Width (meters)</label>
                <input
                  v-model.number="customWidth"
                  type="number"
                  min="5"
                  max="50"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="e.g. 10"
                />
              </div>
              <div class="sm:col-span-2">
                <button
                  @click="applyCustomSize"
                  :disabled="!customLength || !customWidth"
                  class="bg-primary hover:bg-primary-light disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Calculate
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Panel (shown when size selected) -->
        <div v-if="hasSizeSelected" class="mb-12">
          <!-- Summary Cards -->
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 no-print">
            <div class="bg-white rounded-xl p-6 shadow-sm border-l-4 border-primary">
              <p class="text-sm text-text-muted mb-1">Floor Area</p>
              <p class="text-2xl font-heading font-bold text-text-dark">{{ calculation.area }} m²</p>
              <p class="text-xs text-text-muted mt-1">{{ activeSize.length }}m × {{ activeSize.width }}m</p>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm border-l-4 border-accent">
              <p class="text-sm text-text-muted mb-1">Bird Capacity</p>
              <p class="text-2xl font-heading font-bold text-text-dark">{{ formatNumber(Math.round(calculation.area * 10)) }} birds</p>
              <p class="text-xs text-text-muted mt-1">@ 10 birds/m² broiler density</p>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm border-l-4 border-primary">
              <p class="text-sm text-text-muted mb-1">Est. Materials</p>
              <p class="text-2xl font-heading font-bold text-text-dark">{{ calculation.items.length }} items</p>
              <p class="text-xs text-text-muted mt-1">Including bricks, cement, steel</p>
            </div>
            <div class="bg-white rounded-xl p-6 shadow-sm border-l-4 border-accent">
              <p class="text-sm text-text-muted mb-1">Material Cost Est.</p>
              <p class="text-2xl font-heading font-bold text-text-dark">{{ formatCurrency(calculation.materialsTotal) }}</p>
              <p class="text-xs text-text-muted mt-1">Materials only, excl. labour & transport</p>
            </div>
          </div>

          <!-- BOQ Table -->
          <div class="bg-white rounded-xl shadow-lg overflow-hidden boq-table">
            <div class="px-6 py-4 bg-surface-dark flex items-center justify-between">
              <h3 class="text-lg font-heading font-bold text-white">
                Bill of Quantities
              </h3>
              <span class="text-sm text-white/70">{{ activeSize.length }}m × {{ activeSize.width }}m Fowlrun</span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full min-w-[600px]">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Description</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Unit</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Qty</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Unit Price (USD)</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Total (USD)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(item, index) in calculation.items" :key="index" class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-text-dark">{{ item.description }}</td>
                    <td class="px-4 py-3 text-sm text-text-muted">{{ item.unit }}</td>
                    <td class="px-4 py-3 text-sm text-text-dark text-right font-medium">{{ formatNumber(item.qty) }}</td>
                    <td class="px-4 py-3 text-sm text-text-muted text-right">{{ formatCurrency(item.unitPrice) }}</td>
                    <td class="px-4 py-3 text-sm text-text-dark text-right font-medium">{{ formatCurrency(item.total) }}</td>
                  </tr>
                </tbody>
                <tfoot class="bg-primary text-white">
                  <tr>
                    <td colspan="4" class="px-4 py-4 text-right font-heading font-bold">Grand Total:</td>
                    <td class="px-4 py-4 text-right font-heading font-bold text-lg">{{ formatCurrency(calculation.grandTotal) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Disclaimer -->
            <div class="px-6 py-4 bg-yellow-50 border-t border-yellow-100">
              <p class="text-sm text-yellow-800">
                <strong>*</strong> This is an indicative estimate based on Incaptta's standard specifications. Final pricing subject to site assessment and current material costs. Contact us for a formal quotation.
              </p>
            </div>
          </div>

          <!-- Export Button -->
          <div class="mt-6 flex justify-end no-print">
            <button
              @click="printBOQ"
              class="inline-flex items-center gap-2 bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <FileDown class="w-5 h-5" />
              Download BOQ as PDF
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quote Request Form Section -->
    <div v-if="hasSizeSelected" class="quote-form-section bg-surface-dark py-16 lg:py-20 no-print">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div v-if="!submitSuccess" class="bg-white rounded-xl shadow-lg overflow-hidden">
          <!-- Form Header -->
          <div class="bg-primary px-8 py-6">
            <h2 class="text-2xl font-heading font-bold text-white">
              Want a Formal Quote?
            </h2>
            <p class="text-white/80 mt-2">
              Send us your details and we'll prepare an accurate quotation and call you within 24 hours.
            </p>
          </div>

          <!-- Form -->
          <form @submit.prevent="handleSubmit" class="p-8 space-y-6">
            <!-- Error Banner -->
            <div v-if="submitError" class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              {{ submitError }}
            </div>

            <!-- Full Name -->
            <div>
              <label class="block text-sm font-medium text-text-dark mb-2">
                Full Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.fullName"
                type="text"
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                :class="errors.fullName ? 'border-red-300' : 'border-gray-300'"
                placeholder="Your full name"
              />
              <p v-if="errors.fullName" class="mt-1 text-sm text-red-600">{{ errors.fullName }}</p>
            </div>

            <!-- Phone & Email Row -->
            <div class="grid sm:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-text-dark mb-2">
                  Phone Number <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="formData.phone"
                  type="tel"
                  class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                  :class="errors.phone ? 'border-red-300' : 'border-gray-300'"
                  placeholder="+263 7X XXX XXXX"
                />
                <p v-if="errors.phone" class="mt-1 text-sm text-red-600">{{ errors.phone }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-text-dark mb-2">
                  Email Address
                </label>
                <input
                  v-model="formData.email"
                  type="email"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <!-- Farm Location -->
            <div>
              <label class="block text-sm font-medium text-text-dark mb-2">
                Farm Location <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.farmLocation"
                type="text"
                class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                :class="errors.farmLocation ? 'border-red-300' : 'border-gray-300'"
                placeholder="e.g. Harare, Masvingo"
              />
              <p v-if="errors.farmLocation" class="mt-1 text-sm text-red-600">{{ errors.farmLocation }}</p>
            </div>

            <!-- Structure Size (Read-only) -->
            <div>
              <label class="block text-sm font-medium text-text-dark mb-2">
                Structure Size
              </label>
              <div class="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-text-dark font-medium">
                {{ activeSize.length }}m × {{ activeSize.width }}m — {{ calculation.area }} m²
              </div>
            </div>

            <!-- Referral Source -->
            <div>
              <label class="block text-sm font-medium text-text-dark mb-2">
                How did you hear about us?
              </label>
              <select
                v-model="formData.referralSource"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="">Select an option</option>
                <option value="Google Search">Google Search</option>
                <option value="Facebook">Facebook</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Referral">Referral</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <!-- Additional Notes -->
            <div>
              <label class="block text-sm font-medium text-text-dark mb-2">
                Additional Notes
              </label>
              <textarea
                v-model="formData.additionalNotes"
                rows="3"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-none"
                placeholder="Any specific requirements or questions..."
              ></textarea>
            </div>

            <!-- Submit Button -->
            <button
              type="submit"
              :disabled="isSubmitting"
              class="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light disabled:bg-gray-400 text-white px-8 py-4 rounded-lg font-medium transition-colors"
            >
              <Loader2 v-if="isSubmitting" class="w-5 h-5 animate-spin" />
              <Send v-else class="w-5 h-5" />
              <span>{{ isSubmitting ? 'Sending...' : 'Send Quote Request' }}</span>
            </button>
          </form>
        </div>

        <!-- Success Message -->
        <div v-else class="bg-white rounded-xl shadow-lg p-8 text-center">
          <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 class="w-10 h-10 text-green-600" />
          </div>
          <h2 class="text-2xl font-heading font-bold text-text-dark mb-4">
            Quote Request Sent!
          </h2>
          <p class="text-text-muted mb-2">
            Thank you <strong class="text-text-dark">{{ firstName }}</strong>. Our team will contact you
            on <strong class="text-text-dark">{{ formData.phone }}</strong> within 24 hours with a formal quotation.
          </p>
          <p class="text-sm text-text-muted mb-8">
            Reference: #{{ submittedLeadId?.slice(-6).toUpperCase() }}
          </p>
          <a
            :href="whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            <Phone class="w-5 h-5" />
            Chat with Us on WhatsApp
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calc-header {
  background-color: var(--c-dark);
  padding: 48px 24px 40px;
}

.calc-eyebrow {
  color: var(--c-yellow);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.calc-h1 {
  font-family: 'Poppins', sans-serif;
  font-size: 40px;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 16px;
}

.calc-desc {
  font-size: 18px;
  color: var(--c-muted);
  max-width: 640px;
}

.text-accent {
  color: var(--c-yellow);
}
</style>
