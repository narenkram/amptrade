<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted } from 'vue'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import api from '@/modules/common/api/axios'
import { useMouseScroll } from '@/modules/private/shared/composables/useMouseScroll'
import {
  DEFAULT_RUPEES_SL,
  DEFAULT_RUPEES_TARGET,
  getDefaultStopLoss,
  getDefaultTarget,
} from '@/modules/private/shared/composables/useStoplossTarget'

// Define props and emits
const props = defineProps<{
  disabled?: boolean
  symbol: string
  expiry: string
  strikeData: { CE: number[]; PE: number[] }
  underlyingToken: string | null
  segment: string
  underlyingLtp: number | null
  lotSize: number
  productType: string
  orderType: string
  exchange: string
  quantity: number
  shortcutsEnabled: boolean
  positionFilter: string
  defaultStopLoss?: number
  defaultTarget?: number
}>()

const emit = defineEmits<{
  'update:symbol': [value: string]
  'update:expiry': [value: string]
  'update:strikeData': [value: { CE: number[]; PE: number[] }]
  'update:underlyingToken': [value: string | null]
  'update:segment': [value: string]
  'update:lotSize': [value: number]
  'update:productType': [value: string]
  'update:orderType': [value: string]
  'update:exchange': [value: string]
  'update:totalQuantity': [value: number]
  'update:quantity': [value: number]
  'update:shortcutsEnabled': [value: boolean]
  'update:positionFilter': [value: string]
  'update:defaultStopLoss': [value: number]
  'update:defaultTarget': [value: number]
}>()

// Static values
const productTypes = ['Carry Forward', 'Intraday']
const orderTypes = ['Market', 'Limit', 'Limit at LTP', 'Market Protection']


// Unified search types and state
type SearchItem = {
  symbol: string
  segment: string
  exchange: string
  displayLabel: string
  lotSize?: number
}
const symbolSearchIndex = ref<SearchItem[]>([])
const searchQuery = ref('')
const isBuildingIndex = ref(false)
// Guard to skip resets when we programmatically set exchange/segment via search selection
const skipResetOnFilterChange = ref(false)
// Controls dropdown visibility for search results
const isSearchDropdownOpen = ref(false)

// LocalStorage keys centralized in STORAGE_KEYS

// Add new reactive references
const selectedSegment = computed({
  get: () => props.segment || localStorage.getItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT) || '',
  set: (value: string) => {
    emit('update:segment', value)
    if (value) {
      localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT, value)
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT)
    }
  },
})
const masterSymbols = ref<string[]>([])
const expiryDates = ref<string[]>([])
const currentLotSize = ref(1)
const symbolLotSizes = ref<Record<string, number>>({})

// Update this computed property to enable expiry for commodity segments
const showExpiryField = computed(
  () => selectedSegment.value !== 'Stocks Equity' && selectedSegment.value !== '',
)

// Add computed properties to sync with props
const selectedSymbol = computed({
  get: () => props.symbol || localStorage.getItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL) || '',
  set: (value: string) => {
    emit('update:symbol', value)
    if (value) {
      localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL, value)
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL)
    }
  },
})

const selectedExpiry = computed({
  get: () => props.expiry,
  set: (value: string) => emit('update:expiry', value),
})

// Add this computed property before the template
const filteredAndSortedExpiryDates = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return expiryDates.value
    .filter((date) => {
      const expiryDate = new Date(date.split('-').reverse().join('-')) // Convert DD-MMM-YYYY to Date
      return expiryDate >= today
    })
    .sort((a, b) => {
      const dateA = new Date(a.split('-').reverse().join('-'))
      const dateB = new Date(b.split('-').reverse().join('-'))
      return dateA.getTime() - dateB.getTime()
    })
})

// Add computed properties to sync with props
const selectedExchange = computed({
  get: () => props.exchange || localStorage.getItem(STORAGE_KEYS.TRADE_SELECTED_EXCHANGE) || 'NSE',
  set: (value: string) => {
    emit('update:exchange', value)
    if (value) {
      localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_EXCHANGE, value)
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRADE_SELECTED_EXCHANGE)
    }
  },
})

