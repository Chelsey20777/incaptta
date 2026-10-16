<script setup lang="ts">
import { useHead } from '@vueuse/head'
import { computed } from 'vue'

const props = defineProps<{
  type: 'localBusiness' | 'service' | 'faqPage'
}>()

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Incaptta Private Limited',
  alternateName: 'Incaptta Agri-Structures',
  description: 'Zimbabwe\'s leading agri-structures company specializing in fowlrun construction and poultry equipment installation.',
  url: 'https://app.incaptta.co.zw',
  telephone: '+263774937250',
  email: 'sales@incaptta.co.zw',
  foundingDate: '2015',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'No. 1734 Chiremba Road',
    addressLocality: 'Hillside, Harare',
    addressCountry: 'ZW'
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: -17.8292,
    longitude: 31.0522
  },
  areaServed: 'Zimbabwe',
  serviceType: [
    'Fowlrun Construction',
    'Pan Feeder System Installation',
    'Nipple Drinker Installation',
    'PVC Climate Control Curtains',
    'Layer Cage Installation'
  ],
  sameAs: [
    'https://www.facebook.com/p/Incaptta-Agri-structures-Equipment-100076244271253/',
    'https://incaptta.co.zw'
  ]
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Incaptta Agri-Structures Services',
  description: 'Professional poultry farming solutions in Zimbabwe.',
  provider: {
    '@type': 'LocalBusiness',
    name: 'Incaptta Private Limited'
  },
  areaServed: 'Zimbabwe'
}

const faqPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: []
}

const schemaData = computed(() => {
  switch (props.type) {
    case 'localBusiness':
      return localBusinessSchema
    case 'service':
      return serviceSchema
    case 'faqPage':
      return faqPageSchema
    default:
      return localBusinessSchema
  }
})

useHead({
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify(schemaData.value)
    }
  ]
})
</script>

<template>
  <!-- Structured data is injected via useHead, no visible output -->
</template>
