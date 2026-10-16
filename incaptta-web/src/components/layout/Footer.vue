<script setup lang="ts">
import { MapPin, Mail, Phone, Facebook, Instagram } from 'lucide-vue-next'
</script>

<template>
  <footer class="footer">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <!-- About Column -->
        <div>
          <h3 class="footer-heading">About Incaptta</h3>
          <p class="footer-text">
            Zimbabwe's leading agri-structures company, specializing in poultry fowlrun construction,
            automated feeding & drinking systems, and complete poultry farming solutions.
          </p>
        </div>

        <!-- Services Column -->
        <div>
          <h3 class="footer-heading">Our Services</h3>
          <ul class="footer-list">
            <li>Fowlrun Construction</li>
            <li>Nipple Drinker Systems</li>
            <li>Pan Feeder Installation</li>
            <li>Climate Control Systems</li>
            <li>Layer Cage Systems</li>
            <li>Fumigation & Maintenance</li>
          </ul>
        </div>

        <!-- Projects Column -->
        <div>
          <h3 class="footer-heading">Projects</h3>
          <ul class="footer-list">
            <li>UZ Agro-Industrial Park</li>
            <li>SABLE Chickens</li>
            <li>Irvines Zimbabwe</li>
            <li>Command Agriculture</li>
            <li>Contract Grower Sites</li>
          </ul>
        </div>

        <!-- Contact Column -->
        <div>
          <h3 class="footer-heading">Contact Us</h3>
          <ul class="footer-contact-list">
            <li class="flex items-start gap-3">
              <MapPin class="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <span>No. 1734 Chiremba Road, Hillside, Harare, Zimbabwe</span>
            </li>
            <li class="flex items-center gap-3">
              <Mail class="w-5 h-5 text-accent shrink-0" />
              <a href="mailto:sales@incaptta.co.zw" class="footer-link hover:text-white transition-colors">
                sales@incaptta.co.zw
              </a>
            </li>
            <li class="flex items-center gap-3">
              <Phone class="w-5 h-5 text-accent shrink-0" />
              <a href="tel:+263774937250" class="footer-link hover:text-white transition-colors">
                +263 77 493 7250
              </a>
            </li>
          </ul>

          <!-- Social Links -->
          <div class="flex items-center gap-4 mt-6">
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              aria-label="Facebook"
            >
              <Facebook class="w-5 h-5" />
            </a>
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              class="social-link"
              aria-label="Instagram"
            >
              <Instagram class="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="footer-bottom">
        <p class="footer-copy">© 2025 Incaptta Private Limited. Built by Techcess Technology.</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background-color: var(--c-dark-deep) !important;
  color: #ffffff;
}

.footer-heading {
  font-family: 'Poppins', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 16px;
}

.footer-text {
  color: var(--c-muted-deep);
  font-size: 14px;
  line-height: 1.6;
}

.footer-list {
  color: var(--c-muted-deep);
  font-size: 14px;
  line-height: 1.8;
}

.footer-contact-list {
  color: var(--c-muted-deep);
  font-size: 14px;
  line-height: 1.8;
}

.footer-link {
  color: var(--c-muted-dark);
  transition: color 0.2s;
}

.footer-link:hover {
  color: #ffffff;
}

.text-accent {
  color: var(--c-yellow);
}

.social-link {
  width: 40px;
  height: 40px;
  background-color: rgba(255,255,255,0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: all 0.2s;
}

.social-link:hover {
  background-color: var(--c-yellow);
  color: var(--c-dark);
}

.footer-bottom {
  border-top: 1px solid rgba(255,255,255,0.1);
  margin-top: 48px;
  padding-top: 24px;
  text-align: center;
}

.footer-copy {
  color: var(--c-muted-deep);
  font-size: 13px;
}
</style>