// Add new loading state
const isLoadingSymbols = ref(false)

// Update the loadMasterSymbols function to handle loading state
const loadMasterSymbols = async (exchange: string, segment: string) => {
  if (exchange && segment) {
    isLoadingSymbols.value = true

    // Get the broker architecture from localStorage
    const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

    try {
      const response = await api.get(`${import.meta.env.VITE_API_URL}/instruments`, {
        params: {
          exchange,
          segment,
          'api-architecture': brokerArchitecture,
        },
      })
      const data = response.data
      masterSymbols.value = data.symbols || data
      if (data.lotSizes) {
        symbolLotSizes.value = data.lotSizes
      }
    } catch (error) {
      console.error('Failed to fetch symbols:', error)
      masterSymbols.value = []
    } finally {
      isLoadingSymbols.value = false
    }
  } else {
    masterSymbols.value = []
  }
}

// Build unified symbol search index across exchanges/segments
const buildSymbolSearchIndex = async () => {
  isBuildingIndex.value = true
  symbolSearchIndex.value = []

  const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

  // Helper to fetch and push symbols for a given exchange/segment
  const fetchSegmentSymbols = async (exchange: string, segment: string) => {
    try {
      const response = await api.get(`${import.meta.env.VITE_API_URL}/instruments`, {
        params: {
          exchange,
          segment,
          'api-architecture': brokerArchitecture,
        },
      })
      const data = response.data
      const symbols: string[] = data.symbols || data || []
      const lotSizes: Record<string, number> | undefined = data.lotSizes

      symbols.forEach((sym) => {
        symbolSearchIndex.value.push({
          symbol: sym,
          segment,
          exchange,
          displayLabel: `${sym} • ${segment} • ${exchange}`,
          lotSize: lotSizes ? lotSizes[sym] : undefined,
        })
      })
    } catch (err) {
      console.error('Failed to build search index for', { exchange, segment }, err)
    }
  }

  // NSE segments (exclude commodity)
  const nseSegments = ['Stocks Equity', 'Stocks Futures', 'Stocks Options', 'Index Futures', 'Index Options']
  for (const seg of nseSegments) {
    await fetchSegmentSymbols('NSE', seg)
  }

  // BSE: existing UI allowed only Index Options
  await fetchSegmentSymbols('BSE', 'Index Options')

  // MCX commodity segments
  const mcxSegments = ['Commodity Futures', 'Commodity Options']
  for (const seg of mcxSegments) {
    await fetchSegmentSymbols('MCX', seg)
  }

  isBuildingIndex.value = false
}

// Computed filtered results for search query
const filteredSearchResults = computed(() => {
  const q = searchQuery.value.trim().toUpperCase()
  if (!q) return []
  // Basic prefix-first then substring match, limited to 25 results
  const startsWithMatches = symbolSearchIndex.value.filter((item) =>
    item.symbol.toUpperCase().startsWith(q),
  )
  const containsMatches = symbolSearchIndex.value.filter(
    (item) => item.symbol.toUpperCase().includes(q) && !item.symbol.toUpperCase().startsWith(q),
  )
  return [...startsWithMatches, ...containsMatches].slice(0, 25)
})

// Handle selecting a search result
const onSearchSelect = async (item: SearchItem) => {
  try {
    skipResetOnFilterChange.value = true
    selectedExchange.value = item.exchange
    selectedSegment.value = item.segment
    selectedSymbol.value = item.symbol
    searchQuery.value = item.symbol
    isSearchDropdownOpen.value = false
    await nextTick(() => {
      const el = document.getElementById('symbol-search') as HTMLInputElement | null
      el?.blur()
    })
    // Persist selections
    localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_EXCHANGE, item.exchange)
    localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT, item.segment)
    localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL, item.symbol)
    await onSymbolChange(item.symbol)
  } finally {
    // Allow normal watcher behavior after programmatic selection completes
    skipResetOnFilterChange.value = false
  }
}

