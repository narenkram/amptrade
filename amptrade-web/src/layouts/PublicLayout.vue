<template>
  <NavbarPublic />
  <main class="container-xxl bg-color-2">
    <RouterView />
  </main>
  <LandingFooter />
</template>

<script setup lang="ts">
import NavbarPublic from '@/modules/public/components/NavbarPublic.vue'
import LandingFooter from '@/modules/public/components/LandingFooter.vue'
</script>
