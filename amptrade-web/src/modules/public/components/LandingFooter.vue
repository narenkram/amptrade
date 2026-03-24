<template>
  <footer class="bg-dark text-white py-5">
    <div class="container-xxl">
      <div class="row">
        <!-- Company Info -->

        <div class="col-md-6 col-lg-6 mb-4">
          <div class="d-flex flex-row justify-content-start align-items-center">
            <img
              src="@/assets/logo.png"
              alt="AmpTrade"
              class="img-fluid mb-3"
              style="height: 24px"
            />
            <h3 class="d-inline-flex h5 fw-bold mb-3 Logo_text ms-2">AmpTrade</h3>
          </div>
          <p class="text-white">
            AmpTrade is free, open-source trading software for Indian markets. Trade
            options, futures, and stocks through Zerodha, Upstox, Flattrade, Infinn, Shoonya,
            Tradesmart, and Zebu broker accounts.
          </p>
          <!-- Social Links -->
          <div class="mt-3">
            <h4 class="h6 fw-bold mb-2">Social Links</h4>
            <div class="d-flex gap-3">
              <a
                href="https://youtube.com/@narenkram-yt"
                target="_blank"
                rel="noopener noreferrer"
                class="text-white text-decoration-none hover-white"
              >
                <font-awesome-icon :icon="['fab', 'youtube']" size="lg" />
              </a>
              <a
                href="https://t.me/narenkram_com"
                target="_blank"
                rel="noopener noreferrer"
                class="text-white text-decoration-none hover-white"
              >
                <font-awesome-icon :icon="['fab', 'telegram']" size="lg" />
              </a>
            </div>
          </div>
        </div>


      </div>

      <!-- Copyright -->
      <div class="border-top border-secondary mt-4 pt-4 text-center text-white">
        <p class="mb-0">&copy; {{ new Date().getFullYear() }} AmpTrade. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
// No additional script needed for now
</script>

<style scoped>
.hover-white:hover {
  color: white !important;
  transition: color 0.2s ease;
}
</style>