// Open dropdown when input focused and results available, close on blur
const onSearchFocus = () => {
  if (searchQuery.value.trim() && filteredSearchResults.value.length > 0) {
    isSearchDropdownOpen.value = true
  }
}

const onSearchBlur = () => {
  // Delay closing to allow click/mousedown selection on dropdown items
  setTimeout(() => {
    isSearchDropdownOpen.value = false
  }, 150)
}

// Keep dropdown reactive to typing and results while input is focused
watch(searchQuery, (q) => {
  const isFocused = (document.activeElement as HTMLElement | null)?.id === 'symbol-search'
  isSearchDropdownOpen.value = !!q.trim() && filteredSearchResults.value.length > 0 && !!isFocused
})
watch(filteredSearchResults, (items) => {
  const isFocused = (document.activeElement as HTMLElement | null)?.id === 'symbol-search'
  isSearchDropdownOpen.value = !!searchQuery.value.trim() && items.length > 0 && !!isFocused
})

// Update the watch to use the new function
watch([selectedExchange, selectedSegment], async ([exchange, segment]) => {
  console.log('Exchange or segment changed:', { exchange, segment })

  // Skip resets if we are changing via unified search selection
  if (!skipResetOnFilterChange.value) {
    // Clear symbol and expiry selections first
    localStorage.removeItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL)
    emit('update:symbol', '')
    emit('update:expiry', '')
    emit('update:strikeData', { CE: [], PE: [] })
    expiryDates.value = []
  }

  // Only clear underlying token if both exchange and segment are valid
  // This prevents unnecessary token nullification during intermediate states
  if (exchange && segment) {
    // Now it's safe to nullify the token once we're ready to load new data
    emit('update:underlyingToken', null)
    await loadMasterSymbols(exchange, segment)
  }
})

// Add this to set initial values on mount
onMounted(async () => {
  // Initialize with stored values instead of defaults
  emit('update:defaultStopLoss', getDefaultStopLoss())
  emit('update:defaultTarget', getDefaultTarget())

  // Initialize exchange from localStorage
  const savedExchange = localStorage.getItem(STORAGE_KEYS.TRADE_SELECTED_EXCHANGE)
  if (savedExchange) {
    emit('update:exchange', savedExchange)
  }

  if (selectedSegment.value && selectedExchange.value) {
    // Emit the saved segment
    emit('update:segment', selectedSegment.value)

    await loadMasterSymbols(selectedExchange.value, selectedSegment.value)

    // After loading master symbols, restore saved symbol if it exists
    const savedSymbol = localStorage.getItem(STORAGE_KEYS.TRADE_SELECTED_SYMBOL)
    if (savedSymbol && masterSymbols.value.includes(savedSymbol)) {
      await onSymbolChange(savedSymbol)
    }
  }

  // Initialize product type from localStorage
  const savedProductType = localStorage.getItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE)
  if (savedProductType) {
    emit('update:productType', savedProductType)
  } else {
    // Set default value if none exists
    emit('update:productType', 'Carry Forward')
  }

  // Build the unified search index on mount
  await buildSymbolSearchIndex()
})

// Add computed property for expiry offset
const expiryOffset = computed(
  () => localStorage.getItem(STORAGE_KEYS.EXPIRY_OFFSET) || 'Current Expiry',
)

