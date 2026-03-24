<template>
  <!-- amptrade-web/src/components/NavigationComponent.vue -->
  <nav class="navbar navbar-expand-md Navigation">
    <div class="container-xxl">
      <RouterLink to="/" class="navbar-brand d-flex align-items-center">
        <img src="@/assets/logo.png" class="Logo" alt="AmpTrade" />
        <span class="ms-1 fw-bold text-color Logo_text">AmpTrade</span>
      </RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarSupportedContent"
        aria-controls="navbarSupportedContent"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <FontAwesomeIcon :icon="isNavbarOpen ? 'xmark' : 'bars'" class="text-color" />
      </button>
      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item" v-for="route in routes" :key="route.path">
            <RouterLink
              :to="route.path"
              class="nav-link"
              :class="{ 'active-route': $route.path === route.path }"
              @click="closeNavbar"
            >
              <FontAwesomeIcon :icon="route.icon" :class="['nav-icon', route.iconClass]" />
              <span class="nav-text">{{ route.name }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

export default defineComponent({
  name: 'NavbarPublic',
  setup() {
    const isNavbarOpen = ref(false)
    const route = useRoute()

    // Listen for bootstrap collapse events to update icon state
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

    const commonRoutes: Array<{ path: string; name: string; icon: unknown; iconClass: string }> = []

    const authenticatedRoutes = [
      {
        path: '/app/terminal',
        name: 'Trade',
        icon: ['fas', 'bolt'],
        iconClass: 'text-danger',
      },
    ]

    return {
      routes: computed(() => [...commonRoutes, ...authenticatedRoutes]),
      isNavbarOpen,
      closeNavbar,
    }
  },
})
</script>
