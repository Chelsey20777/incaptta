<!--
  AiChatIcon — Neural network / analytics intelligence icon

  Gradient square base (app-icon style, rx=8) with a three-node neural
  network mark inside. Designed to read clearly at 20×20 and up.

  Gradient: #00C896 teal-green (top-left) → #0066FF electric blue (mid)
            → #7B2FFF deep purple (bottom-right)

  Safe to render multiple times per page: gradient ID is scoped via a
  randomised suffix injected at component mount so instances don't share
  the same <defs> reference.
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Give each instance a unique gradient ID so multiple mounts don't conflict.
const uid = ref('aicg0')
onMounted(() => {
  uid.value = 'aicg' + Math.random().toString(36).slice(2, 7)
})
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        :id="uid"
        x1="0%" y1="0%"
        x2="100%" y2="100%"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%"   stop-color="#FF6B00" />
        <stop offset="50%"  stop-color="#FF8903" />
        <stop offset="100%" stop-color="#FFB347" />
      </linearGradient>
    </defs>

    <!-- Rounded square base -->
    <rect width="32" height="32" rx="8" :fill="`url(#${uid})`" />

    <!-- ── Neural network mark ──────────────────────────────────────────── -->
    <!-- Three nodes in a downward-pointing triangle arrangement            -->
    <!-- Connecting lines drawn first so nodes render on top               -->

    <!-- Line: top-center → bottom-left -->
    <line
      x1="16" y1="11"
      x2="9"  y2="21"
      stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.85"
    />
    <!-- Line: top-center → bottom-right -->
    <line
      x1="16" y1="11"
      x2="23" y2="21"
      stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.85"
    />
    <!-- Line: bottom-left → bottom-right -->
    <line
      x1="9"  y1="23"
      x2="23" y2="23"
      stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.85"
    />

    <!-- Node: top-center (primary / "brain") -->
    <circle cx="16" cy="9"  r="2.8" fill="white" />

    <!-- Node: bottom-left -->
    <circle cx="9"  cy="23" r="2.2" fill="white" fill-opacity="0.92" />

    <!-- Node: bottom-right -->
    <circle cx="23" cy="23" r="2.2" fill="white" fill-opacity="0.92" />
  </svg>
</template>
