<!--
TradingInstrument.vue - Unified Trading Instrument Component

CRITICAL: This is a UNIFIED component that replaces the following files:
- SingleBrokerTradingInstrument.vue (DELETED)
- MultiBrokerTradingInstrument.vue (DELETED)

DO NOT create separate trading instrument files for different modes.
This single component handles ALL trading modes automatically.

HOW IT WORKS:
=============
1. AUTOMATIC CONTEXT DETECTION:
   - Detects trading mode via injected 'requiredAccessType':
    'singleBroker' → Uses useSingleBrokerWebSocket
    'multiBroker' → Uses useMultiBrokerWebSocket

2. CONTEXT INJECTION SYSTEM:
   - Primary: Uses consolidated 'instrumentContext' (recommended)
   - Fallback: Individual legacy injections for backward compatibility
   - NEVER remove the fallback system - components may still use legacy injections

3. WEBSOCKET MANAGEMENT:
   - Automatically selects correct WebSocket composable based on trading mode
   - Handles subscriptions/unsubscriptions for price updates
   - Supports both standard and Zerodha token formats

4. INSTRUMENT TYPES SUPPORTED:
   - Options: CALL/PUT with strike selection and mouse scroll
   - Futures: FUT including commodity futures
   - Equity: EQ with symbol-only display

USAGE IN TRADING VIEWS:
=======================
Simply import and use with type and symbolType props:

Options
<TradingInstrument type="CALL" symbol-type="call" />
<TradingInstrument type="PUT" symbol-type="put" />

Futures
<TradingInstrument type="FUT" symbol-type="fut" />
<TradingInstrument type="FUT" symbol-type="commodity-fut" />

Equity
<TradingInstrument type="EQ" />

CRITICAL DEPENDENCIES:
======================
- Must have 'requiredAccessType' injected by parent view
- Requires either 'instrumentContext' OR legacy individual injections
- Parent must provide appropriate WebSocket composables in scope

DO NOT MODIFY without understanding the context detection system!
-->
<script setup lang="ts">
import {
  computed,
  inject,
  onMounted,
  ref,
  shallowRef,
  type Ref,
  watch,
  onUnmounted,
  nextTick,
  provide,
} from 'vue'
import type {
  InstrumentType,
  InstrumentContext,
  TradeFormData,
} from '@/modules/private/shared/types/trade'
import { useMultiBrokerWebSocket } from '@/modules/private/multibrokertrade/composables/useMultiBrokerWebSocket'
import { useDebounceFn } from '@vueuse/core'
import api from '@/modules/common/api/axios'
import { useNearestStrikeSelection } from '@/modules/private/shared/composables/useNearestStrikeSelection'
import { useMouseScroll } from '@/modules/private/shared/composables/useMouseScroll'
import { getExchangeByInstrumentType } from '@/modules/utils/exchangeUtils'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import InstrumentPriceDisplay from '@/modules/private/shared/components/InstrumentPriceDisplay.vue'

const props = defineProps<{
  type: InstrumentType
  symbolType?: 'call' | 'put' | 'commodity-call' | 'commodity-put' | 'fut' | 'commodity-fut'
}>()

/**
 * CRITICAL: Automatic Trading Mode Detection
 * ==========================================
 * This is the core mechanism that makes this component work across all trading modes.
 * The 'requiredAccessType' is injected by each trading view:
 *
 * - SingleBrokerTradeView.vue provides 'singleBroker'
 * - TerminalView.vue provides 'multiBroker'
 *
 * DO NOT change this injection key or the detection logic!
 */
const { subscribe, unsubscribe } = useMultiBrokerWebSocket()

/**
 * CRITICAL: Dual Context System for Backward Compatibility
 * ========================================================
 * This component supports TWO injection patterns:
 *
 * 1. NEW: Consolidated 'instrumentContext' (recommended)
 *    - Single object containing all instrument data
 *    - Cleaner and more maintainable
 *
 * 2. LEGACY: Individual injections (must be preserved!)
 *    - Individual refs like 'selectedSymbol', 'selectedExpiry', etc.
 *    - Required for components that haven't migrated to new context
 *
 * NEVER remove the legacy fallback system - it ensures backward compatibility!
 */
// Inject the consolidated instrument context if available,
// falling back to legacy injections for backward compatibility
const instrumentContext = inject<InstrumentContext | null>('instrumentContext', null)

