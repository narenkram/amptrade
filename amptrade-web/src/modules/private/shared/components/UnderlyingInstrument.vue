<!--
UnderlyingInstrument.vue - Unified Underlying Symbol Display Component

CRITICAL: This component unifies the underlying symbol display across:
- SingleBrokerTradeView.vue
- TerminalView.vue

HOW IT WORKS:
=============
1. AUTOMATIC CONTEXT DETECTION:
   - Detects trading mode via injected 'requiredAccessType'
   - Provides appropriate display complexity based on mode

2. CONTEXT INJECTION SYSTEM:
   - Uses consolidated 'instrumentContext' when available
   - Falls back to individual legacy injections for backward compatibility

3. DISPLAY MODES:
   - Simple: Symbol + LTP (when simplified display is needed)
   - Full: Symbol + LTP + Percentage Change + Developer Token (for live trading)

USAGE IN TRADING VIEWS:
=======================
<UnderlyingInstrument />

The component automatically detects the trading mode and displays accordingly.
-->
<script setup lang="ts">
import { computed, inject } from 'vue'
import type { InstrumentContext, TradeFormData } from '@/modules/private/shared/types/trade'

/**
 * CRITICAL: Automatic Trading Mode Detection
 * ==========================================
 * This detects the trading mode from the parent view to determine display complexity
 */

/**
 * CRITICAL: Dual Context System for Backward Compatibility
 * ========================================================
 * Supports both new consolidated context and legacy individual injections
 */
const instrumentContext = inject<InstrumentContext | null>('instrumentContext', null)

// Use either the new context or legacy injections - following same pattern as TradingInstrument.vue
const tradeFormData = inject('tradeFormData') as TradeFormData | undefined

// Extract data from either context or legacy injections
const selectedSymbol = instrumentContext
  ? instrumentContext.selectedSymbol
  : tradeFormData ? tradeFormData.selectedSymbol : inject('selectedSymbol', computed(() => ''))

const underlyingLtp = instrumentContext
  ? instrumentContext.ltpValues.underlying
  : inject('underlyingLtp', computed(() => null))

const underlyingPctChange = instrumentContext
  ? instrumentContext.underlyingPctChange
  : inject('underlyingPctChange', computed(() => null))

const underlyingToken = instrumentContext
  ? instrumentContext.underlyingToken
  : inject('underlyingToken', computed(() => null))


/**
 * Display Mode Logic
 * ==================
 * - Simple: Shows just symbol and LTP
 * - Full: Shows symbol, LTP, percentage change, and developer info
 */
const isSimpleMode = computed(() => false) // Always use full mode

const showDeveloperInfo = computed(() => Boolean(underlyingToken?.value))

// Format percentage change with proper sign
const formattedPctChange = computed(() => {
  if (underlyingPctChange?.value === null || underlyingPctChange?.value === undefined) {
    return '-'
  }
  return underlyingPctChange.value.toFixed(2)
})

// Format LTP with fallback handling
const formattedLtp = computed(() => {
  if (underlyingLtp?.value !== null && underlyingLtp?.value !== undefined) {
    return underlyingLtp.value.toFixed(2)
  }
  return '-'
})

// Percentage change color classes
const pctChangeClasses = computed(() => {
  const pctValue = underlyingPctChange?.value ?? 0
  return {
    'text-success': pctValue > 0,
    'text-danger': pctValue < 0,
    'text-muted': pctValue === 0,
  }
})
</script>

<template>
  <div class="order-3 order-md-0 col-12 col-md-4 col-lg-4 text-center mt-3 mt-md-0">
    <!-- Symbol Name -->
    <p class="mb-0">
      <span>{{ selectedSymbol }}</span>
    </p>

    <!-- LTP Display -->
    <p class="mb-0">
      <b>{{ formattedLtp }}</b>

      <!-- Percentage Change (only in full mode) -->
      <span
        v-if="!isSimpleMode"
        class="mb-0 fw-bold ms-1"
        :class="pctChangeClasses"
      >
        ({{ formattedPctChange }}%)
      </span>
    </p>

    <!-- Developer Token Info (only in full mode with developer settings) -->
    <div
      v-if="!isSimpleMode && showDeveloperInfo"
      class="text-muted"
    >
      Token: {{ underlyingToken }}
    </div>
  </div>
</template>

<style scoped>
/* Ensure consistent styling with existing layouts */
</style>
