<template>
  <!-- Hero Section with App Preview -->
  <section class="py-3">
    <div class="container-fluid">
      <div class="row align-items-center">
        <div class="col-12 col-lg-6 col-xl-5">
          <div class="h4 fw-semibold mb-2">API Trading App</div>
          <h1 class="display-6 fw-bold mb-2">Multi Broker Trading</h1>
          <p class="lead mb-2">
            Connect, trade, replicate/copy trades to multiple brokers simultaneously.
          </p>
          <p class="text-success fw-semibold mb-3">Open-source and free</p>
          <p class="mb-4 text-muted">
            Most suitable for traders who have their capital split across multiple broker accounts
            or someone who manages multiple accounts
          </p>
          <div class="d-grid d-sm-flex gap-3">
            <button @click="scrollToSection('features')" class="btn btn-primary">
              Explore Features
            </button>
            <a
              :href="GITHUB_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-outline d-inline-flex align-items-center"
            >
              <FontAwesomeIcon :icon="['fab', 'github']" class="me-2" />
              View on GitHub
            </a>
          </div>
        </div>
        <div class="col-12 col-lg-6 col-xl-7">
          <img
            src="@/assets/amptrade_preview_desktop.png"
            alt="AmpTrade Trading App Preview"
            class="img-fluid rounded shadow-lg"
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Supported Brokers Section -->
  <section class="row py-5" id="brokers">
    <div class="col-12 text-center">
      <h2 class="mb-4">Supported Brokers</h2>
      <p class="lead mb-4">
        Trade seamlessly using our supported brokers' robust APIs for reliable order execution.
      </p>

      <div class="row justify-content-center">
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://zerodha.com/" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/zerodha_logo.png"
                  alt="Zerodha"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://upstox.com/" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/upstox_logo.png"
                  alt="Upstox"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://flattrade.in/" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/flattrade_logo.png"
                  alt="Flattrade"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://www.infinn.in/" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/infinn_logo.png"
                  alt="Infinn"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://shoonya.com" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/shoonya_logo.png"
                  alt="Shoonya"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a
                href="https://www.tradesmartonline.in/"
                target="_blank"
                rel="nofollow"
                class="d-block"
              >
                <img
                  src="@/assets/tradesmart_logo.png"
                  alt="Tradesmart"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-4 col-lg-2 mb-4">
          <div class="card h-100 border-0">
            <div class="card-body text-center">
              <a href="https://www.zebuetrade.com/" target="_blank" rel="nofollow" class="d-block">
                <img
                  src="@/assets/zebu_logo.png"
                  alt="Zebu"
                  class="img-fluid Broker_logo"
                  style="max-height: 60px"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Key Features Section -->
  <section class="row py-5 bg-color-2 rounded" id="features">
    <div class="col-12">
      <h2 class="text-center mb-4">Key Features</h2>
      <p class="lead text-center mb-5">
        Essential features optimized for day trading, and scalping.
      </p>
      <div class="row">
        <div v-for="(feature, index) in features" :key="index" class="col-12 mb-4">
          <div
            class="card h-100"
            :style="{
              backgroundColor: `var(--card-bg-${index + 1})`,
              boxShadow: `0 4px 8px 0 var(--card-bg-${index + 1})`,
              borderColor: `var(--card-icon-${index + 1})`,
            }"
          >
            <div class="card-body">
              <div class="row align-items-center">
                <div :class="index % 2 === 0 ? 'col-md-7 order-md-1' : 'col-md-7 order-md-2'">
                  <h3 class="card-title mb-3 fw-bold">{{ feature.title }}</h3>
                  <p class="card-text">{{ feature.description }}</p>
                </div>
                <div :class="index % 2 === 0 ? 'col-md-5 order-md-2' : 'col-md-5 order-md-1'">
                  <img
                    :src="feature.mediaSrc"
                    :alt="feature.title"
                    class="img-fluid mb-3 rounded"
                    style="max-height: 300px; width: 100%; object-fit: contain"
                    @error="handleMediaError"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Trading Instruments Section -->
  <section class="row py-5 bg-color-2 rounded-3 mb-5">
    <div class="col-12 text-center">
      <h2 class="mb-4">Trading Instruments</h2>
      <p class="lead mb-4">
        Trade a wide range of instruments on
        <span class="fw-bold text-danger">NSE</span>, <span class="fw-bold text-primary">BSE</span>,
        and
        <span class="fw-bold text-purple">MCX</span>
      </p>
      <p class="mb-4">
        Some of the popular instruments include
        <code class="text-color">
          NIFTY 50, BANK NIFTY, FINNIFTY, SENSEX, BANKEX, COPPER, CRUDEOIL, CRUDEOILM, GOLD, GOLDM,
          NATGASMINI, NATURALGAS, SILVER, SILVERM, ZINC
        </code>
      </p>

      <div class="row justify-content-center">
        <div v-for="(instrument, index) in tradingInstruments" :key="index" class="col-md-4 mb-4">
          <div
            class="card h-100 instrument-card"
            :style="{
              backgroundColor: `var(--card-bg-${index + 1})`,
              borderColor: `var(--card-icon-${index + 1})`,
              boxShadow: `0 4px 8px 0 var(--card-bg-${index + 1})`,
            }"
          >
            <div class="card-body">
              <FontAwesomeIcon
                v-if="instrument === 'Index Options'"
                icon="fa-solid fa-chart-line"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <FontAwesomeIcon
                v-if="instrument === 'Stock Options'"
                icon="fa-solid fa-cubes"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <FontAwesomeIcon
                v-if="instrument === 'Index Futures'"
                icon="fa-solid fa-chart-bar"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <FontAwesomeIcon
                v-if="instrument === 'Stock Futures'"
                icon="fa-solid fa-forward"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <FontAwesomeIcon
                v-if="instrument === 'Stocks Equity'"
                icon="fa-solid fa-building"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <FontAwesomeIcon
                v-if="instrument === 'Commodity'"
                icon="fa-solid fa-wheat-awn"
                class="fa-2x mb-3"
                :style="{ color: `var(--card-icon-${index + 1})` }"
              />
              <h3 class="card-title h5 mb-0">{{ instrument }}</h3>
              <p class="mt-2" v-if="instrument === 'Index Options'">
                Trade index options on NSE and BSE
              </p>
              <p class="mt-2" v-if="instrument === 'Stock Options'">
                Trade options on 220 intraday F&O NSE stocks
              </p>
              <p class="mt-2" v-if="instrument === 'Index Futures'">
                Trade futures on major indices on NSE and BSE
              </p>
              <p class="mt-2" v-if="instrument === 'Stock Futures'">
                Trade futures contracts of 220 NSE stocks
              </p>
              <p class="mt-2" v-if="instrument === 'Stocks Equity'">
                Trade 220 stocks in NSE cash segment
              </p>
              <p class="mt-2" v-if="instrument === 'Commodity'">
                Trade commodity futures and options on MCX
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import riskManagementImage from '@/assets/trading_risk_management.png'
import oneClickImage from '@/assets/1click_arrow_keys.png'
import { useHead } from '@unhead/vue'