// First initialize the composable for strike selection early to avoid reference errors
const {
  selectedStrike,
  resetSelection,
  error: strikeSelectionError,
} = useNearestStrikeSelection({ debug: true })

// Use either the new context or legacy injections
const tradeFormData = inject('tradeFormData') as TradeFormData
if (!tradeFormData) {
  throw new Error('tradeFormData must be provided')
}

// Extract needed values from either context or legacy injections
const selectedSymbol = instrumentContext
  ? instrumentContext.selectedSymbol
  : tradeFormData.selectedSymbol

const selectedExpiry = instrumentContext
  ? instrumentContext.selectedExpiry
  : tradeFormData.selectedExpiry

const selectedSegment = instrumentContext
  ? instrumentContext.selectedSegment
  : tradeFormData.selectedSegment

const strikeData = instrumentContext ? instrumentContext.strikeData : tradeFormData.strikeData

const underlyingLtp = instrumentContext
  ? instrumentContext.ltpValues.underlying
  : (inject('underlyingLtp') as Ref<number | null>)

// Initialize trading symbol refs
const callTradingSymbol = instrumentContext
  ? instrumentContext.tradingSymbols.call
  : (inject('callTradingSymbol', ref('')) as Ref<string>)

const putTradingSymbol = instrumentContext
  ? instrumentContext.tradingSymbols.put
  : (inject('putTradingSymbol', ref('')) as Ref<string>)

const futuresTradingSymbol = instrumentContext
  ? instrumentContext.tradingSymbols.futures
  : (inject('futuresTradingSymbol', ref('')) as Ref<string>)

const equityTradingSymbol = instrumentContext
  ? instrumentContext.tradingSymbols.equity
  : (inject('equityTradingSymbol', ref('')) as Ref<string>)

// Initialize commodity-specific refs
const commodityFuturesTradingSymbol = inject(
  'commodityFuturesTradingSymbol',
  ref(''),
) as Ref<string>
const commodityOptionsCallSymbol = inject('commodityOptionsCallSymbol', ref('')) as Ref<string>
const commodityOptionsPutSymbol = inject('commodityOptionsPutSymbol', ref('')) as Ref<string>

// Get needed exchange value
const selectedExchange = instrumentContext
  ? instrumentContext.selectedExchange
  : (inject('selectedExchange', ref('NSE')) as Ref<string>)

/**
 * CRITICAL: Trading Symbol Selection Logic
 * ========================================
 * This computed property dynamically selects the correct trading symbol
 * based on the instrument type and symbol type. This is essential for:
 *
 * - Options: Call/Put symbols for different option types
 * - Futures: Regular vs Commodity futures symbols
 * - Equity: Standard equity symbols
 * - Commodities: Special commodity option symbols
 *
 * The logic handles both regular and commodity instruments automatically.
 * DO NOT modify this without understanding all instrument types!
 */
// Unified computed to retrieve the trading symbol based on the instrument type
const tradingSymbol = computed(() => {
  if (props.symbolType === 'call') return callTradingSymbol.value
  if (props.symbolType === 'put') return putTradingSymbol.value
  if (props.symbolType === 'commodity-call') return commodityOptionsCallSymbol.value
  if (props.symbolType === 'commodity-put') return commodityOptionsPutSymbol.value
  if (props.type === 'FUT') {
    return selectedSegment.value === 'Commodity Futures'
      ? commodityFuturesTradingSymbol.value
      : futuresTradingSymbol.value
  }
  if (props.type === 'EQ') return equityTradingSymbol.value
  return ''
})

const symbolToken = ref('')
const ltp = ref<number | null>(null)
const averagePrice = ref<number | null>(null)

// Add pctChange ref
const pctChange = ref<number | null>(null)

// Add open interest ref
const openInterest = ref<number | null>(null)

// Add previous day open interest ref
const prevOpenInterest = ref<number | null>(null)

// Add refs for last valid values
const lastValidLtp = ref<number | null>(null)
const lastValidPctChange = ref<number | null>(null)
const lastValidOpenInterest = ref<number | null>(null)
const lastValidPrevOpenInterest = ref<number | null>(null)

// Add types for API responses
interface TokenResponse {
  token: string
  underlyingToken?: string
  tradingSymbol?: string
}

// Add error handling state
const isLoading = ref(false)
const error = ref<string | null>(null)

// Create additional refs for low and high price values.
const low = ref<number | null>(null)
const high = ref<number | null>(null)

