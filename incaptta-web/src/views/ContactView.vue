<script setup lang="ts">
import { ref } from 'vue'
import { useSeo } from '@/composables/useSeo'
import { useQuoteFormStore } from '@/stores/quoteForm'
import { MapPin, Mail, Phone, Clock, Send, CheckCircle, AlertCircle } from 'lucide-vue-next'

useSeo({
  title: 'Contact Incaptta | Fowlrun Construction Quotes Zimbabwe',
  description: 'Contact Incaptta for fowlrun construction quotes, equipment installation, and poultry farming solutions. Based in Hillside, Harare. Call or WhatsApp: +263 77 493 7250.',
  keywords: ['contact Incaptta Zimbabwe', 'fowlrun quote Harare', 'poultry construction contact'],
  canonicalPath: '/contact'
})

const store = useQuoteFormStore()
const showSuccess = ref(false)

const serviceOptions = [
  'Fowlrun Construction',
  'Nipple Drinker Systems',
  'Pan Feeder Systems',
  'PVC Climate Curtains',
  'Layer Cage Systems',
  'Fumigation & Maintenance'
]

const capacityOptions = [
  '1,000 - 5,000 birds',
  '5,000 - 10,000 birds',
  '10,000 - 20,000 birds',
  '20,000 - 50,000 birds',
  '50,000+ birds'
]

async function handleSubmit() {
  const success = await store.submitQuote()
  if (success) {
    showSuccess.value = true
    setTimeout(() => {
      showSuccess.value = false
      store.resetForm()
    }, 5000)
  }
}
</script>

<style scoped>
.contact-header {
  background-color: var(--c-dark);
  padding: 64px 24px 60px;
  text-align: center;
}

.contact-h1 {
  font-family: 'Poppins', sans-serif;
  font-size: 40px;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 16px;
}

.contact-desc {
  font-size: 18px;
  color: var(--c-muted);
  max-width: 640px;
  margin: 0 auto;
}
</style>

<template>
  <div class="min-h-screen bg-surface-light pt-20">
    <!-- Header -->
    <div class="contact-header">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 class="contact-h1">Get a Free Quote</h1>
        <p class="contact-desc">
          Tell us about your poultry farming project and we'll provide a detailed consultation and BOQ estimate
        </p>
      </div>
    </div>

    <div class="py-16 lg:py-24">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid lg:grid-cols-3 gap-12">
          <!-- Contact Info -->
          <div class="lg:col-span-1 space-y-8">
            <div>
              <h3 class="text-xl font-heading font-bold text-text-dark mb-6">
                Contact Information
              </h3>

              <div class="space-y-4">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p class="font-medium text-text-dark">Address</p>
                    <p class="text-text-muted text-sm">
                      No. 1734 Chiremba Road, Hillside, Harare, Zimbabwe
                    </p>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Mail class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p class="font-medium text-text-dark">Email</p>
                    <a href="mailto:sales@incaptta.co.zw" class="text-text-muted text-sm hover:text-primary transition-colors">
                      sales@incaptta.co.zw
                    </a>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Phone class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p class="font-medium text-text-dark">Phone</p>
                    <a href="tel:+263774937250" class="text-text-muted text-sm hover:text-primary transition-colors">
                      +263 77 493 7250
                    </a>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Clock class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p class="font-medium text-text-dark">Business Hours</p>
                    <p class="text-text-muted text-sm">
                      Mon - Fri: 8:00 AM - 5:00 PM<br>
                      Sat: 8:00 AM - 12:00 PM
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- WhatsApp CTA -->
            <div class="bg-green-50 border border-green-200 rounded-xl p-6">
              <p class="font-medium text-green-800 mb-2">Prefer WhatsApp?</p>
              <p class="text-green-600 text-sm mb-4">
                Chat with us directly for quick responses
              </p>
              <a
                href="https://wa.me/263774937250"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Phone class="w-4 h-4" />
                Chat on WhatsApp
              </a>
            </div>
          </div>

          <!-- Quote Form -->
          <div class="lg:col-span-2">
            <div class="bg-white rounded-xl shadow-lg p-8">
              <h3 class="text-xl font-heading font-bold text-text-dark mb-6">
                Request a Quote
              </h3>

              <!-- Success Message -->
              <div
                v-if="store.submitSuccess || showSuccess"
                class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3"
              >
                <CheckCircle class="w-5 h-5 text-green-600" />
                <p class="text-green-800">
                  Thank you! Your quote request has been submitted. We'll contact you within 24 hours.
                </p>
              </div>

              <!-- Error Message -->
              <div
                v-if="store.submitError"
                class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3"
              >
                <AlertCircle class="w-5 h-5 text-red-600" />
                <p class="text-red-800">{{ store.submitError }}</p>
              </div>

              <form @submit.prevent="handleSubmit" class="space-y-6">
                <!-- Name & Email Row -->
                <div class="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label class="block text-sm font-medium text-text-dark mb-2">
                      Full Name <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="store.formData.name"
                      type="text"
                      required
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-text-dark mb-2">
                      Email Address <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="store.formData.email"
                      type="email"
                      required
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <!-- Phone & Location Row -->
                <div class="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label class="block text-sm font-medium text-text-dark mb-2">
                      Phone Number <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="store.formData.phone"
                      type="tel"
                      required
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                      placeholder="+263 77 XXX XXXX"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-text-dark mb-2">
                      Farm Location
                    </label>
                    <input
                      v-model="store.formData.farmLocation"
                      type="text"
                      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                      placeholder="City/Town, Province"
                    />
                  </div>
                </div>

                <!-- Bird Capacity -->
                <div>
                  <label class="block text-sm font-medium text-text-dark mb-2">
                    Intended Bird Capacity <span class="text-red-500">*</span>
                  </label>
                  <select
                    v-model="store.formData.birdCapacity"
                    required
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors bg-white"
                  >
                    <option value="">Select capacity range</option>
                    <option v-for="option in capacityOptions" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                </div>

                <!-- Services Needed -->
                <div>
                  <label class="block text-sm font-medium text-text-dark mb-3">
                    Services Needed <span class="text-red-500">*</span>
                  </label>
                  <div class="grid sm:grid-cols-2 gap-3">
                    <label
                      v-for="service in serviceOptions"
                      :key="service"
                      class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-primary transition-colors"
                      :class="{ 'border-primary bg-primary/5': store.formData.servicesNeeded.includes(service) }"
                    >
                      <input
                        type="checkbox"
                        :value="service"
                        :checked="store.formData.servicesNeeded.includes(service)"
                        @change="store.toggleService(service)"
                        class="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                      />
                      <span class="text-sm text-text-dark">{{ service }}</span>
                    </label>
                  </div>
                </div>

                <!-- Message -->
                <div>
                  <label class="block text-sm font-medium text-text-dark mb-2">
                    Additional Message
                  </label>
                  <textarea
                    v-model="store.formData.message"
                    rows="4"
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
                    placeholder="Tell us more about your project requirements..."
                  ></textarea>
                </div>

                <!-- Submit Button -->
                <button
                  type="submit"
                  :disabled="store.isSubmitting"
                  class="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light disabled:bg-gray-400 text-white px-8 py-4 rounded-lg font-medium transition-colors"
                >
                  <Send v-if="!store.isSubmitting" class="w-5 h-5" />
                  <span v-if="store.isSubmitting">Submitting...</span>
                  <span v-else>Submit Quote Request</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
