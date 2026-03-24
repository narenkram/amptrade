<script setup lang="ts">
// Vue core
import { ref, onMounted, onUnmounted, provide, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'

// Components
import MultiBrokerSelector from '@/modules/private/multibrokertrade/components/MultiBrokerSelector.vue'
import TradeForm from '@/modules/private/shared/components/TradeForm.vue'
import TradeMtm from '@/modules/private/shared/components/TradeMtm.vue'
import TradingInstrument from '@/modules/private/shared/components/TradingInstrument.vue'
import UnderlyingInstrument from '@/modules/private/shared/components/UnderlyingInstrument.vue'
import TradeActions from '@/modules/private/shared/components/TradeActions.vue'
import MultiBrokerPositions from '@/modules/private/multibrokertrade/components/MultiBrokerPositions.vue'
import MultiBrokerOrderBook from '@/modules/private/multibrokertrade/components/MultiBrokerOrderBook.vue'
import MultiBrokerTradeBook from '@/modules/private/multibrokertrade/components/MultiBrokerTradeBook.vue'

// Composables
import { useTradeFormData } from '@/modules/private/shared/composables/useTradeFormData'
import { useMultiBrokerWebSocket } from '@/modules/private/multibrokertrade/composables/useMultiBrokerWebSocket'
import { useShortcutKeys } from '@/modules/private/shared/composables/useShortcutKeys'
import { useOrderManagement } from '@/modules/private/shared/composables/useOrderManagement'
import { useMultiBrokerPositions } from '@/modules/private/multibrokertrade/composables/useMultiBrokerPositions'
import { useOrders } from '@/modules/private/shared/composables/useOrders'

// Types
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'

// Store
import { useBrokerStore } from '@/modules/private/shared/stores/brokerStore'

// Initialize composables for shortcut handling
const { closeAllPositions, cancelAllOrders, loadingStates } = useOrderManagement()
const { allPositions, fetchAllPositions } = useMultiBrokerPositions()
const { orders, fetchOrders } = useOrders()
const { setupGlobalShortcuts, setupShortcutListeners } = useShortcutKeys()

const brokerStore = useBrokerStore()
const {
  selectedMultiBrokers: selectedBrokers,
  primaryBrokerId,
  primaryBroker,
  selectedArchitecture,
} = storeToRefs(brokerStore)
const primaryError = ref<string | null>(null)
const primaryWarning = ref<string | null>(null)

// Add broker filter refs
const filterByBrokerType = ref<string>('')
const filterByClientId = ref<string>('')

// Computed properties for filter options
const uniqueBrokerTypes = computed(() => {
  const types = new Set<string>()
  selectedBrokers.value.forEach((broker) => types.add(broker.type))
  return Array.from(types)
})

const uniqueClientIds = computed(() => {
  const clientIds = new Set<string>()
  selectedBrokers.value.forEach((broker) => clientIds.add(broker.clientId))
  return Array.from(clientIds)
})

// Reset filters function
const resetFilters = () => {
  filterByBrokerType.value = ''
  filterByClientId.value = ''
}

// Add refs for component references
const tradeMtm = ref()
const tradePositions = ref()
const orderBook = ref()
const tradeBook = ref()

// Add totalInvestment ref and provide it at the TradeView level
const totalInvestment = ref(Number(localStorage.getItem('totalInvestment')) || 0)
provide('totalInvestment', totalInvestment)

// Use the shared composable for trade form data
const {
  selectedSymbol,
  selectedExpiry,
  strikeData,
  underlyingToken,
  selectedSegment,
  lotSize,
  quantity,
  productType,
  orderType,
  selectedExchange,
  totalQuantity,
  shortcutsEnabled,
  positionFilter,
  defaultStopLoss,
  defaultTarget,
  underlyingLtp,
} = useTradeFormData()

const tradeFormKey = ref(0)

// Add ref for last valid LTP
const lastValidUnderlyingLtp = ref<number | null>(null)

// Add refs for instrument LTPs
const callInstrumentLtp = ref<number | null>(null)
const putInstrumentLtp = ref<number | null>(null)
const futuresInstrumentLtp = ref<number | null>(null)
const equityInstrumentLtp = ref<number | null>(null)

// Add refs for trading symbols
const callTradingSymbol = ref('')
const putTradingSymbol = ref('')
const futuresTradingSymbol = ref('')
const equityTradingSymbol = ref('')

// Add refs for instrument symbol tokens (required for Upstox orders - used as instrumentKey)
const callInstrumentSymbolToken = ref('')
const putInstrumentSymbolToken = ref('')
const futuresInstrumentSymbolToken = ref('')
const equityInstrumentSymbolToken = ref('')

// Add this ref for percentage change
const underlyingPctChange = ref<number | null>(null)

// Initialize WebSocket functionality
const {
  subscribe,
  unsubscribe,
  connectWebSocket,
  disconnectWebSocket,
  cleanup,
  setPrimaryQuoteBrokerType,
  refreshBrokerConnections,
} = useMultiBrokerWebSocket()

// Add loading state for refresh button
const isRefreshing = ref(false)

// Handler for refresh button
const handleRefreshConnections = async () => {
  if (isRefreshing.value) return

  isRefreshing.value = true
  console.log('🔄 Terminal: Refreshing broker connections...')

  try {
    // Call refresh function
    await refreshBrokerConnections(primaryBroker.value)

    // Re-subscribe to underlying token if we have one
    if (underlyingToken.value && selectedExchange.value) {
      await subscribe([{ exchange: selectedExchange.value, token: underlyingToken.value }])
    }

    // Dispatch event to trigger position refresh
    window.dispatchEvent(new Event('multi-positions-updated'))

    primaryError.value = null
    primaryWarning.value = null
  } catch (error) {
    console.error('Failed to refresh broker connections:', error)
    primaryError.value = 'Failed to refresh connections. Please try again.'
  } finally {
    isRefreshing.value = false
  }
}

/**
 * CRITICAL: Quote Update Handler - Terminal Token Matching
 * =======================================================
 * This handler processes real-time price updates from different broker WebSocket connections.
 *
 * TOKEN FORMAT BY BROKER:
 * - Zerodha: Numeric tokens (e.g., "256265" for Nifty 50)
 * - Flattrade/Shoonya: Numeric tokens (e.g., "26000" for Nifty)
 * - Upstox: Full instrument key format (e.g., "NSE_INDEX|Nifty 50")
 *
 * MATCHING LOGIC:
 * 1. Direct match: token === underlyingToken.value (Zerodha, Flattrade, Shoonya)
 * 2. Full key match: token === exchange|underlyingToken (Upstox)
 * 3. Exchange-prefixed match: For cases where exchange is embedded in token
 * 4. No exchange fallback: When exchange is not provided
 *
 * This design ensures backward compatibility with all supported brokers.
 */
const handleQuoteUpdate = ((event: CustomEvent) => {
  const { token, exchange, ltp: newLtp, pct_change } = event.detail

  // Token matching: Check if incoming token matches the subscribed underlying
  // Token could be in full format (e.g., "NSE_INDEX|Nifty 50") or just the token part
  const expectedFullToken =
    selectedExchange.value && underlyingToken.value
      ? `${selectedExchange.value}|${underlyingToken.value}`
      : underlyingToken.value

  // Match if: direct match, or token matches full expected key, or token part matches
  const tokenMatches =
    token === underlyingToken.value ||
    token === expectedFullToken ||
    (exchange === selectedExchange.value && token === `${exchange}|${underlyingToken.value}`) ||
    (!exchange && token === underlyingToken.value)

  if (tokenMatches) {
    if (newLtp !== null && newLtp !== undefined && newLtp !== 0) {
      const parsedLtp = typeof newLtp === 'string' ? parseFloat(newLtp) : newLtp
      underlyingLtp.value = parsedLtp
      lastValidUnderlyingLtp.value = parsedLtp
      underlyingPctChange.value = pct_change ? Number(pct_change) : null
    } else {
      underlyingLtp.value = lastValidUnderlyingLtp.value
    }
  }
}) as EventListener

// Track architecture to detect changes inside syncPrimaryConnection
// (which fires BEFORE the selectedArchitecture watcher due to Vue watcher ordering)
let lastKnownArchitecture: string | null = selectedArchitecture.value

const resetInstrumentSelection = () => {
  try {
    localStorage.removeItem('steadfast:trade:selectedSymbol')
  } catch {
  }

  selectedSymbol.value = ''
  selectedExpiry.value = ''
  strikeData.value = { CE: [], PE: [] }
  underlyingToken.value = null
  underlyingLtp.value = null
  lastValidUnderlyingLtp.value = null
  underlyingPctChange.value = null
  selectedSegment.value = ''

  // Clear trading symbols (stale tokens from old architecture)
  callTradingSymbol.value = ''
  putTradingSymbol.value = ''
  futuresTradingSymbol.value = ''
  equityTradingSymbol.value = ''

  // Clear instrument LTPs
  callInstrumentLtp.value = null
  putInstrumentLtp.value = null
  futuresInstrumentLtp.value = null
  equityInstrumentLtp.value = null

  // Clear instrument symbol tokens (used for Upstox instrumentKey)
  callInstrumentSymbolToken.value = ''
  putInstrumentSymbolToken.value = ''
  futuresInstrumentSymbolToken.value = ''
  equityInstrumentSymbolToken.value = ''

  tradeFormKey.value += 1
}

const syncPrimaryConnection = async () => {
  const selected = selectedBrokers.value
  const primaryId = primaryBrokerId.value

  // Detect architecture change and reset instruments BEFORE subscribing
  // This is critical: this watcher fires before the selectedArchitecture watcher,
  // so stale tokens must be cleared here to avoid sending wrong-format tokens
  const currentArch = selectedArchitecture.value
  if (lastKnownArchitecture && currentArch && currentArch !== lastKnownArchitecture) {
    console.log(
      '🔄 syncPrimaryConnection: Architecture changed from',
      lastKnownArchitecture,
      'to',
      currentArch,
      '— resetting instruments',
    )
    resetInstrumentSelection()
  }
  lastKnownArchitecture = currentArch

  if (!primaryId) {
    setPrimaryQuoteBrokerType(null)
    primaryError.value = null
    primaryWarning.value = 'Set a Primary Broker to use Terminal.'
    for (const broker of selected) {
      disconnectWebSocket(broker)
    }
    return
  }

  const primary = selected.find((b) => b.id === primaryId) || primaryBroker.value
  if (!primary) {
    setPrimaryQuoteBrokerType(null)
    primaryError.value = null
    primaryWarning.value =
      'Primary broker is set but not selected. It will be auto-selected if the token is valid.'
    return
  }

  setPrimaryQuoteBrokerType(primary.type)
  primaryWarning.value = null

  if (primary.status === BROKER_CONSTANTS.STATUS.VALID) {
    primaryError.value = null
    connectWebSocket(primary)
    for (const broker of selected) {
      if (broker.id !== primary.id) {
        disconnectWebSocket(broker)
      }
    }
    if (underlyingToken.value && selectedExchange.value) {
      try {
        await subscribe([{ exchange: selectedExchange.value, token: underlyingToken.value }])
      } catch (err) {
        console.error('Failed to resubscribe to underlying token:', err)
      }
    }
  } else {
    primaryError.value =
      'Primary broker token is invalid or expired. Please login again or set a different primary.'
  }
}

watch(
  [selectedBrokers, primaryBrokerId],
  () => {
    syncPrimaryConnection()
  },
  { deep: true, immediate: true },
)

// Architecture change is now detected inside syncPrimaryConnection() above.
// This ensures instruments are reset BEFORE stale tokens get re-subscribed.

// Provide values for child components
provide('selectedBrokers', selectedBrokers)
provide('selectedExchange', selectedExchange)

// Provide filter values for child components
provide('filterByBrokerType', filterByBrokerType)
provide('filterByClientId', filterByClientId)

// Add tradeFormData provide - this is critical for TradingInstrument
provide('tradeFormData', {
  selectedSymbol: computed({
    get: () => selectedSymbol.value,
    set: (val) => (selectedSymbol.value = val),
  }),
  selectedExpiry: computed({
    get: () => selectedExpiry.value,
    set: (val) => (selectedExpiry.value = val),
  }),
  strikeData: computed({
    get: () => strikeData.value,
    set: (val) => (strikeData.value = val),
  }),
  underlyingToken,
  selectedSegment: computed({
    get: () => selectedSegment.value,
    set: (val) => (selectedSegment.value = val),
  }),
  totalQuantity: computed(() => totalQuantity.value),
  quantity: computed(() => quantity.value),
  productType: computed(() => productType.value),
  orderType: computed(() => orderType.value),
})

// Add these individual provides for TradingActions
provide('productType', productType)
provide('orderType', orderType)
provide('exchange', selectedExchange)
provide('quantity', quantity)

// Provide trading symbols
provide('callTradingSymbol', callTradingSymbol)
provide('putTradingSymbol', putTradingSymbol)
provide('futuresTradingSymbol', futuresTradingSymbol)
provide('equityTradingSymbol', equityTradingSymbol)
provide('commodityFuturesTradingSymbol', futuresTradingSymbol)
provide('commodityOptionsCallSymbol', callTradingSymbol)
provide('commodityOptionsPutSymbol', putTradingSymbol)

// Provide instrument LTPs
provide('callInstrumentLtp', callInstrumentLtp)
provide('putInstrumentLtp', putInstrumentLtp)
provide('futuresInstrumentLtp', futuresInstrumentLtp)
provide('equityInstrumentLtp', equityInstrumentLtp)

// Provide instrument symbol tokens (required for Upstox orders)
provide('callInstrumentSymbolToken', callInstrumentSymbolToken)
provide('putInstrumentSymbolToken', putInstrumentSymbolToken)
provide('futuresInstrumentSymbolToken', futuresInstrumentSymbolToken)
provide('equityInstrumentSymbolToken', equityInstrumentSymbolToken)

// Provide underlyingLtp computed value
provide('underlyingLtp', computed(() => underlyingLtp.value ?? lastValidUnderlyingLtp.value))

// Provide underlyingPctChange for UnderlyingInstrument component
provide('underlyingPctChange', computed(() => underlyingPctChange.value))

// Subscribe/unsubscribe to underlying token updates
watch([underlyingToken, selectedExchange], async ([newToken, newExchange], [oldToken, oldExchange]) => {
  console.log('🔄 Terminal: Token/Exchange watch triggered:', {
    newToken,
    newExchange,
    oldToken,
    oldExchange,
  })

  if (!newExchange) {
    console.warn('⚠️ Terminal: No exchange selected, skipping subscription')
    return
  }

  // Handle Commodity Futures subscription using symbol token
  if (selectedSegment.value === 'Commodity Futures' && futuresTradingSymbol.value) {
    newToken = futuresTradingSymbol.value
  }

  underlyingLtp.value = null
  lastValidUnderlyingLtp.value = null

  // Only unsubscribe if we had a previous valid subscription
  if (oldToken && oldExchange) {
    console.log('📤 Terminal: Unsubscribing from old token:', {
      exchange: oldExchange,
      token: oldToken,
    })
    await unsubscribe([{ exchange: oldExchange, token: oldToken }])
  }

  // Only subscribe if we have a valid new token
  if (newToken && newExchange) {
    console.log('📥 Terminal: Subscribing to new token:', {
      exchange: newExchange,
      token: newToken,
    })
    await subscribe([{ exchange: newExchange, token: newToken }])
  }
})

// Add watcher to clear trading symbols and tokens when selections change
watch([selectedSymbol, selectedExpiry, selectedSegment], () => {
  callTradingSymbol.value = ''
  putTradingSymbol.value = ''
  futuresTradingSymbol.value = ''
  equityTradingSymbol.value = ''
  // Also clear instrument symbol tokens (used for Upstox instrumentKey)
  callInstrumentSymbolToken.value = ''
  putInstrumentSymbolToken.value = ''
  futuresInstrumentSymbolToken.value = ''
  equityInstrumentSymbolToken.value = ''
})

// Watch for changes in total net quantity
watch(
  () => tradePositions.value?.totalNetQuantity,
  (newQty) => {
    if (tradeMtm.value && typeof newQty === 'number') {
      tradeMtm.value.updateNetQuantity(newQty)
    }
  },
  { immediate: true },
)

// Watch for changes in total net P&L
watch(
  () => tradePositions.value?.totalMtm,
  (newMtm) => {
    if (tradeMtm.value && typeof newMtm === 'number') {
      tradeMtm.value.updateMtm(newMtm)
      // Update the average MTM per broker account
      tradeMtm.value.updateAvgMtm(selectedBrokers.value.length)
    }
  },
  { immediate: true },
)

// Add a watcher for selectedBrokers to update avgMtm when broker selection changes
watch(
  () => selectedBrokers.value.length,
  (brokerCount) => {
    if (tradeMtm.value) {
      tradeMtm.value.updateAvgMtm(brokerCount)
    }
  },
  { immediate: true },
)

// Update the strikeData watcher to handle empty values
watch(
  () => strikeData.value,
  (newStrikes) => {
    if (!newStrikes) return // Add null check

    if (selectedSegment.value === 'Commodity Options') {
      // Set call and put trading symbols for commodity options
      callTradingSymbol.value = newStrikes.CE?.length > 0 ? selectedSymbol.value : ''
      putTradingSymbol.value = newStrikes.PE?.length > 0 ? selectedSymbol.value : ''
    } else {
      callTradingSymbol.value = newStrikes.CE?.length > 0 ? selectedSymbol.value : ''
      putTradingSymbol.value = newStrikes.PE?.length > 0 ? selectedSymbol.value : ''
    }
  },
  { deep: true },
)

// Computed properties for segment type validation
const isOptionsSegment = computed(
  () =>
    selectedSegment.value === 'Index Options' ||
    selectedSegment.value === 'Stocks Options' ||
    selectedSegment.value === 'Commodity Options',
)
const isFuturesSegment = computed(
  () =>
    selectedSegment.value === 'Index Futures' ||
    selectedSegment.value === 'Stocks Futures' ||
    selectedSegment.value === 'Commodity Futures',
)
const isEquitySegment = computed(() => selectedSegment.value === 'Stocks Equity')

// Add shortcut handlers for terminal trading
const handleCloseAll = async () => {
  if (selectedBrokers.value.length === 0 || loadingStates.value.closeAll) return

  try {
    loadingStates.value.closeAll = true
    console.log('Starting terminal close all process')
    await fetchAllPositions(selectedBrokers.value)

    if (!allPositions.value || allPositions.value.length === 0) {
      console.log('No positions to close across all brokers')
      return
    }

    // Group positions by broker and close them
    const promises = selectedBrokers.value.map(async (broker) => {
      const brokerPositions = allPositions.value.filter((pos) => pos.broker?.id === broker.id)
      if (brokerPositions.length > 0) {
        console.log(`Closing ${brokerPositions.length} positions for broker: ${broker.name}`)
        return await closeAllPositions(brokerPositions, broker)
      }
    })

    const results = await Promise.allSettled(promises)
    console.log('Terminal close all results:', results)

    // Wait a moment for orders to process
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Refresh positions
    await fetchAllPositions(selectedBrokers.value)

    // Dispatch event to refresh other components
    window.dispatchEvent(new Event('multi-order-closed'))
  } finally {
    loadingStates.value.closeAll = false
  }
}

const handleCancelOrders = async () => {
  if (selectedBrokers.value.length === 0 || loadingStates.value.cancelOrders) return

  try {
    loadingStates.value.cancelOrders = true
    console.log('Starting terminal cancel orders process')

    // Cancel orders for each broker
    const promises = selectedBrokers.value.map(async (broker) => {
      await fetchOrders(broker)
      if (orders.value && orders.value.length > 0) {
        console.log(`Cancelling orders for broker: ${broker.name}`)
        return await cancelAllOrders(orders.value, broker)
      }
    })

    const results = await Promise.allSettled(promises)
    console.log('Terminal cancel orders results:', results)

    // Wait a moment for orders to process
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Refresh data
    await Promise.all([
      ...selectedBrokers.value.map((broker) => fetchOrders(broker)),
      fetchAllPositions(selectedBrokers.value),
    ])

    // Dispatch events to refresh other components
    window.dispatchEvent(new Event('multi-orders-cancelled'))
    window.dispatchEvent(new Event('multi-positions-updated'))
  } catch (error) {
    console.error('Terminal cancel orders failed:', error)
  } finally {
    loadingStates.value.cancelOrders = false
  }
}

// Setup unified shortcut handling
setupGlobalShortcuts({
  shortcutsEnabled,
  mode: 'multi',
})

setupShortcutListeners(handleCloseAll, handleCancelOrders, 'multi')

// Specify required access type for SubscriptionCheck
provide('requiredAccessType', 'multiBroker')

let totalInvestmentUpdatedHandler: EventListener | null = null

// Handler for total investment updates from MultiBrokerSelector
const handleTotalInvestmentUpdate = ((event: CustomEvent) => {
  const newTotalInvestment = event.detail?.totalInvestment
  if (typeof newTotalInvestment === 'number') {
    totalInvestment.value = newTotalInvestment
    console.log('Total investment updated:', newTotalInvestment)
  }
}) as EventListener

onMounted(() => {
  console.log('Terminal mounted')

  // Add event listener for quote updates
  window.addEventListener('quote-update', handleQuoteUpdate)

  // Listen for total investment updates
  totalInvestmentUpdatedHandler = handleTotalInvestmentUpdate
  window.addEventListener('total-investment-updated', totalInvestmentUpdatedHandler)

  // Listen for watchlist subscription requests
  window.addEventListener(
    'watchlist-subscribe',
    ((event: CustomEvent) => {
      const symbols = event.detail?.symbols
      if (symbols && Array.isArray(symbols) && symbols.length > 0) {
        console.log('📋 Watchlist: Subscribing to instruments:', symbols)
        subscribe(symbols)
      }
    }) as EventListener,
  )
})

// Ensure proper cleanup when component is unmounted
onUnmounted(() => {
  console.log('Terminal unmounted - performing cleanup')

  // Clean up WebSocket subscriptions first
  if (underlyingToken.value && selectedExchange.value) {
    console.log(`Terminal: Unsubscribing from token ${underlyingToken.value} on unmount`)
    unsubscribe([{ exchange: selectedExchange.value, token: underlyingToken.value }])
  }

  // Disconnect each broker individually to ensure proper cleanup
  if (selectedBrokers.value.length > 0) {
    console.log(`Terminal: Disconnecting from ${selectedBrokers.value.length} brokers individually`)
    for (const broker of selectedBrokers.value) {
      console.log(`Terminal: Disconnecting from ${broker.type}`)
      disconnectWebSocket(broker)
    }
  }

  // Finally, call the cleanup function to ensure everything is properly closed
  console.log('Terminal: Calling cleanup to disconnect all WebSocket connections')
  cleanup(true) // true = force disconnect, we're leaving the page

  // Remove event listeners
  window.removeEventListener('quote-update', handleQuoteUpdate as EventListener)
  if (totalInvestmentUpdatedHandler) {
    window.removeEventListener('total-investment-updated', totalInvestmentUpdatedHandler)
    totalInvestmentUpdatedHandler = null
  }
})
</script>

<template>
    <section class="py-3">
      <div v-if="primaryWarning" class="alert alert-warning mb-2">
        <FontAwesomeIcon icon="exclamation-triangle" class="me-2" />
        {{ primaryWarning }}
      </div>
      <div v-if="primaryError" class="alert alert-danger mb-2">
        <FontAwesomeIcon icon="times-circle" class="me-2" />
        {{ primaryError }}
      </div>
      <MultiBrokerSelector />

      <!-- Add TradeForm component -->
      <TradeForm
        :key="tradeFormKey"
        v-model:symbol="selectedSymbol"
        v-model:expiry="selectedExpiry"
        v-model:strikeData="strikeData"
        v-model:underlyingToken="underlyingToken"
        v-model:segment="selectedSegment"
        v-model:exchange="selectedExchange"
        :underlyingLtp="underlyingLtp"
        v-model:lotSize="lotSize"
        v-model:productType="productType"
        v-model:orderType="orderType"
        v-model:totalQuantity="totalQuantity"
        v-model:quantity="quantity"
        v-model:shortcutsEnabled="shortcutsEnabled"
        v-model:positionFilter="positionFilter"
        v-model:default-stop-loss="defaultStopLoss"
        v-model:default-target="defaultTarget"
      />

      <!-- Main Trading Interface -->
      <!-- Trading Instrument -->
      <div class="row align-items-center justify-content-between mt-3">
        <!-- Options Trading View -->
        <template v-if="isOptionsSegment">
          <!-- Call Strike Selection -->
          <div class="col-6 col-md-4 col-lg-4">
            <TradingInstrument type="CALL" symbol-type="call" :class="{ 'order-1': isOptionsSegment }" />
          </div>

          <!-- Underlying Symbol & LTP -->
          <UnderlyingInstrument />

          <!-- Put Strike Selection -->
          <div class="col-6 col-md-4 col-lg-4">
            <TradingInstrument type="PUT" symbol-type="put" :class="{ 'order-3': isOptionsSegment }" />
          </div>
        </template>

        <!-- Futures Trading View -->
        <template v-else-if="isFuturesSegment">
          <TradingInstrument
            type="FUT"
            :symbol-type="selectedSegment === 'Commodity Futures' ? 'commodity-fut' : 'fut'"
            :class="{ 'order-2': isFuturesSegment }"
          />
        </template>

        <!-- Equity Trading View -->
        <template v-else-if="isEquitySegment">
          <div class="col-12 col-md-8 col-lg-8">
            <TradingInstrument type="EQ" />
          </div>
        </template>

        <!-- No Segment Selected -->
        <template v-else>
          <div class="col-12 text-center mt-3">
            <p class="text-muted">Please select a trading segment to continue</p>
          </div>
        </template>
      </div>

      <!-- Trading Actions -->
      <div class="row align-items-center justify-content-between mt-3">
        <!-- Options Trading Actions -->
        <template v-if="isOptionsSegment">
          <TradeActions mode="multi" type="CALL" position="left" :showCloseButtons="false" :shortcutsEnabled="shortcutsEnabled" />
          <TradeActions mode="multi" position="center" :showTradeButtons="false" :shortcutsEnabled="shortcutsEnabled" />
          <TradeActions mode="multi" type="PUT" position="right" :showCloseButtons="false" :shortcutsEnabled="shortcutsEnabled" />
        </template>

        <!-- Futures Trading Actions -->
        <template v-else-if="isFuturesSegment">
          <TradeActions mode="multi" type="FUT" position="left" :showCloseButtons="false" :shortcutsEnabled="shortcutsEnabled" />
          <TradeActions mode="multi" position="center" :showTradeButtons="false" :shortcutsEnabled="shortcutsEnabled" />
        </template>

        <!-- Equity Trading Actions -->
        <template v-else-if="isEquitySegment">
          <TradeActions mode="multi" type="EQ" position="left" :showCloseButtons="false" :shortcutsEnabled="shortcutsEnabled" />
          <TradeActions mode="multi" position="center" :showTradeButtons="false" :shortcutsEnabled="shortcutsEnabled" />
        </template>

        <!-- No Segment Selected -->
        <template v-else>
          <TradeActions mode="multi" position="center" :showTradeButtons="false" :shortcutsEnabled="shortcutsEnabled" />
        </template>
      </div>

      <!-- Trade MTM -->
      <TradeMtm ref="tradeMtm" :is-multi-broker="true" />

      <!-- Trade Positions and Order Book Tabs with Inline Filters -->
      <div class="row mt-3">
        <div class="col-12">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <!-- Tab Navigation -->
            <ul class="nav nav-tabs border-0 mb-0" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link active" id="positions-tab" data-bs-toggle="tab" data-bs-target="#positions" type="button" role="tab">
                  Positions
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link" id="order-book-tab" data-bs-toggle="tab" data-bs-target="#order-book" type="button" role="tab">
                  Order Book
                  <span v-if="orderBook?.orderStats?.pending > 0" class="badge bg-warning text-dark ms-1">
                    {{ orderBook.orderStats.pending }}
                  </span>
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link" id="trade-book-tab" data-bs-toggle="tab" data-bs-target="#trade-book" type="button" role="tab">
                  Trade Book
                  <span v-if="tradeBook?.tradeCount > 0" class="badge bg-secondary ms-1">
                    {{ tradeBook.tradeCount }}
                  </span>
                </button>
              </li>
            </ul>

            <!-- Inline Filters -->
            <div class="d-flex align-items-center gap-2">
              <div class="d-flex align-items-center gap-1">
                <small class="text-muted">Broker:</small>
                <select v-model="filterByBrokerType" class="form-select form-select-sm" style="width: auto; min-width: 100px;">
                  <option value="">All</option>
                  <option v-for="type in uniqueBrokerTypes" :key="type" :value="type">
                    {{ type }}
                  </option>
                </select>
              </div>
              <div class="d-flex align-items-center gap-1">
                <small class="text-muted">Client:</small>
                <select v-model="filterByClientId" class="form-select form-select-sm" style="width: auto; min-width: 100px;">
                  <option value="">All</option>
                  <option v-for="clientId in uniqueClientIds" :key="clientId" :value="clientId">
                    {{ clientId }}
                  </option>
                </select>
              </div>
              <button v-if="filterByBrokerType || filterByClientId" class="btn btn-sm btn-outline-secondary rounded-1" @click="resetFilters" title="Reset Filters">
                <FontAwesomeIcon icon="xmark" />
              </button>
              <!-- Refresh Button -->
              <button class="btn btn-sm btn-outline-primary rounded-1" :disabled="isRefreshing" @click="handleRefreshConnections" title="Refresh broker connections to fix LTP issues">
                <FontAwesomeIcon :icon="isRefreshing ? 'spinner' : 'sync'" :spin="isRefreshing" />
                <span class="ms-1 d-none d-md-inline">Refresh</span>
              </button>
            </div>
          </div>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="positions" role="tabpanel">
              <MultiBrokerPositions
                ref="tradePositions"
                :positionFilter="positionFilter"
                :default-stop-loss="defaultStopLoss"
                :default-target="defaultTarget"
                :filter-by-broker-type="filterByBrokerType"
                :filter-by-client-id="filterByClientId"
              />
            </div>
            <div class="tab-pane fade" id="order-book" role="tabpanel">
              <MultiBrokerOrderBook ref="orderBook" :filter-by-broker-type="filterByBrokerType" :filter-by-client-id="filterByClientId" />
            </div>
            <div class="tab-pane fade" id="trade-book" role="tabpanel">
              <MultiBrokerTradeBook ref="tradeBook" :filter-by-broker-type="filterByBrokerType" :filter-by-client-id="filterByClientId" />
            </div>
          </div>
        </div>
      </div>

      <!-- Instructions -->
      <div class="row mt-3">
        <div class="col-12">
          <h6 class="text-danger">Notes & Disclaimer:</h6>
          <ol class="text-muted mt-2">
            <li>
              <strong>Market Protection:</strong> Orders placed with "Market Protection" use a limit price with a buffer above/below the LTP to improve fill rates. Protection percentages: 2% for prices below ₹100, 1.5% for ₹100-500, 1% for ₹500-1000, and 0.5% above ₹1000. If the market moves beyond your protection limit, the order remains open as a limit order.
            </li>
            <li>
              Features such as Stoploss, Trailing Stoploss, and Take Profit are client-side, meaning they execute within your web browser. These require an uninterrupted internet connection and the "AmpTrade" window to remain open and active to trigger your orders.
            </li>
            <li>
              Stoploss, Trailing Stoploss, and Take Profit settings will reset based on the LTP if the "AmpTrade" window is reloaded.
            </li>
            <li>
              Neither AmpTrade nor its developers/owners are responsible for any financial outcomes resulting from using the application.
            </li>
          </ol>
        </div>
      </div>
    </section>
</template>
