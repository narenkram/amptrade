<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import logo from '@/assets/logo.png'

const allRoutes = ref([
  { path: '/app/terminal', name: 'Terminal', icon: ['fas', 'terminal'], iconClass: 'text' },
  {
    path: '/app/manage-brokers',
    name: 'Brokers',
    icon: ['fas', 'dollar-sign'],
    iconClass: 'text-success',
  },
  { path: '/app/settings', name: 'Settings', icon: ['fas', 'cog'], iconClass: 'text-secondary' },
])

// Use allRoutes directly since we no longer need filtering
const routes = computed(() => allRoutes.value)

const isNavbarOpen = ref(false)
const route = useRoute()

onMounted(() => {
  const navbarCollapse = document.getElementById('navbarSupportedContent')
  if (navbarCollapse) {
    navbarCollapse.addEventListener('show.bs.collapse', () => {
      isNavbarOpen.value = true
    })
    navbarCollapse.addEventListener('hide.bs.collapse', () => {
      isNavbarOpen.value = false
    })
  }
})

// Watch for route changes and close navbar
watch(
  () => route.path,
  () => {
    closeNavbar()
  },
)

const closeNavbar = () => {
  // Close the navbar when a navigation link is clicked or route changes
  const navbarCollapse = document.getElementById('navbarSupportedContent')
  if (navbarCollapse && isNavbarOpen.value) {
    // Manually remove the 'show' class to close the navbar
    navbarCollapse.classList.remove('show')
    isNavbarOpen.value = false
  }
}
</script>

<template>
  <nav class="navbar navbar-expand-md Navigation container-fluid px-2">
    <RouterLink to="/" class="navbar-brand d-md-flex align-items-center Logo">
      <img :src="logo" alt="AmpTrade Logo" />
      <span class="ms-1 fw-bold text-color d-md-inline Logo_text">AmpTrade</span>
    </RouterLink>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent"
      aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
      <FontAwesomeIcon :icon="isNavbarOpen ? 'xmark' : 'bars'" class="text-color" />
    </button>
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav ms-auto mt-2 mt-md-0 mt-lg-0">
        <li class="nav-item" v-for="route in routes" :key="route.path">
          <RouterLink :to="route.path" class="nav-link mx-2 ms-lg-0 me-lg-2 px-2"
            :class="{ 'active-route': $route.path === route.path }" @click="closeNavbar">
            <FontAwesomeIcon :icon="route.icon" :class="['nav-icon fa-fw', route.iconClass]" />
            <span class="nav-text">{{ route.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
