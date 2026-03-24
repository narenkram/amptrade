<script setup lang="ts">
/**
 * InstrumentPriceDisplay Component
 * ================================
 * This component is responsible for displaying the LTP, percentage change,
 * margin, and open interest values for a trading instrument.
 * 
 * IMPORTANT: This component is intentionally separated from TradingInstrument.vue
 * to isolate the frequently updating price data (LTP ticks) from the strike
 * selection dropdown. This prevents the dropdown from flickering when prices update.
 */

import { computed } from 'vue'

const props = defineProps<{
  type: 'CALL' | 'PUT' | 'FUT' | 'EQ'
  isInstrumentSelected: boolean
  isLoading: boolean
  ltp: number | null
  pctChange: number | null
  marginRequired: string | null
  openInterest: number | null
  prevOpenInterest: number | null
}>()

// Compute OI change percentage
const oiChangePercentage = computed(() => {
  if (
    props.openInterest !== null &&
    props.prevOpenInterest !== null &&
    props.prevOpenInterest !== 0 &&
    !isNaN(props.openInterest) &&
    !isNaN(props.prevOpenInterest)
  ) {
    const change = ((props.openInterest - props.prevOpenInterest) / props.prevOpenInterest) * 100
    return isNaN(change) ? null : change
  }
  return null
})

// Compute OI change value
const oiChangeValue = computed(() => {
  if (
    props.openInterest !== null &&
    props.prevOpenInterest !== null &&
    !isNaN(props.openInterest) &&
    !isNaN(props.prevOpenInterest)
  ) {
    const change = props.openInterest - props.prevOpenInterest
    return isNaN(change) ? null : change
  }
  return null
})

// Format numbers in Indian style (thousands, lakhs, crores)
const formatIndianNumber = (num: number): string => {
  if (isNaN(num) || num === null || num === undefined) {
    return '-'
  }

  if (num < 1000) {
    return num.toString()
  } else if (num < 100000) {
    return (num / 1000).toFixed(2) + 'K'
  } else if (num < 10000000) {
    return (num / 100000).toFixed(2) + 'L'
  } else {
    return (num / 10000000).toFixed(2) + 'Cr'
  }
}
</script>

<template>
  <div
    class="col-12 mt-2 d-flex align-items-center"
    :style="{
      'justify-content': type === 'PUT' ? 'flex-end' : 'flex-start',
      'text-align': type === 'PUT' ? 'right' : 'left',
    }"
  >
    <span class="fw-bold">
      <template v-if="isInstrumentSelected">
        <template v-if="isLoading || !ltp">
          <span class="spinner-border spinner-border-sm text-secondary" role="status" />
        </template>
        <template v-else>
          LTP: ₹{{ ltp }}
          <span
            v-if="pctChange !== null && !isNaN(pctChange)"
            :class="{
              'ms-2 text-success': pctChange > 0,
              'ms-2 text-danger': pctChange < 0,
              'ms-2 text-muted': pctChange === 0,
            }"
          >
            {{ pctChange.toFixed(2) }}%
          </span>
          <span class="ms-2 text-muted"> ₹{{ marginRequired }} </span>
          <br />
          <!-- Display Open Interest for options and futures -->
          <span
            v-if="openInterest !== null && (type === 'CALL' || type === 'PUT' || type === 'FUT')"
            class="text-muted"
          >
            OI: {{ formatIndianNumber(openInterest) }}
            <template v-if="prevOpenInterest !== null && oiChangeValue !== null && oiChangePercentage !== null && !isNaN(oiChangePercentage)">
              <span
                :class="{
                  'ms-1 text-success': oiChangeValue > 0,
                  'ms-1 text-danger': oiChangeValue < 0,
                  'ms-1 text-muted': oiChangeValue === 0,
                }"
                :title="`Previous OI: ${formatIndianNumber(prevOpenInterest)}`"
              >
                {{ Math.abs(oiChangePercentage).toFixed(2) }}%
              </span>
            </template>
          </span>
        </template>
      </template>
      <template v-else>-</template>
    </span>
  </div>
</template>