// Modify the onSymbolChange function to apply expiry offset
const onSymbolChange = async (value: string) => {
  console.log('🔄 TradeForm: onSymbolChange triggered with value:', value)
  selectedSymbol.value = value
  await nextTick(async () => {
    emit('update:expiry', '')
    emit('update:strikeData', { CE: [], PE: [] })
  })

  if (!value) {
    console.log('❌ TradeForm: No symbol value, returning')
    return
  }

  // Get the broker architecture from localStorage
  const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

  if (
    value &&
    selectedExchange.value &&
    (selectedSegment.value === 'Index Options' ||
      selectedSegment.value === 'Stocks Options' ||
      selectedSegment.value === 'Index Futures' ||
      selectedSegment.value === 'Stocks Futures' ||
      selectedSegment.value === 'Commodity Futures' ||
      selectedSegment.value === 'Commodity Options')
  ) {
    console.log('📡 TradeForm: Fetching instrument data with params:', {
      exchange: selectedExchange.value,
      segment: selectedSegment.value,
      symbol: value,
      apiArchitecture: brokerArchitecture,
    })

    try {
      const response = await api.get(`${import.meta.env.VITE_API_URL}/instruments`, {
        params: {
          exchange: selectedExchange.value,
          segment: selectedSegment.value,
          symbol: value,
          'api-architecture': brokerArchitecture,
        },
      })
      const data = response.data
      console.log('✅ TradeForm: Received instrument data:', data)
      expiryDates.value = data.expiryDates

      // Apply expiry offset based on user settings
      if (filteredAndSortedExpiryDates.value.length > 0) {
        const offsetValue = getExpiryOffsetValue(expiryOffset.value)
        const targetIndex = Math.min(offsetValue, filteredAndSortedExpiryDates.value.length - 1)

        console.log(
          '📅 TradeForm: Selecting expiry with offset:',
          expiryOffset.value,
          filteredAndSortedExpiryDates.value[targetIndex],
        )
        onExpiryChange(filteredAndSortedExpiryDates.value[targetIndex])
      }

      // Set lot size for futures and equity
      if (data.lotSize) {
        console.log('📊 TradeForm: Setting lot size:', data.lotSize)
        emit('update:lotSize', data.lotSize)
        currentLotSize.value = data.lotSize
      }

      // Only update underlyingToken if it changed - prevent unnecessary unsubscribes
      if (data.underlyingToken !== props.underlyingToken) {
        // Set underlyingToken for Commodity Futures if available
        if (selectedSegment.value === 'Commodity Futures' && data.underlyingToken) {
          console.log(
            '🎯 TradeForm: Emitting underlying token for Commodity Futures:',
            data.underlyingToken,
          )
          emit('update:underlyingToken', data.underlyingToken)
        } else if (
          data.underlyingToken &&
          selectedSegment.value !== 'Index Futures' &&
          selectedSegment.value !== 'Stocks Futures'
        ) {
          console.log('🎯 TradeForm: Emitting underlying token and exchange:', {
            token: data.underlyingToken,
            exchange: selectedExchange.value,
          })
          emit('update:underlyingToken', data.underlyingToken)
          emit('update:exchange', selectedExchange.value)
        }
      } else {
        console.log('🔄 TradeForm: Underlying token unchanged, skipping update')
      }
    } catch (error) {
      console.error('❌ TradeForm: Failed to fetch instrument data:', error)
      expiryDates.value = []
      if (selectedSegment.value !== 'Index Futures' && selectedSegment.value !== 'Stocks Futures') {
        emit('update:underlyingToken', null)
      }
    }
  }
}

// Helper function to get expiry offset value
const getExpiryOffsetValue = (offsetString: string): number => {
  if (offsetString === 'Current Expiry') return 0

  const match = offsetString.match(/\+(\d+)/)
  if (match && match[1]) {
    return parseInt(match[1], 10)
  }
  return 0
}

