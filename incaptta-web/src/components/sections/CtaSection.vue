<script setup lang="ts">
import { ArrowRight, Download, Calculator } from 'lucide-vue-next'
</script>

<template>
  <section class="cta-section relative overflow-hidden">
    <!-- Diagonal Split Background -->
    <div class="absolute inset-0">
      <div class="cta-bg-dark" style="clip-path: polygon(0 0, 60% 0, 40% 100%, 0 100%)"></div>
      <div class="cta-bg-yellow" style="clip-path: polygon(60% 0, 100% 0, 100% 100%, 40% 100%)"></div>
    </div>

    <!-- Content -->
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <!-- Left Side (Dark) -->
        <div class="cta-left">
          <h2 class="cta-title">
            Ready to Build Your <span class="cta-accent">Poultry Operation?</span>
          </h2>
          <p class="cta-sub">
            Get a free consultation and BOQ estimate from Zimbabwe's leading agri-structures team.
          </p>
        </div>

        <!-- Right Side (Yellow) -->
        <div class="flex flex-col gap-4 lg:items-end">
          <div class="flex flex-col sm:flex-row gap-4">
            <a href="/#contact" class="cta-btn-primary">
              Request a Free Quote
              <ArrowRight class="w-5 h-5" />
            </a>
            <a href="#" class="cta-btn-secondary">
              Download Company Profile
              <Download class="w-5 h-5" />
            </a>
          </div>
          <router-link to="/calculator" class="cta-btn-tertiary">
            <Calculator class="w-5 h-5" />
            <span>Try the Free BOQ Calculator</span>
            <span class="text-xs opacity-70">→ Instant estimate, no signup</span>
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta-section {
  position: relative;
}

.cta-bg-dark {
  position: absolute;
  inset: 0;
  background-color: var(--c-dark);
}

.cta-bg-yellow {
  position: absolute;
  inset: 0;
  background-color: var(--c-yellow);
}

.cta-left {
  color: #ffffff;
}

.cta-title {
  font-family: 'Poppins', sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 16px;
  line-height: 1.2;
}

.cta-accent {
  color: var(--c-yellow);
}

.cta-sub {
  color: var(--c-muted);
  font-size: 16px;
  line-height: 1.6;
  max-width: 480px;
}

.cta-btn-primary {
  background-color: var(--c-yellow);
  color: var(--c-dark);
  padding: 14px 28px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 15px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.cta-btn-primary:hover {
  background-color: #f5bc2a;
}

.cta-btn-secondary {
  background-color: transparent;
  color: var(--c-dark);
  padding: 13px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: 2px solid var(--c-dark);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.cta-btn-secondary:hover {
  background-color: var(--c-dark);
  color: #ffffff;
}

.cta-btn-tertiary {
  background-color: transparent;
  color: var(--c-dark);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: 2px solid var(--c-dark);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.cta-btn-tertiary:hover {
  background-color: var(--c-dark);
  color: #ffffff;
}
</style>
