<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'
import { auth } from '@/modules/common/firebase/config'
import { onAuthStateChanged } from 'firebase/auth'

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      // console.log('User is signed in:', user)
    } else {
      // User is signed out
      // console.log('User is signed out')
    }
  })
})
</script>

<template>
  <RouterView />
</template>