// Watch for changes in expiry
const onExpiryChange = async (value: string) => {
  selectedExpiry.value = value
  await nextTick(async () => {
    emit('update:strikeData', { CE: [], PE: [] })
  })

  if (!value) return

  // Get the broker architecture from localStorage
  const brokerArchitecture = localStorage.getItem('steadfast:broker:architecture') || 'noren-api'

  if (
    props.symbol &&
    value &&
    selectedExchange.value &&
    (selectedSegment.value === 'Index Options' ||
      selectedSegment.value === 'Stocks Options' ||
      selectedSegment.value === 'Index Futures' ||
      selectedSegment.value === 'Stocks Futures' ||
      selectedSegment.value === 'Commodity Futures' ||
      selectedSegment.value === 'Commodity Options')
  ) {
    try {
      const response = await api.get(`${import.meta.env.VITE_API_URL}/instruments`, {
        params: {
          exchange: selectedExchange.value,
          segment: selectedSegment.value,
          symbol: props.symbol,
          expiry: value,
          'api-architecture': brokerArchitecture,
        },
      })
      const data = response.data

      // Handle futures data
      if (selectedSegment.value === 'Index Futures' || selectedSegment.value === 'Stocks Futures') {
        if (data.lotSize) {
          currentLotSize.value = data.lotSize
          emit('update:lotSize', data.lotSize)
        }
      }
      // Handle options data
      else {
        emit('update:strikeData', data)
        if (data.lotSize) {
          currentLotSize.value = data.lotSize
          emit('update:lotSize', data.lotSize)
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      emit('update:strikeData', { CE: [], PE: [] })

      // Reset both local ref and emit default values
      currentLotSize.value = 1
      emit('update:lotSize', 1)
    }
  }
}

// Add a computed property for quantity with proper number conversion
const quantity = computed({
  get: () => props.quantity,
  set: (value: string | number) => emit('update:quantity', Number(value)),
})

// Compute the total quantity for non-equity segments
const totalQuantity = computed(() => {
  return selectedSegment.value === 'Stocks Equity'
    ? quantity.value
    : quantity.value * currentLotSize.value
})

// Update the computed properties to sync with props
const selectedProductType = computed({
  get: () =>
    props.productType || localStorage.getItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE) || 'Carry Forward',
  set: (value: string) => {
    emit('update:productType', value)
    if (value) {
      localStorage.setItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE, value)
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE)
    }
  },
})

const selectedOrderType = computed({
  get: () =>
    props.orderType || localStorage.getItem(STORAGE_KEYS.TRADE_ORDER_TYPE) || 'Market Protection',
  set: (value: string) => {
    emit('update:orderType', value)
    if (value) {
      localStorage.setItem(STORAGE_KEYS.TRADE_ORDER_TYPE, value)
    } else {
      localStorage.removeItem(STORAGE_KEYS.TRADE_ORDER_TYPE)
    }
  },
})

// Add a watch on totalQuantity to emit changes
watch(totalQuantity, (newValue) => {
  emit('update:totalQuantity', newValue)
})

// Update the shortcutsEnabled computed property to handle localStorage
const shortcutsEnabled = computed({
  get: () => props.shortcutsEnabled,
  set: (value: boolean) => {
    emit('update:shortcutsEnabled', value)
    localStorage.setItem(STORAGE_KEYS.TRADE_SHORTCUTS_ENABLED, value.toString())
  },
})

// Add new computed property for position filter
const selectedPositionFilter = computed({
  get: () => props.positionFilter,
  set: (value: string) => emit('update:positionFilter', value),
})

// Add a watch for selectedSegment to persist changes
watch(selectedSegment, (newSegment) => {
  if (newSegment) {
    localStorage.setItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT, newSegment)
  } else {
    localStorage.removeItem(STORAGE_KEYS.TRADE_SELECTED_SEGMENT)
  }
})

// Add this watch to persist product type changes
watch(selectedProductType, (newProductType) => {
  if (newProductType) {
    localStorage.setItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE, newProductType)
  } else {
    localStorage.removeItem(STORAGE_KEYS.TRADE_PRODUCT_TYPE)
  }
})

// Add this watch to persist order type changes
watch(selectedOrderType, (newOrderType) => {
  if (newOrderType) {
    localStorage.setItem(STORAGE_KEYS.TRADE_ORDER_TYPE, newOrderType)
  } else {
    localStorage.removeItem(STORAGE_KEYS.TRADE_ORDER_TYPE)
  }
})

