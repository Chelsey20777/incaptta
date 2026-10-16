<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Menu, X, Phone } from 'lucide-vue-next'

const isScrolled = ref(false)
const mobileMenuOpen = ref(false)

const navLinks = [
  { name: 'Home', path: '/' },
  { name: 'Services', path: '/services' },
  { name: 'Projects', path: '/projects' },
  { name: 'Calculator', path: '/calculator' },
  { name: 'Contact', path: '/contact' }
]

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <nav
    :class="[
      'navbar fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      isScrolled ? 'shadow-md py-3' : 'py-4'
    ]"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between">
        <!-- Logo -->
        <router-link to="/" class="flex flex-col logo-link">
          <span class="logo-text">INC<span class="logo-accent">A</span>PTT<span class="logo-accent">A</span></span>
          <span class="logo-tagline">Agri-Structures & Equipment</span>
        </router-link>

        <!-- Desktop Nav Links -->
        <div class="hidden md:flex items-center space-x-8">
          <router-link
            v-for="link in navLinks"
            :key="link.name"
            :to="link.path"
            class="nav-link"
            :class="{ 'nav-link-active': $route.path === link.path }"
          >
            {{ link.name }}
            <span
              v-if="link.name === 'Calculator'"
              class="nav-badge"
            >
              Free
            </span>
          </router-link>
        </div>

        <!-- WhatsApp CTA -->
        <div class="hidden md:flex items-center">
          <a
            href="https://wa.me/263774937250"
            target="_blank"
            rel="noopener noreferrer"
            class="whatsapp-btn"
          >
            <Phone class="w-4 h-4" />
            WhatsApp Us
          </a>
        </div>

        <!-- Mobile Menu Button -->
        <button
          class="mobile-menu-btn"
          @click="mobileMenuOpen = !mobileMenuOpen"
          aria-label="Toggle menu"
        >
          <Menu v-if="!mobileMenuOpen" class="w-6 h-6" />
          <X v-else class="w-6 h-6" />
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    <div
      v-show="mobileMenuOpen"
      class="mobile-menu"
    >
      <div class="px-4 py-4 space-y-3">
        <router-link
          v-for="link in navLinks"
          :key="link.name"
          :to="link.path"
          class="mobile-nav-link"
          :class="{ 'mobile-nav-link-active': $route.path === link.path }"
          @click="mobileMenuOpen = false"
        >
          {{ link.name }}
        </router-link>
        <a
          href="https://wa.me/263774937250"
          target="_blank"
          rel="noopener noreferrer"
          class="mobile-whatsapp-btn"
        >
          <Phone class="w-4 h-4" />
          WhatsApp Us
        </a>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  background-color: var(--c-dark) !important;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.logo-text {
  color: #ffffff;
  font-family: 'Poppins', sans-serif;
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 1px;
}

.logo-accent {
  color: var(--c-yellow);
}

.logo-tagline {
  color: var(--c-muted-dark);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-link {
  color: #9DC4A0;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-link:hover {
  color: #ffffff;
}

.nav-link-active {
  color: var(--c-yellow);
}

.nav-badge {
  display: inline-block;
  background-color: var(--c-yellow);
  color: var(--c-dark);
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.whatsapp-btn {
  background-color: var(--c-green-mid);
  color: #ffffff;
  padding: 9px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.2s;
}

.whatsapp-btn:hover {
  background-color: var(--c-green);
}

.mobile-menu-btn {
  display: none;
  padding: 8px;
  color: #ffffff;
  background: none;
  border: none;
  cursor: pointer;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: block;
  }
}

.mobile-menu {
  display: none;
  background-color: var(--c-dark);
  border-top: 1px solid rgba(255,255,255,0.1);
}

@media (max-width: 768px) {
  .mobile-menu {
    display: block;
  }
}

.mobile-nav-link {
  display: block;
  padding: 10px 0;
  color: #9DC4A0;
  font-size: 16px;
  font-weight: 500;
  transition: color 0.2s;
}

.mobile-nav-link:hover {
  color: #ffffff;
}

.mobile-nav-link-active {
  color: var(--c-yellow);
}

.mobile-whatsapp-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: var(--c-green-mid);
  color: #ffffff;
  padding: 12px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-top: 12px;
  transition: background-color 0.2s;
}

.mobile-whatsapp-btn:hover {
  background-color: var(--c-green);
}
</style>
