<template>
  <NavBar />
  <main class="container-fluid bg-color-2">
    <RouterView />
  </main>
</template>

<script setup lang="ts">
import NavBar from '@/modules/private/shared/components/NavBar.vue'
</script>