// Add open and close price refs
const openPrice = ref<number | null>(null)
const closePrice = ref<number | null>(null)

// Add broker change handler
onMounted(() => {
  /**
   * CRITICAL: Quote Update Event Handler
   * ====================================
   * This handles real-time price updates from WebSocket connections.
   * It supports multiple broker architectures:
   *
   * - Standard format: token includes exchange prefix (e.g., "NSE|12345")
   * - Zerodha format: numeric tokens only (e.g., "12345")
   *
   * The handler updates LTP, percentage change, open interest, and other
   * market data when it receives matching token updates.
   *
   * CRITICAL: The token matching logic must handle both formats!
   * DO NOT modify without testing with all supported brokers!
   */
  const handleQuoteUpdate = ((event: CustomEvent) => {
    const {
      token,
      ltp: newLtp,
      open: newOpen,
      close: newClose,
      low: newLow,
      high: newHigh,
      pct_change,
      averagePrice: newAvg,
      oi: newOi,
      poi: newPrevOi,
    } = event.detail

    // Check for Zerodha token format (numeric only without exchange prefix)
    const isZerodhaToken = !symbolToken.value.includes('|') && !token.includes('|')

    // For Zerodha, we'll match numeric tokens, otherwise use exact match
    const tokenMatches = isZerodhaToken ? symbolToken.value === token : token === symbolToken.value

    if (tokenMatches) {
      isLoading.value = false
      if (newLtp !== null && newLtp !== undefined && Number(newLtp) !== 0 && !isNaN(Number(newLtp))) {
        ltp.value = Number(newLtp)
        lastValidLtp.value = Number(newLtp) // Store valid value
      } else {
        // Use last valid value if new value is invalid
        ltp.value = lastValidLtp.value
      }
      if (newOpen !== undefined && newOpen !== null) {
        openPrice.value = Number(newOpen)
      }
      if (newClose !== undefined && newClose !== null) {
        closePrice.value = Number(newClose)
      }
      if (newLow !== undefined && newLow !== null) {
        low.value = Number(newLow)
      }
      if (newHigh !== undefined && newHigh !== null) {
        high.value = Number(newHigh)
      }
      if (pct_change !== undefined && pct_change !== null && !isNaN(Number(pct_change))) {
        pctChange.value = Number(pct_change)
        lastValidPctChange.value = Number(pct_change) // Store valid value
      } else {
        // Use last valid percentage change if new value is invalid
        pctChange.value = lastValidPctChange.value
      }
      if (newAvg !== undefined && newAvg !== null && Number(newAvg) !== 0) {
        averagePrice.value = Number(newAvg)
      }
      if (newOi !== undefined && newOi !== null && !isNaN(Number(newOi))) {
        openInterest.value = Number(newOi)
        lastValidOpenInterest.value = Number(newOi) // Store valid value
      } else {
        // Use last valid open interest if new value is invalid
        openInterest.value = lastValidOpenInterest.value
      }
      if (newPrevOi !== undefined && newPrevOi !== null && !isNaN(Number(newPrevOi))) {
        prevOpenInterest.value = Number(newPrevOi)
        lastValidPrevOpenInterest.value = Number(newPrevOi) // Store valid value
      } else {
        // Use last valid previous OI if new value is invalid
        prevOpenInterest.value = lastValidPrevOpenInterest.value
      }
    }
  }) as EventListener

  const handleBrokerChange = async () => {
    // Re-subscribe to current symbol if one is selected
    if (symbolToken.value) {
      await handleWebSocketOperation('subscribe', symbolToken.value)
    }
  }

  window.addEventListener('quote-update', handleQuoteUpdate)
  window.addEventListener('broker-changed', handleBrokerChange)

  /**
   * CRITICAL: Component Cleanup on Unmount
   * ======================================
   * This cleanup is essential to prevent memory leaks and ensure proper
   * WebSocket disconnection when the component is destroyed.
   *
   * The cleanup order is important:
   * 1. Unsubscribe from current symbol token
   * 2. Remove global event listeners
   * 3. Perform any additional cleanup
   *
   * DO NOT modify the cleanup order or remove any cleanup steps!
   */
  onUnmounted(() => {
    // Unsubscribe from current symbol if exists
    if (symbolToken.value) {
      handleWebSocketOperation('unsubscribe', symbolToken.value)
    }

    // Remove event listeners
    window.removeEventListener('quote-update', handleQuoteUpdate)
    window.removeEventListener('broker-changed', handleBrokerChange)
  })
})