// Setup mouse scroll for quantity
useMouseScroll({
  targetSelector: '#quantity_multiplier',
  currentValue: quantity,
  isNumber: true,
  min: 1,
  step: 1,
  values: [], // Not needed for number inputs
})

// Setup mouse scroll for segment selection
// Removed mouse scroll for segment and symbol selects due to unified search

// Setup mouse scroll for expiry selection
useMouseScroll({
  targetSelector: '#expiry-select',
  currentValue: selectedExpiry,
  values: filteredAndSortedExpiryDates,
  onChange: async (value) => await onExpiryChange(value.toString()),
})

// Setup mouse scroll for product type
useMouseScroll({
  targetSelector: '#product-type-select',
  currentValue: selectedProductType,
  values: productTypes,
})

// Setup mouse scroll for order type
useMouseScroll({
  targetSelector: '#order-type-select',
  currentValue: selectedOrderType,
  values: orderTypes,
})

// Initialize stoploss/target settings locally
const stopLossEnabled = ref(false)
const targetEnabled = ref(false)

// Sync stoploss/target enabled state locally
watch(stopLossEnabled, (value) => {
  if (!value) {
    defaultStopLoss.value = 0
  } else {
    defaultStopLoss.value = DEFAULT_RUPEES_SL
  }
})

watch(targetEnabled, (value) => {
  if (!value) {
    defaultTarget.value = 0
  } else {
    defaultTarget.value = DEFAULT_RUPEES_TARGET
  }
})

// Update the defaultStopLoss and defaultTarget computed properties
const defaultStopLoss = computed({
  get: () => {
    if (!stopLossEnabled.value) return 0
    return props.defaultStopLoss ?? getDefaultStopLoss() ?? DEFAULT_RUPEES_SL
  },
  set: async (value: number) => {
    if (stopLossEnabled.value) {
      emit('update:defaultStopLoss', value)
    }
  },
})

const defaultTarget = computed({
  get: () => {
    if (!targetEnabled.value) return 0
    return props.defaultTarget ?? getDefaultTarget() ?? DEFAULT_RUPEES_TARGET
  },
  set: async (value: number) => {
    if (targetEnabled.value) {
      emit('update:defaultTarget', value)
    }
  },
})

// Setup mouse scroll for default stoploss
useMouseScroll({
  targetSelector: '#default-stoploss',
  currentValue: defaultStopLoss,
  isNumber: true,
  min: 0.5,
  step: 1,
  values: [], // Not needed for number inputs
})

// Setup mouse scroll for default target
useMouseScroll({
  targetSelector: '#default-target',
  currentValue: defaultTarget,
  isNumber: true,
  min: 0.5,
  step: 1,
  values: [], // Not needed for number inputs
})



// Add a watch for exchange changes
watch(selectedExchange, () => {
  // Reset segment when exchange changes (unless we set via search)
  if (skipResetOnFilterChange.value) return
  selectedSegment.value = ''
})
</script>

