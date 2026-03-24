<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  // Get the current URL path
  const path = window.location.pathname

  // Handle Flattrade redirect
  if (path.includes('/broker-redirect/flattrade')) {
    // Replace double question marks with a single one, if needed.
    const urlParams = new URLSearchParams(window.location.search.replace('??', '?'))
    const code = urlParams.get('code')

    if (code) {
      window.opener?.postMessage(
        {
          type: 'AUTH_CODE',
          code,
        },
        window.location.origin,
      )

      setTimeout(() => {
        window.close()
      }, 1000)
    } else {
      // Handle login failure
      window.opener?.postMessage(
        {
          type: 'AUTH_ERROR',
          error: 'Login failed',
        },
        window.location.origin,
      )
      setTimeout(() => {
        window.close()
      }, 1000)
    }
  }

  // Handle Zerodha redirect
  else if (path.includes('/broker-redirect/zerodha')) {
    // Parse the URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const requestToken = urlParams.get('request_token')
    const status = urlParams.get('status')

    if (status === 'success' && requestToken) {
      window.opener?.postMessage(
        {
          type: 'ZERODHA_AUTH_CODE',
          code: requestToken,
        },
        window.location.origin,
      )

      setTimeout(() => {
        window.close()
      }, 1000)
    } else {
      // Handle login failure
      window.opener?.postMessage(
        {
          type: 'AUTH_ERROR',
          error: 'Zerodha login failed',
        },
        window.location.origin,
      )
      setTimeout(() => {
        window.close()
      }, 1000)
    }
  }

  // Handle Upstox redirect
  else if (path.includes('/broker-redirect/upstox')) {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')

    if (code) {
      window.opener?.postMessage(
        {
          type: 'UPSTOX_AUTH_CODE',
          code,
        },
        window.location.origin,
      )

      setTimeout(() => {
        window.close()
      }, 1000)
    } else {
      window.opener?.postMessage(
        {
          type: 'AUTH_ERROR',
          error: 'Upstox login failed',
        },
        window.location.origin,
      )
      setTimeout(() => {
        window.close()
      }, 1000)
    }
  }
})
</script>

<template>
  <div class="text-center p-4">
    <h2>Processing authentication...</h2>
    <p>This window will close automatically.</p>
  </div>
</template>