// Add retry logic for WebSocket operations
const handleWebSocketOperation = async (
  operation: 'subscribe' | 'unsubscribe',
  token: string,
  retries = 3,
) => {
  const handler = operation === 'subscribe' ? subscribe : unsubscribe

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await handler([{ exchange: getExchange(), token }])
      return
    } catch (err) {
      console.error(`${operation} attempt ${attempt} failed:`, err)
      if (attempt === retries) {
        error.value = `Failed to ${operation} after ${retries} attempts`
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

// Improved token watch with error handling
watch(symbolToken, async (newToken, oldToken) => {
  error.value = null
  ltp.value = null
  pctChange.value = null // Reset percentage change
  isLoading.value = true

  try {
    if (oldToken) {
      await handleWebSocketOperation('unsubscribe', oldToken)
    }

    if (newToken) {
      await handleWebSocketOperation('subscribe', newToken)
    }
  } finally {
    setTimeout(() => {
      isLoading.value = false
    }, 300)
  }
})

// (Moved equity watcher below fetchToken definition to avoid
// "can't access lexical declaration before initialization" errors.)

// Helper to determine exchange based on segment and type
const getExchange = () => {
  return getExchangeByInstrumentType(selectedExchange.value, props.type)
}

// Get strikes based on option type - memoized to prevent dropdown flicker on LTP updates
// Without memoization, every component re-render (caused by LTP updates) would return a new array reference,
// causing Vue to re-render all <option> elements even though the values haven't changed
const cachedStrikes = shallowRef<number[]>([])
const lastStrikesKey = ref('')

const strikesSource = computed<number[]>(() => {
  if (props.type === 'CALL') return strikeData.value.CE || []
  if (props.type === 'PUT') return strikeData.value.PE || []
  return []
})

watch(
  strikesSource,
  (strikes) => {
    const strikesKey = strikes.join(',')
    if (strikesKey !== lastStrikesKey.value) {
      lastStrikesKey.value = strikesKey
      cachedStrikes.value = strikes
    }
  },
  { immediate: true },
)

const availableStrikes = computed(() => cachedStrikes.value)

/**
 * Computed properties for conditional rendering
 * Controls the display of different instrument selection interfaces
 */
const showStrikeSelection = computed(() => props.type === 'CALL' || props.type === 'PUT')
const showSymbolOnly = computed(() => props.type === 'EQ')

// Add a flag to track if initial strike selection has been made
const hasInitialStrikeSelection = ref(false)

// Watch for symbol/expiry/strikeData changes to reset selection
// NOTE: underlyingLtp is intentionally NOT in this watcher to prevent dropdown flicker on every LTP tick
watch(
  [selectedSymbol, selectedExpiry, () => strikeData.value],
  async ([symbol, expiry, currentStrikeData], [oldSymbol, oldExpiry, oldStrikeData]) => {
    // Clear commodity futures symbols when switching to options
    if (selectedSegment.value === 'Commodity Options') {
      commodityFuturesTradingSymbol.value = ''
    }

    if (
      symbol !== oldSymbol ||
      expiry !== oldExpiry ||
      JSON.stringify(currentStrikeData) !== JSON.stringify(oldStrikeData)
    ) {
      resetSelection()
      hasInitialStrikeSelection.value = false
    }

    // Attempt initial strike selection if LTP is already available
    if (
      !hasInitialStrikeSelection.value &&
      symbol &&
      expiry &&
      currentStrikeData &&
      Object.keys(currentStrikeData).length > 0 &&
      underlyingLtp.value
    ) {
      await nextTick()
      selectStrikeWithOffset(underlyingLtp.value, availableStrikes.value)
      hasInitialStrikeSelection.value = true
    }
  },
  { immediate: true },
)

// Separate watcher for initial LTP availability - only runs once when LTP first becomes available
// This ensures initial strike selection happens even if LTP arrives after strikeData
watch(
  underlyingLtp,
  async (ltp) => {
    if (
      !hasInitialStrikeSelection.value &&
      ltp &&
      selectedSymbol.value &&
      selectedExpiry.value &&
      strikeData.value &&
      Object.keys(strikeData.value).length > 0
    ) {
      await nextTick()
      selectStrikeWithOffset(ltp, availableStrikes.value)
      hasInitialStrikeSelection.value = true
    }
  },
  { immediate: true },
)

// Update computed property for margin calculation
const marginRequired = computed(() => {
  if (!ltp.value || !tradeFormData.totalQuantity.value) return null

  // Return "Unlimited" for futures segments
  if (
    tradeFormData.selectedSegment.value === 'Index Futures' ||
    tradeFormData.selectedSegment.value === 'Stocks Futures' ||
    tradeFormData.selectedSegment.value === 'Commodity Futures'
  ) {
    return 'Unlimited'
  }

  // For other segments, return total value
  const totalValue = ltp.value * tradeFormData.totalQuantity.value
  return totalValue.toFixed(2)
})

// Get the parent's LTP refs
const callInstrumentLtp = inject('callInstrumentLtp') as Ref<number | null>
const putInstrumentLtp = inject('putInstrumentLtp') as Ref<number | null>
const futuresInstrumentLtp = inject('futuresInstrumentLtp') as Ref<number | null>
const equityInstrumentLtp = inject('equityInstrumentLtp') as Ref<number | null>

// Get the parent's token refs (for trade)
const callInstrumentSymbolToken = inject('callInstrumentSymbolToken', ref('')) as Ref<string>
const putInstrumentSymbolToken = inject('putInstrumentSymbolToken', ref('')) as Ref<string>
const futuresInstrumentSymbolToken = inject('futuresInstrumentSymbolToken', ref('')) as Ref<string>
const equityInstrumentSymbolToken = inject('equityInstrumentSymbolToken', ref('')) as Ref<string>

// Watch for LTP changes and update the corresponding parent ref
watch(ltp, (newLtp) => {
  if (props.type === 'CALL') {
    callInstrumentLtp.value = newLtp
  } else if (props.type === 'PUT') {
    putInstrumentLtp.value = newLtp
  } else if (props.type === 'FUT') {
    futuresInstrumentLtp.value = newLtp
  } else if (props.type === 'EQ') {
    equityInstrumentLtp.value = newLtp
  }
})

// Watch for token changes and update the corresponding parent ref (for trade)
watch(symbolToken, (newToken) => {
  console.log('[TradingInstrument] symbolToken changed:', {
    type: props.type,
    newToken,
    callRef: callInstrumentSymbolToken.value,
    putRef: putInstrumentSymbolToken.value,
    futRef: futuresInstrumentSymbolToken.value,
    eqRef: equityInstrumentSymbolToken.value,
  })

  if (props.type === 'CALL') {
    callInstrumentSymbolToken.value = newToken
  } else if (props.type === 'PUT') {
    putInstrumentSymbolToken.value = newToken
  } else if (props.type === 'FUT') {
    futuresInstrumentSymbolToken.value = newToken
  } else if (props.type === 'EQ') {
    equityInstrumentSymbolToken.value = newToken
  }

  console.log('[TradingInstrument] After update:', {
    callRef: callInstrumentSymbolToken.value,
    putRef: putInstrumentSymbolToken.value,
    futRef: futuresInstrumentSymbolToken.value,
    eqRef: equityInstrumentSymbolToken.value,
  })
})

// Clear the LTP when component is unmounted
onUnmounted(() => {
  if (props.type === 'CALL') {
    callInstrumentLtp.value = null
  } else if (props.type === 'PUT') {
    putInstrumentLtp.value = null
  } else if (props.type === 'FUT') {
    futuresInstrumentLtp.value = null
  } else if (props.type === 'EQ') {
    equityInstrumentLtp.value = null
  }
})

// Provide the LTP value based on instrument type
if (props.type === 'CALL') {
  provide('callInstrumentLtp', ltp)
} else if (props.type === 'PUT') {
  provide('putInstrumentLtp', ltp)
} else if (props.type === 'FUT') {
  provide('futuresInstrumentLtp', ltp)
} else if (props.type === 'EQ') {
  provide('equityInstrumentLtp', ltp)
}

// Fix the isInstrumentSelected computed property
const isInstrumentSelected = computed(() => {
  if (showStrikeSelection.value) {
    return Boolean(selectedStrike.value)
  }
  return Boolean(selectedSymbol.value)
})

// Add mouse scroll handling
useMouseScroll({
  targetSelector: `.strike-select-${props.type.toLowerCase()}`,
  currentValue: selectedStrike,
  values: availableStrikes,
})

// Update the isDevelopment computed property
const isDevelopment = computed(() => {
  const isLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocalhost
})



// Add computed properties for offsets
const callStrikeOffset = computed(() => localStorage.getItem(STORAGE_KEYS.CALL_STRIKE_OFFSET) || 'ATM 0')
const putStrikeOffset = computed(() => localStorage.getItem(STORAGE_KEYS.PUT_STRIKE_OFFSET) || 'ATM 0')

// Quick strike offset options for buttons
const strikeOffsetOptions = computed(() => {
  // For CALL: ITM = lower strike (negative offset), OTM = higher strike (positive offset)
  // For PUT: ITM = higher strike (positive offset), OTM = lower strike (negative offset)
  if (props.type === 'CALL') {
    return [
      { label: 'ITM', offset: -1, value: 'ATM -1 (ITM)' },
      { label: 'ATM', offset: 0, value: 'ATM 0' },
      { label: 'OTM', offset: 1, value: 'ATM +1 (OTM)' },
    ]
  } else {
    // PUT options - ITM is above ATM, OTM is below ATM
    return [
      { label: 'ITM', offset: 1, value: 'ATM +1 (ITM)' },
      { label: 'ATM', offset: 0, value: 'ATM 0' },
      { label: 'OTM', offset: -1, value: 'ATM -1 (OTM)' },
    ]
  }
})

// Get the current offset to highlight the active button
const currentOffsetValue = computed(() => {
  return props.type === 'CALL' ? callStrikeOffset.value : putStrikeOffset.value
})

// Quick select strike with offset and save to Firestore
const quickSelectStrike = (offset: number, offsetValue: string) => {
  if (!underlyingLtp.value || !availableStrikes.value.length) return

  // Get ATM index
  const sortedStrikes = [...availableStrikes.value].sort((a, b) => a - b)
  let atmIndex = 0
  let minDiff = Infinity

  for (let i = 0; i < sortedStrikes.length; i++) {
    const diff = Math.abs(sortedStrikes[i] - underlyingLtp.value)
    if (diff < minDiff) {
      minDiff = diff
      atmIndex = i
    }
  }

  // Apply offset
  const targetIndex = Math.max(0, Math.min(sortedStrikes.length - 1, atmIndex + offset))
  selectedStrike.value = sortedStrikes[targetIndex].toString()

  if (props.type === 'CALL') {
    localStorage.setItem(STORAGE_KEYS.CALL_STRIKE_OFFSET, offsetValue)
  } else if (props.type === 'PUT') {
    localStorage.setItem(STORAGE_KEYS.PUT_STRIKE_OFFSET, offsetValue)
  }
}

// Helper function to get offset value from string
const getOffsetValue = (offsetString: string): number => {
  if (offsetString === 'ATM 0') return 0

  const match = offsetString.match(/ATM ([+-]\d+)/)
  if (match && match[1]) {
    return parseInt(match[1], 10)
  }
  return 0
}

// Helper function to apply strike offset
const applyStrikeOffset = (strikes: number[], atmIndex: number, offset: number): number => {
  const targetIndex = atmIndex + offset

  // Ensure the index is within bounds
  if (targetIndex >= 0 && targetIndex < strikes.length) {
    return strikes[targetIndex]
  }

  // If out of bounds, return the closest valid strike
  return offset > 0
    ? strikes[strikes.length - 1] // Highest strike if offset is too high
    : strikes[0] // Lowest strike if offset is too low
}

// Modify the selectNearestStrike function to apply offsets
const selectStrikeWithOffset = (ltp: number, availableStrikes: number[]) => {
  if (!availableStrikes.length) {
    error.value = 'No strikes available'
    return
  }

  try {
    // First find the ATM strike index (closest to LTP)
    const sortedStrikes = [...availableStrikes].sort((a, b) => a - b)
    let atmIndex = 0
    let minDiff = Infinity

    for (let i = 0; i < sortedStrikes.length; i++) {
      const diff = Math.abs(sortedStrikes[i] - ltp)
      if (diff < minDiff) {
        minDiff = diff
        atmIndex = i
      }
    }

    // Get the offset value based on instrument type
    const offsetString = props.type === 'CALL' ? callStrikeOffset.value : putStrikeOffset.value
    const offset = getOffsetValue(offsetString)

    // Apply the offset
    const selectedStrikeValue = applyStrikeOffset(sortedStrikes, atmIndex, offset)
    selectedStrike.value = selectedStrikeValue.toString()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Strike selection failed'
    console.error('[TradingInstrument] Error selecting strike:', {
      error: err,
      ltp,
      availableStrikes,
    })
  }
}

// Update fetchToken to handle all instrument types
const fetchToken = async (
  url: string,
  config?: { params?: Record<string, string> },
): Promise<string> => {
  isLoading.value = true
  error.value = null

  try {
    // Get the broker architecture from localStorage
    const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

    // Add the api-architecture to params if config exists
    if (config?.params) {
      config.params['api-architecture'] = brokerArchitecture
    }

    const response = await api.get(`${import.meta.env.VITE_API_URL}${url}`, config)
    const data: TokenResponse = response.data

    // Update the appropriate trading symbol based on instrument type
    if (data.tradingSymbol) {
      if (props.symbolType === 'call') {
        callTradingSymbol.value = data.tradingSymbol
      } else if (props.symbolType === 'put') {
        putTradingSymbol.value = data.tradingSymbol
      } else if (props.symbolType === 'commodity-fut') {
        commodityFuturesTradingSymbol.value = data.tradingSymbol
      } else if (props.type === 'FUT') {
        futuresTradingSymbol.value = data.tradingSymbol
      } else if (props.type === 'EQ') {
        equityTradingSymbol.value = data.tradingSymbol
      }
    }

    // Debug the trading symbol
    console.log(`[TradingInstrument] Fetched tradingSymbol for ${props.type}:`, data.tradingSymbol)

    return data.token || ''
  } catch (err) {
    console.error('[TradingInstrument] Token fetch error:', err, config)
    error.value = 'Failed to fetch token'
    return ''
  } finally {
    isLoading.value = false
  }
}

// Equity token fetch: react to symbol, segment, and exchange changes
// Place after fetchToken definition to avoid lexical initialization errors.
watch(
  [selectedSymbol, selectedSegment, selectedExchange],
  async ([symbol, segment]) => {
    if (props.type === 'EQ' && symbol && segment === 'Stocks Equity') {
      try {
        const brokerArchitecture =
          localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

        const params = {
          exchange: selectedExchange.value,
          segment,
          symbol,
          'api-architecture': brokerArchitecture,
        }
        symbolToken.value = await fetchToken('/instruments', { params })
      } catch (error) {
        console.error('Error fetching equity token:', error)
        symbolToken.value = ''
      }
    }
  },
  { immediate: true },
)

// Define types for the debounced function parameters
interface StrikeSelectionParams {
  strike: string
  symbol: string
  expiry: string
}

// Create a properly typed debounced function
const debouncedStrikeSelection = useDebounceFn(
  async ({ strike, symbol, expiry }: StrikeSelectionParams) => {
    if (!symbol || !expiry) return

    // Get the broker architecture from localStorage
    const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

    const segment = selectedSegment.value
    const params: Record<string, string> = {
      exchange: selectedExchange.value,
      segment,
      symbol,
      expiry,
      'api-architecture': brokerArchitecture,
    }

    try {
      // Fetch token for futures without strike
      if (props.type === 'FUT') {
        if (segment === 'Commodity Futures') {
          params.symbolType = 'commodity-fut'
        }

        console.log('[TradingInstrument] Fetching futures instrument with params:', params)
        symbolToken.value = await fetchToken('/instruments', { params })
      } else if (strike) {
        const optionType = props.type === 'CALL' ? 'CE' : 'PE'
        params.strikePrice = strike
        params.optionType = optionType
        symbolToken.value = await fetchToken('/instruments', { params })
      }
    } catch (error) {
      console.error('[TradingInstrument] Error in debouncedStrikeSelection:', error)
      symbolToken.value = ''
    }
  },
  300,
)

// Then use the watch
watch([selectedStrike, selectedSymbol, selectedExpiry], ([strike, symbol, expiry]) => {
  debouncedStrikeSelection({ strike, symbol, expiry })
})
</script>

<template>
  <div class="row mt-2">
    <!-- Quick Strike Selection Pills for Options -->
    <div v-if="showStrikeSelection" class="col-12 mb-3">
      <div class="d-flex gap-1" :class="type === 'PUT' ? 'justify-content-end' : 'justify-content-start'">
        <span v-for="option in strikeOffsetOptions" :key="option.label" class="badge rounded-pill"
          :class="currentOffsetValue === option.value ? 'bg-warning text-dark' : 'bg-light text-secondary'"
          role="button" @click="quickSelectStrike(option.offset, option.value)">
          {{ option.label }}
        </span>
      </div>
    </div>

    <div class="col-12 d-flex align-items-center justify-content-start">
      <template v-if="showStrikeSelection">
        <!-- v-memo prevents re-render on LTP updates - only re-renders when these specific values change -->
        <div v-memo="[selectedSymbol, selectedExpiry, lastStrikesKey, selectedStrike]"
          class="d-flex align-items-center flex-wrap" :style="{
            'line-height': '2',
            'justify-content': type === 'CALL' ? 'flex-start' : 'flex-end',
            width: '100%',
          }">
          <span class="me-2">{{ selectedSymbol }}</span>

          <select v-model="selectedStrike"
            :class="`form-select form-select-sm strike-select me-2 strike-select-${type.toLowerCase()}`"
            style="width: auto; min-width: 100px">
            <option value="">Strike</option>
            <option v-for="strike in availableStrikes" :key="strike" :value="strike.toString()">
              {{ strike }}
            </option>
          </select>

          <span class="me-2">{{ type }}</span>
          <p class="mb-0">{{ selectedExpiry }}</p>
        </div>
      </template>

      <!-- Futures -->
      <template v-else-if="type === 'FUT'">
        <!-- Selected Symbol -->
        <span>{{ selectedSymbol }}</span>
        <!-- Selected Expiry Date -->
        <span class="ms-2">{{ selectedExpiry }}</span>
        <!-- Instrument Type -->
        <span class="ms-2">{{ type }}</span>
      </template>

      <!-- Equity -->
      <template v-if="showSymbolOnly">
        <!-- Selected Symbol -->
        <span>{{ selectedSymbol }}</span>
        <!-- Instrument Type -->
        <span class="ms-2">{{ type }}</span>
      </template>
    </div>

    <!-- Symbol Debug Display -->
    <div class="col-12 mt-2 d-flex flex-column align-items-center" :style="{
      'justify-content': type === 'PUT' ? 'flex-end' : 'flex-start',
      'text-align': type === 'PUT' ? 'right' : 'left',
    }">
      <!-- Trading Symbol Display (only shown in development AND when developer mode is enabled) -->
      <div class="text-muted d-block w-100" v-if="isDevelopment && tradingSymbol">
        Trading Symbol: {{ tradingSymbol }}
      </div>

      <!-- Symbol Token Display (only shown in development AND when developer mode is enabled) -->
      <div class="text-muted d-block w-100" v-if="isDevelopment && symbolToken">
        Symbol Token: {{ symbolToken }}
      </div>
    </div>

    <!-- LTP, Percentage Change, and Margin Required Display -->
    <!-- Using a separate component to isolate LTP updates from the strike dropdown -->
    <InstrumentPriceDisplay :type="type" :is-instrument-selected="isInstrumentSelected" :is-loading="isLoading"
      :ltp="ltp" :pct-change="pctChange" :margin-required="marginRequired" :open-interest="openInterest"
      :prev-open-interest="prevOpenInterest" />



    <!-- Add loading and error states -->
    <div v-if="isLoading" class="text-muted">Loading...</div>
    <div v-if="error || strikeSelectionError" class="text-danger">
      {{ error || strikeSelectionError }}
    </div>
  </div>