<template>
  <fieldset :disabled="props.disabled">
    <div class="row g-3 mt-2">
      <!-- Symbol Search -->
      <div class="col-12 col-md-6 col-lg-4">
        <label class="form-label">Symbol</label>
        <div class="dropdown">
          <input id="symbol-search" type="text" class="form-control form-control-sm" v-model="searchQuery"
            :placeholder="isBuildingIndex ? 'Building index...' : 'Search symbol (equity, futures, options)'"
            :disabled="isBuildingIndex" @focus="onSearchFocus" @blur="onSearchBlur" />
          <ul v-if="isSearchDropdownOpen && filteredSearchResults.length > 0" class="dropdown-menu show w-100">
            <li v-for="item in filteredSearchResults" :key="item.displayLabel">
              <button type="button" class="dropdown-item py-1" @mousedown.prevent="onSearchSelect(item)">
                {{ item.displayLabel }}
              </button>
            </li>
          </ul>
          <ul v-else-if="isSearchDropdownOpen && searchQuery && !isBuildingIndex && filteredSearchResults.length === 0"
            class="dropdown-menu show w-100">
            <li>
              <span class="dropdown-item disabled">No matches found</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Expiry Date Selection -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Expiry Date</label>
        <select id="expiry-select" :key="'expiry-' + selectedSymbol" v-model="selectedExpiry"
          @change="(e: Event) => onExpiryChange((e.target as HTMLSelectElement).value)"
          class="form-select form-select-sm" :disabled="!showExpiryField">
          <option value="" disabled selected>Select Expiry</option>
          <option v-for="date in filteredAndSortedExpiryDates" :key="date">
            {{ date }}
          </option>
        </select>
      </div>

      <!-- Product Type Selection -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Product Type</label>
        <select id="product-type-select" v-model="selectedProductType" class="form-select form-select-sm">
          <option value="" disabled selected>Select Product Type</option>
          <option v-for="type in productTypes" :key="type">{{ type }}</option>
        </select>
      </div>

      <!-- Lot / Quantity Selection -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">
          {{ selectedSegment === 'Stocks Equity' ? 'Quantity' : `Lot / Quantity` }}
        </label>
        <div class="input-group input-group-sm">
          <!-- This is the quantity multiplier, which is the quantity that the user inputs, which is multiplied by the lot size to get the total quantity -->
          <input id="quantity_multiplier" type="number" class="form-control form-control-sm" v-model="quantity" min="1"
            :step="1" />
          <!-- This is the actual quantity from the data, Also called lot size -->
          <span id="actual_quantity_from_the_data" class="input-group-text" v-if="selectedSegment !== 'Stocks Equity'">
            {{ totalQuantity }}
          </span>
        </div>
      </div>

      <!-- Order Type Selection -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Order Type</label>
        <select id="order-type-select" v-model="selectedOrderType" class="form-select form-select-sm">
          <option value="" disabled selected>Select Order Type</option>
          <option v-for="type in orderTypes" :key="type">{{ type }}</option>
        </select>
      </div>

      <!-- Show Positions Types Selection -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Show Positions</label>
        <select v-model="selectedPositionFilter" class="form-select form-select-sm">
          <option value="" disabled selected>Select Show Positions</option>
          <option value="ALL">All</option>
          <option value="FNO">Futures & Options</option>
          <option value="EQUITY">Equity</option>
        </select>
      </div>

      <!-- Default Stoploss -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Stoploss</label>
        <div class="input-group input-group-sm">
          <div class="input-group-text">
            <input type="checkbox" class="form-check-input mt-0" v-model="stopLossEnabled" aria-label="Enable Stoploss"
              :checked="stopLossEnabled" :class="{ 'bg-danger border-danger': stopLossEnabled }" />
          </div>
          <input id="default-stoploss" type="number" class="form-control form-control-sm" v-model="defaultStopLoss"
            min="0" step="0.05" :disabled="!stopLossEnabled" />
          <span class="input-group-text">₹</span>
        </div>
      </div>

      <!-- Default Target -->
      <div class="col-6 col-md-4 col-lg-2">
        <label class="form-label">Target</label>
        <div class="input-group input-group-sm">
          <div class="input-group-text">
            <input type="checkbox" class="form-check-input mt-0" v-model="targetEnabled" aria-label="Enable Target"
              :checked="targetEnabled" :class="{ 'bg-success border-success': targetEnabled }" />
          </div>
          <input id="default-target" type="number" class="form-control form-control-sm" v-model="defaultTarget" min="0"
            step="0.05" :disabled="!targetEnabled" />
          <span class="input-group-text">₹</span>
        </div>
      </div>

      <!-- Shortcut Keys Selection -->
      <div class="col-6 col-md-4 col-lg-2 d-none d-md-block">
        <label class="form-label">Shortcut Keys</label>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" v-model="shortcutsEnabled" />
          <label class="form-check-label">{{ shortcutsEnabled ? 'Enabled' : 'Disabled' }}</label>
        </div>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.form-label {
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}
</style>
