<script setup lang="ts">
import { ref, onMounted } from 'vue'

const stats = [
  { value: 8, suffix: '+', label: 'Years Experience' },
  { value: 60000, suffix: '+', label: 'Birds Capacity Built' },
  { value: 4, suffix: '+', label: 'Major Corporate Clients' },
  { value: 100, suffix: '%', label: 'Project Completion Rate' }
]

const animatedValues = ref(stats.map(() => 0))
const statsRef = ref<HTMLElement | null>(null)
let hasAnimated = false

const formatNumber = (num: number): string => {
  if (num >= 1000) {
    return num.toLocaleString()
  }
  return num.toString()
}

const animateCounters = () => {
  if (hasAnimated) return
  hasAnimated = true

  stats.forEach((stat, index) => {
    const duration = 2000
    const steps = 60
    const stepValue = stat.value / steps
    let currentStep = 0

    const interval = setInterval(() => {
      currentStep++
      animatedValues.value[index] = Math.min(Math.round(stepValue * currentStep), stat.value)

      if (currentStep >= steps) {
        clearInterval(interval)
        animatedValues.value[index] = stat.value
      }
    }, duration / steps)
  })
}

onMounted(() => {
  // Simple intersection observer for animation trigger
  if (statsRef.value) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounters()
            observer.disconnect()
          }
        })
      },
      { threshold: 0.3 }
    )

    observer.observe(statsRef.value)
  }
})
</script>

<template>
  <section ref="statsRef" class="stats-band py-16 lg:py-20">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
        <div
          v-for="(stat, index) in stats"
          :key="stat.label"
          class="text-center"
        >
          <div class="stat-number">
            {{ formatNumber(animatedValues[index]) }}{{ stat.suffix }}
          </div>
          <p class="stat-label">
            {{ stat.label }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stats-band {
  background-color: var(--c-yellow);
  padding: 28px 24px;
}

.stat-number {
  color: var(--c-dark);
  font-family: 'Poppins', sans-serif;
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 4px;
}

.stat-label {
  color: var(--c-yellow-dark);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