</template>

<style>
/* You can remove all the previous styles and add any custom styling for form-select if needed */
</style>

<!--
═══════════════════════════════════════════════════════════════════════════════
UNIFIED TRADING INSTRUMENT COMPONENT - DEVELOPMENT NOTES
═══════════════════════════════════════════════════════════════════════════════

⚠️  CRITICAL REMINDERS:

1. This single component replaces ALL trading instrument components
2. It automatically detects trading mode via 'requiredAccessType' injection
3. Supports both new instrumentContext and legacy individual injections
4. Handles multiple broker architectures (standard + Zerodha tokens)
5. Self-manages WebSocket subscriptions based on detected mode

🚫 DO NOT:
- Create separate trading instrument files for different modes
- Remove the legacy injection fallback system
- Modify the context detection logic without understanding all modes
- Change the token matching logic without testing all broker types
- Skip the cleanup procedures in onUnmounted

✅ SAFE TO MODIFY:
- UI styling and layout
- Display formatting (numbers, colors, etc.)
- Additional computed properties for display
- Non-critical template elements

📋 USAGE PATTERNS:
Single/Multi Broker: <TradingInstrument type="CALL" symbol-type="call" />
Equity: <TradingInstrument type="EQ" />

═══════════════════════════════════════════════════════════════════════════════
-->
