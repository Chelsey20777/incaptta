<script setup lang="ts">
import { testimonials } from '@/data/testimonials'
</script>

<template>
  <section class="testimonials-section py-20 lg:py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Section Header -->
      <div class="text-center mb-16">
        <h2 class="section-title">
          What Our Clients Say
        </h2>
        <p class="section-subtitle">
          Trusted by Zimbabwe's leading poultry operations
        </p>
      </div>

      <!-- Testimonials Grid -->
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div
          v-for="testimonial in testimonials"
          :key="testimonial.id"
          class="testimonial-card"
        >
          <!-- Quote Icon -->
          <div class="testi-quote-mark">"</div>

          <!-- Quote Text -->
          <blockquote class="testi-text">
            "{{ testimonial.quote }}"
          </blockquote>

          <!-- Author -->
          <div class="testi-author">
            <p class="testi-name">
              {{ testimonial.author }}
            </p>
            <p class="testi-location">
              {{ testimonial.location }}
            </p>
            <span class="testi-capacity">
              {{ testimonial.capacity }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.testimonials-section {
  background-color: #ffffff;
}

.section-title {
  font-family: 'Poppins', sans-serif;
  font-size: 32px;
  font-weight: 700;
  color: var(--c-dark);
  margin-bottom: 16px;
}

.section-subtitle {
  font-size: 18px;
  color: var(--c-muted-deep);
}

.testimonial-card {
  background-color: var(--c-light-bg);
  border-radius: 12px;
  padding: 24px;
  position: relative;
}

.testi-quote-mark {
  color: var(--c-yellow);
  font-size: 52px;
  font-family: 'Poppins', sans-serif;
  font-weight: 800;
  line-height: 0.8;
  margin-bottom: 12px;
}

.testi-text {
  font-style: italic;
  font-size: 14px;
  line-height: 1.7;
  color: var(--c-dark);
  margin-bottom: 16px;
  position: relative;
  z-index: 1;
}

.testi-author {
  border-top: 1px solid rgba(0,0,0,0.1);
  padding-top: 16px;
}

.testi-name {
  font-weight: 700;
  color: var(--c-dark);
  margin-bottom: 4px;
}

.testi-location {
  font-size: 13px;
  color: var(--c-muted-deep);
  margin-bottom: 8px;
}

.testi-capacity {
  display: inline-block;
  background-color: var(--c-tag-bg);
  color: var(--c-tag-text);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 10px;
}
</style>
