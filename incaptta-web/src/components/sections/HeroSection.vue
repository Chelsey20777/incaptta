<script setup lang="ts">
import { ArrowRight, ArrowDown } from 'lucide-vue-next'
</script>

<template>
  <section class="hero-section min-h-screen pt-20 lg:pt-0">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
      <div class="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-screen py-12 lg:py-0">
        <!-- Left Column -->
        <div class="space-y-6 lg:space-y-8">
          <!-- Eyebrow -->
          <span class="hero-eyebrow">Zimbabwe's Leading Agri-Structures Company</span>

          <!-- H1 -->
          <h1 class="hero-h1">
            Build Smarter Poultry Farms. Built to <span class="hero-h1-accent">Last.</span>
          </h1>

          <!-- Subheading -->
          <p class="hero-subtext">
            Incaptta designs and constructs high-performance fowlruns,
            installs automated feeding & drinking systems, and delivers
            complete poultry farming solutions across Zimbabwe.
          </p>

          <!-- CTAs -->
          <div class="flex flex-col sm:flex-row gap-4">
            <a href="/#contact" class="btn-primary">
              Get a Free Quote
              <ArrowRight class="w-5 h-5" />
            </a>
            <a href="/#projects" class="btn-secondary">
              Explore Our Work
              <ArrowDown class="w-5 h-5" />
            </a>
          </div>

          <!-- Social Proof Stats -->
          <div class="flex flex-wrap gap-3 pt-4">
            <span class="stat-pill">8+ Years Experience</span>
            <span class="stat-pill">40,000+ Bird Capacity Projects</span>
            <span class="stat-pill">Trusted by UZ, Irvines & SABLE</span>
          </div>
        </div>

        <!-- Right Column - Hero Image Placeholder -->
        <div class="relative">
          <div class="hero-image-placeholder aspect-[4/3] rounded-2xl shadow-2xl flex items-center justify-center">
            <div class="text-center p-8">
              <div class="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 22V12h6v10" />
                </svg>
              </div>
              <p class="text-white/80 text-lg font-medium">Incaptta Fowlrun Photo</p>
              <p class="text-white/50 text-sm mt-2">Professional project imagery coming soon</p>
            </div>
          </div>

          <!-- Decorative Element -->
          <div class="absolute -bottom-4 -left-4 w-24 h-24 bg-accent/10 rounded-full blur-2xl"></div>
          <div class="absolute -top-4 -right-4 w-32 h-32 bg-primary/10 rounded-full blur-2xl"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  background-color: var(--c-dark);
  padding: 60px 24px 52px;
}

.hero-eyebrow {
  color: var(--c-yellow);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 14px;
  display: block;
}

.hero-h1 {
  color: #ffffff;
  font-family: 'Poppins', sans-serif;
  font-size: 42px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 18px;
}

.hero-h1-accent {
  color: var(--c-yellow);
}

.hero-subtext {
  color: var(--c-muted);
  font-size: 15px;
  line-height: 1.7;
  margin-bottom: 28px;
  max-width: 480px;
}

.btn-primary {
  background-color: var(--c-green-mid);
  color: #ffffff;
  padding: 13px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 15px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: var(--c-green);
}

.btn-secondary {
  background-color: transparent;
  color: #ffffff;
  padding: 13px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 15px;
  border: 1.5px solid rgba(255,255,255,0.3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background-color: rgba(255,255,255,0.1);
}

.stat-pill {
  background-color: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--c-light-text);
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  display: inline-block;
}

.hero-image-placeholder {
  background: linear-gradient(135deg, var(--c-card-dark) 0%, var(--c-green) 100%);
  border: 1px solid rgba(249,168,37,0.2);
  min-height: 280px;
}

.text-accent {
  color: var(--c-yellow);
}

.bg-accent\/20 {
  background-color: rgba(249, 168, 37, 0.2);
}

.bg-accent\/10 {
  background-color: rgba(249, 168, 37, 0.1);
}

.bg-primary\/10 {
  background-color: rgba(27, 94, 32, 0.1);
}
</style>
