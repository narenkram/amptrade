<template>
  <section class="row py-5">
    <div class="col-12 text-center py-5">
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for doesn't exist or has been moved.</p>
      <button @click="goToHome" class="btn btn-primary">Go to Homepage</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'

const router = useRouter()

useHead({
  title: '404 - Page Not Found | AmpTrade',
  meta: [
    {
      name: 'description',
      content:
        'The page you are looking for could not be found. Return to AmpTrade homepage to explore our trading software.',
    },
    {
      name: 'robots',
      content: 'noindex, follow',
    },
  ],
})

const goToHome = () => {
  router.push('/')
}
</script>