interface Feature {
  title: string
  mediaSrc: string
  description: string
}

const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL || 'https://github.com/narenkram/amptrade'

const features: Feature[] = [
  {
    title: 'Advanced Risk Management',
    mediaSrc: riskManagementImage,
    description:
      'Comprehensive risk control with stoploss, automatic trailing, manual trailing, and target settings for both individual positions and overall MTM to safeguard your capital.',
  },
  {
    title: 'Keyboard Shortcuts & Mouse Scroll',
    mediaSrc: oneClickImage,
    description:
      'Execute trades instantly using keyboard shortcuts, arrow keys, and mouse scroll wheel. Perfect for fine-tuning quantities, prices, and selecting option strike prices for efficient trading.',
  },
]

const tradingInstruments = [
  'Index Options',
  'Stock Options',
  'Index Futures',
  'Stock Futures',
  'Stocks Equity',
  'Commodity',
]

const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId)
  if (element) {
    // Get navbar height to offset scrolling position
    const navbar = document.querySelector('.navbar') as HTMLElement
    const navbarHeight = navbar ? navbar.offsetHeight : 0

    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset
    const offsetPosition = elementPosition - navbarHeight - 16 // Extra padding for visual comfort

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    })
  }
}

onMounted(() => {
  const root = document.documentElement
  const colors: string[] = [
    'rgba(255, 182, 193, 0.15)', // Light pink
    'rgba(173, 216, 230, 0.15)', // Light blue
    'rgba(144, 238, 144, 0.15)', // Light green
    'rgba(255, 255, 224, 0.15)', // Light yellow
    'rgba(230, 230, 250, 0.15)', // Lavender
    'rgba(255, 218, 185, 0.15)', // Peach
  ]

  // Randomize colors first
  colors.sort(() => Math.random() - 0.5)

  const maxCards = Math.max(features.length, tradingInstruments.length)

  for (let i = 0; i < maxCards; i++) {
    const color = colors[i % colors.length]
    // Extract RGB values from the color
    const rgba = color.match(/\d+/g)!.map(Number)
    // Create darker version from the same color
    const darkerRGB = rgba.slice(0, 3).map((value) => Math.round(value * 0.5))
    const darkerColor = `rgba(${darkerRGB.join(', ')}, 1)`

    root.style.setProperty(`--card-bg-${i + 1}`, color)
    root.style.setProperty(`--card-icon-${i + 1}`, darkerColor)
  }
})

const handleMediaError = (event: Event) => {
  console.error('Media loading error:', event)
}

useHead({
  title: 'Open-Source API Trading App | AmpTrade - Professional Trading Tools',
  meta: [
    {
      name: 'description',
      content:
        'AmpTrade is open-source and free. Advanced trading features like trailing stoploss, risk management for NSE, BSE & MCX trading. Connect with Zerodha, Upstox, Flattrade, Infinn, Shoonya, Tradesmart, and Zebu brokers.',
    },
    {
      name: 'keywords',
      content:
        'intraday trading app, options trading software, futures trading India, stock market tools, risk management trading, Zerodha, Upstox, Flattrade, Infinn, Shoonya, Tradesmart, Zebu',
    },
  ],
  link: [{ rel: 'canonical', href: 'https://www.amptrade.in/' }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'AmpTrade',
        operatingSystem: 'Web',
        applicationCategory: 'FinanceApplication',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          category: 'SoftwareApplication',
        },
      }),
    },
  ],
})
</script>
