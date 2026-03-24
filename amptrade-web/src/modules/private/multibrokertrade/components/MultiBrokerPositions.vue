<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref, computed, inject, type Ref } from 'vue'
import type { PositionUpdate, Position } from '@/modules/private/shared/types/trade'
import { useOrderManagement } from '@/modules/private/shared/composables/useOrderManagement'
import type { TradeActionPayload } from '@/modules/private/shared/types/trade'
import TriggerModal from '@/modules/private/shared/components/TriggerModal.vue'
import QtyControlModal from '@/modules/private/shared/components/QtyControlModal.vue'
import { useStoplossTarget } from '@/modules/private/shared/composables/useStoplossTarget'
import { usePositionTriggerModal } from '@/modules/private/shared/composables/usePositionTriggerModal'
import { useTriggerCoordination } from '@/modules/private/shared/composables/useTriggerCoordination'
import type { Broker } from '@/modules/private/shared/types/broker'
import { useMultiBrokerWebSocket } from '@/modules/private/multibrokertrade/composables/useMultiBrokerWebSocket'
import {
  useMultiBrokerPositions,
  type BrokerPosition,
} from '@/modules/private/multibrokertrade/composables/useMultiBrokerPositions'
import { getTriggerKey, createQuoteUpdateHandler, getPositionLtp, createPositionUpdaterFactory, createPositionClosingHandler, getTriggerStatus, type UnifiedPosition } from '@/modules/private/shared/utils/triggerUtils'
import { getOptionType } from '@/modules/private/shared/utils/symbolUtils'
import { getDefaultStopLoss } from '@/modules/private/shared/composables/useStoplossTarget'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import { usePositionMtm } from '@/modules/private/shared/composables/usePositionMtm'
import { calculateProtectedPrice } from '@/modules/utils/marketProtection'

// Inject selected brokers
const selectedBrokers = inject<Ref<Broker[]>>('selectedBrokers', ref([]))

// Remove filter refs since they'll be passed as props
// const filterByBrokerType = ref<string>('')
// const filterByClientId = ref<string>('')

const { placeOrder } = useOrderManagement()
const { triggerValues, setTriggers, checkTriggers, resetTriggers, clearTriggersForSymbol } = useStoplossTarget()
const { subscribeToPositions, unsubscribeFromPositions } = useMultiBrokerWebSocket()
const { isPositionProcessing } = useTriggerCoordination()

// Use the new composable
const {
  allPositionsByBroker,
  updateTrigger,
  fetchPositionsForBroker,
  fetchAllPositions,
  updatePosition,
  resetPositionsState,
  allPositions,
  isAnyBrokerLoading,
  combinedErrorMessage,
  positionLtps,
} = useMultiBrokerPositions()

// Additional position state
const positionPctChange = ref<Record<string, number>>({})
const subscribedSymbols = ref<Array<{ exchange: string; token: string }>>([])

// Use shared trigger modal composable
const {
  showTriggerModal,
  selectedPosition,
  selectedTriggerType,
  computedDefaultStopLoss,
  computedDefaultTarget,
  openTriggerModal,
  handleTriggerSave,
} = usePositionTriggerModal<BrokerPosition>({
  positionLtps,
  updatePosition: async (symbol: string, updates: Record<string, unknown>, broker?: unknown) => {
    await updatePosition(symbol, updates as PositionUpdate, broker as { id: string } | null)
  },
})

// Use shared MTM composable for consistent calculations
const {
  calculatePositionUnrealizedPnL,
  totalNetQuantity: sharedTotalNetQuantity,
  totalMtm: sharedTotalMtm
} = usePositionMtm({
  positions: allPositions,
  positionLtps
})

// Calculate unrealized P&L with null checks using shared composable
const calculateUnrealizedPnL = (position: BrokerPosition) => {
  return calculatePositionUnrealizedPnL(position)
}

// Read stoploss/target enabled state from localStorage
const stopLossEnabled = computed(() => localStorage.getItem(STORAGE_KEYS.TRADE_STOPLOSS_ENABLED) === 'true')
const targetEnabled = computed(() => localStorage.getItem(STORAGE_KEYS.TRADE_TARGET_ENABLED) === 'true')

// Track closing state per position using a Set of position keys
const closingPositions = ref<Set<string>>(new Set())

// Track which dropdown is open (by position key)
const openDropdownKey = ref<string | null>(null)

const getPositionKey = (position: BrokerPosition) => `${position.broker?.id}-${position.symbol}`

// Check if a position's trigger is currently being processed (for loading indicator)
const isPositionTriggerProcessing = (position: BrokerPosition): boolean => {
  const triggerKey = getTriggerKey(position)
  return isPositionProcessing(triggerKey)
}

const closeDropdown = () => {
  openDropdownKey.value = null
}

// Create standardized position closing handler
const positionClosingHandler = createPositionClosingHandler({
  placeOrder: async (payload, broker) => {
    return await placeOrder(payload as unknown as TradeActionPayload, broker as unknown as Broker)
  },
  getPositionLtps: () => positionLtps.value,
  setTriggers,
  getTriggerKey
})

const handleClosePosition = async (position: BrokerPosition) => {
  if (!position.broker || position.quantity === 0) return

  const positionKey = getPositionKey(position)
  const symbol = position.symbol
  try {
    closingPositions.value.add(positionKey)
    await positionClosingHandler(position, position.broker as unknown as Record<string, unknown>)

    // Clear triggers for this symbol to prevent stale triggers on re-entry
    clearTriggersForSymbol(symbol)

    await new Promise((resolve) => setTimeout(resolve, 1000))

    try {
      await fetchPositionsForBroker(position.broker)
    } catch (fetchError) {
      console.error('Error refreshing positions after close:', fetchError)
    }

    window.dispatchEvent(new Event('multi-order-placed'))
  } catch (error) {
    console.error('Failed to close position:', error)
  } finally {
    closingPositions.value.delete(positionKey)
  }
}

const handlePartialClose = async (position: BrokerPosition, percentage: number) => {
  if (!position.broker || position.quantity === 0) return

  const positionKey = getPositionKey(position)
  try {
    closingPositions.value.add(positionKey)

    // Calculate the quantity to close considering lot size
    const quantityToClose = calculateLotAdjustedQuantity(position.quantity, percentage, position.lotSize)

    if (quantityToClose === 0) {
      console.warn('Calculated quantity to close is 0 after lot size adjustment, skipping')
      return
    }

    // Create a partial position for closing
    const partialPosition = {
      ...position,
      quantity: position.quantity > 0 ? quantityToClose : -quantityToClose
    }

    await positionClosingHandler(partialPosition, position.broker as unknown as Record<string, unknown>)

    await new Promise((resolve) => setTimeout(resolve, 1000))

    try {
      await fetchPositionsForBroker(position.broker)
    } catch (fetchError) {
      console.error('Error refreshing positions after close:', fetchError)
    }

    window.dispatchEvent(new Event('multi-order-placed'))
  } catch (error) {
    console.error(`Failed to close ${percentage}% of position:`, error)
  } finally {
    closingPositions.value.delete(positionKey)
  }
}

// Custom quote update handler that also captures pct_change
const handleQuoteUpdate = (event: Event) => {
  const customEvent = event as CustomEvent
  const { token, exchange, pct_change } = customEvent.detail
  const symbolKey = `${exchange}|${token}`

  // Store pct_change if available and valid
  if (pct_change !== undefined && pct_change !== null && !isNaN(pct_change)) {
    positionPctChange.value[symbolKey] = pct_change
    positionPctChange.value[token] = pct_change
  }

  // Call the standard quote update handler for trigger processing
  standardQuoteHandler(event)
}

// Create standardized quote update handler using the new utility
const standardQuoteHandler = createQuoteUpdateHandler({
  positions: () => Object.values(allPositionsByBroker.value).flat(),
  positionLtps: positionLtps,
  stopLossEnabled: () => stopLossEnabled.value,
  targetEnabled: () => targetEnabled.value,
  checkTriggers: (position: BrokerPosition, ltp: number, triggerKey?: string) => {
    const key = triggerKey || getTriggerKey(position)
    return checkTriggers(position as Position, ltp, key)
  },
  setTriggers,
  updatePosition: async (symbol: string, updates: Record<string, unknown>, broker?: { id: string }) => {
    await updatePosition(symbol, updates as PositionUpdate, broker)
  },
  handleClosePosition,
  getDefaultStopLoss
}) as unknown as EventListener

// Subscribe to position symbols
const handlePositionSubscriptions = async () => {
  // Create new subscription list from all broker positions
  const newSubscriptions = Object.values(allPositionsByBroker.value)
    .flatMap((positions) =>
      positions
        .filter((position) => position.token && position.exchange)
        .map((position) => ({
          exchange: position.exchange,
          token: position.token,
        })),
    )
    // Remove duplicates
    .filter((v, i, a) => a.findIndex((t) => t.exchange === v.exchange && t.token === v.token) === i)

  if (newSubscriptions.length > 0) {
    console.log('Subscribing to positions:', newSubscriptions)
    subscribedSymbols.value = newSubscriptions
    await subscribeToPositions(newSubscriptions)
  } else {
    // If no positions, clear any existing subscriptions
    unsubscribeFromPositions()
  }
}

// Watch for broker changes
watch(
  selectedBrokers,
  async (newBrokers) => {
    if (newBrokers.length > 0) {
      // Reset triggers when brokers change
      Object.keys(triggerValues.value).forEach((symbol) => {
        resetTriggers(symbol)
      })

      // Reset position storage
      resetPositionsState(newBrokers)

      // Fetch positions for all brokers
      await fetchAllPositions(newBrokers)
      await handlePositionSubscriptions()
    }
  },
  { immediate: true, deep: true },
)

// Handle order updates
const handleOrderUpdate = async () => {
  console.log('Order update received in MultiBrokerPositions')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (selectedBrokers.value.length > 0) {
    await fetchAllPositions(selectedBrokers.value)
    await handlePositionSubscriptions()
  }
}

// Handle position updates
const handlePositionUpdate = async () => {
  console.log('Position update received in MultiBrokerPositions')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (selectedBrokers.value.length > 0) {
    await fetchAllPositions(selectedBrokers.value)
    await handlePositionSubscriptions()
  }
}

// Handle order updates from WebSocket - wrap the callback to satisfy TS types
const orderUpdateListener: EventListener = () => {
  handleOrderUpdate()
}

onMounted(() => {
  positionLtps.value = {} // Ensure it's initialized

  // Register event listeners
  // Order matters: register order-complete first to ensure we don't miss order completions
  window.addEventListener('order-complete', handleOrderComplete as EventListener)
  window.addEventListener('quote-update', handleQuoteUpdate)
  window.addEventListener('order-update', orderUpdateListener) // Listen for WebSocket order updates directly
  window.addEventListener('multi-order-placed', handleOrderUpdate)
  window.addEventListener('multi-order-closed', handlePositionUpdate)
  window.addEventListener('multi-positions-updated', handlePositionUpdate)
  window.addEventListener('multi-orders-cancelled', handleOrderUpdate)

  // Close dropdown when clicking outside
  window.addEventListener('click', closeDropdown)

  // Fetch positions if brokers are selected
  if (selectedBrokers.value.length > 0) {
    fetchAllPositions(selectedBrokers.value)
  }
})

onBeforeUnmount(() => {
  // Cleanup subscriptions using the unsubscribeFromPositions method
  unsubscribeFromPositions()

  // Remove event listeners
  window.removeEventListener('order-complete', handleOrderComplete as EventListener)
  window.removeEventListener('quote-update', handleQuoteUpdate)
  window.removeEventListener('order-update', orderUpdateListener) // Remove WebSocket order update listener
  window.removeEventListener('multi-order-placed', handleOrderUpdate)
  window.removeEventListener('multi-order-closed', handlePositionUpdate)
  window.removeEventListener('multi-positions-updated', handlePositionUpdate)
  window.removeEventListener('multi-orders-cancelled', handleOrderUpdate)
  window.removeEventListener('click', closeDropdown)

  // Clear positionLtps and pct changes
  positionLtps.value = {}
  positionPctChange.value = {}
})

// Helper to get LTP for a position using the standardized utility
const getPositionLtpFormatted = (position: BrokerPosition) => {
  return getPositionLtp(position as UnifiedPosition, positionLtps.value)
}

// Helper to get change percentage directly from WebSocket data
const getPositionChangePercent = (position: BrokerPosition): number | null => {
  const symbolKey = `${position.exchange}|${position.token}`
  const pctChange = positionPctChange.value[symbolKey] ?? positionPctChange.value[position.token]

  if (pctChange === undefined || pctChange === null || isNaN(pctChange)) return null
  return pctChange
}

// Helper to determine if LTP is up or down from close
const isLtpUp = (position: BrokerPosition): boolean | null => {
  const changePercent = getPositionChangePercent(position)
  if (changePercent === null) return null
  return changePercent > 0
}

// getOptionType is now imported from '@/modules/private/shared/utils/symbolUtils'

// Update props to include filter props
const props = defineProps<{
  positionFilter: string
  defaultStopLoss?: number
  defaultTarget?: number
  filterByBrokerType: string
  filterByClientId: string
}>()

// Update computed property for filtered positions to use props
const filteredPositions = computed<BrokerPosition[]>(() => {
  let filteredList: BrokerPosition[] =
    props.positionFilter === 'ALL'
      ? allPositions.value
      : allPositions.value.filter((position) => {
        if (props.positionFilter === 'EQUITY') {
          return (
            (position.exchange === 'NSE' ||
              position.exchange === 'BSE' ||
              position.exchange === 'MCX') &&
            position.instrumentName === 'EQ'
          )
        }
        if (props.positionFilter === 'FNO') {
          return (
            (position.exchange === 'NFO' || position.exchange === 'BFO') &&
            ['OPTIDX', 'OPTSTK', 'FUTIDX', 'FUTSTK'].includes(position.instrumentName)
          )
        }
        return true
      })

  // Apply broker type filter if selected
  if (props.filterByBrokerType) {
    filteredList = filteredList.filter(
      (position) => position.broker?.type === props.filterByBrokerType,
    )
  }

  // Apply client ID filter if selected
  if (props.filterByClientId) {
    filteredList = filteredList.filter(
      (position) => position.broker?.clientId === props.filterByClientId,
    )
  }

  // Sort positions: open positions first (by abs quantity), then closed positions
  return filteredList.sort((a, b) => {
    const aQty = Math.abs(a.quantity)
    const bQty = Math.abs(b.quantity)

    // If one is open and other is closed, open comes first
    if ((aQty === 0) !== (bQty === 0)) {
      return aQty === 0 ? 1 : -1
    }

    // Group by broker
    if (a.broker?.id !== b.broker?.id) {
      return (a.broker?.name || '').localeCompare(b.broker?.name || '')
    }

    // If both are open or both are closed, sort by absolute quantity
    return bQty - aQty
  })
})

// Use shared MTM calculations
const totalMtm = sharedTotalMtm

// Update exports to include totalMtm
defineExpose({
  totalNetQuantity: sharedTotalNetQuantity,
  totalMtm,
})

// Add a handler for order completion
const handleOrderComplete = (event: CustomEvent) => {
  const { orderId, symbol, broker } = event.detail
  console.log('Order complete:', { orderId, symbol, broker })

  if (broker) {
    const triggerKey = `${broker.id}|${symbol}`
    const triggers = triggerValues.value[triggerKey]
    console.log('Checking order completion triggers:', { triggerKey, triggers })

    if (triggers?.pendingOrderId === orderId) {
      console.log('Resetting triggers after order completion:', { triggerKey, orderId })
      resetTriggers(triggerKey) // Fully reset the triggers instead of partial update
    }
  }
}

// Create standardized position updater using the factory
const positionUpdater = createPositionUpdaterFactory<UnifiedPosition>({
  updatePosition: async (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => {
    await updatePosition(symbol, updates as PositionUpdate, broker)
  },
  setTriggers,
  getDefaultStopLoss
})

// Use standardized trigger removal handlers from factory
const removeStopLoss = async (position: BrokerPosition) => {
  await positionUpdater.removeStopLoss(position)
}

const removeTarget = async (position: BrokerPosition) => {
  await positionUpdater.removeTarget(position)
}

// Helper function to calculate lot-size adjusted quantity
const calculateLotAdjustedQuantity = (totalQuantity: number, percentage: number, lotSize?: number): number => {
  if (!lotSize) {
    throw new Error('Lot size is required for position closing calculations')
  }
  const baseQuantityToClose = Math.floor(Math.abs(totalQuantity) * (percentage / 100))
  return Math.floor(baseQuantityToClose / lotSize) * lotSize
}

// New increment/decrement handlers
const incrementStopLoss = async (position: BrokerPosition) => {
  if (!position.broker || !stopLossEnabled.value) return

  const currentValue = position.stopLoss || position.trailingStopLoss || 0
  const increment = Math.max(0.05, currentValue * 0.01) // 1% or minimum 0.05
  const newValue = currentValue + increment

  await updatePosition(position.symbol, { stopLoss: newValue }, position.broker)
}

const decrementStopLoss = async (position: BrokerPosition) => {
  if (!position.broker || !stopLossEnabled.value) return

  const currentValue = position.stopLoss || position.trailingStopLoss || 0
  const decrement = Math.max(0.05, currentValue * 0.01) // 1% or minimum 0.05
  const newValue = Math.max(0.05, currentValue - decrement) // Don't go below 0.05

  await updatePosition(position.symbol, { stopLoss: newValue }, position.broker)
}

const incrementTarget = async (position: BrokerPosition) => {
  if (!position.broker || !targetEnabled.value) return

  const currentValue = position.target || 0
  const increment = Math.max(0.05, currentValue * 0.01) // 1% or minimum 0.05
  const newValue = currentValue + increment

  await updatePosition(position.symbol, { target: newValue }, position.broker)
}

const decrementTarget = async (position: BrokerPosition) => {
  if (!position.broker || !targetEnabled.value) return

  const currentValue = position.target || 0
  const decrement = Math.max(0.05, currentValue * 0.01) // 1% or minimum 0.05
  const newValue = Math.max(0.05, currentValue - decrement) // Don't go below 0.05

  await updatePosition(position.symbol, { target: newValue }, position.broker)
}

// New method: toggle between trailing and static stoploss for a given position using factory
const toggleTrailingStoploss = async (position: BrokerPosition) => {
  if (!position.broker || !stopLossEnabled.value) return
  await positionUpdater.toggleTrailingStoploss(position, positionLtps.value)
}

// Track adding/removing quantity state per position separately
const addingQuantity = ref<Set<string>>(new Set())
const removingQuantity = ref<Set<string>>(new Set())

// Qty Control Modal state
const showQtyModal = ref(false)
const selectedQtyPosition = ref<BrokerPosition | null>(null)

const openQtyModal = (position: BrokerPosition) => {
  const symbolKey = `${position.exchange}|${position.token}`
  let currentLtp = positionLtps.value[symbolKey]
  if (currentLtp === undefined) {
    currentLtp = positionLtps.value[position.token]
  }
  const ltp = currentLtp ?? position.lastTradedPrice

  selectedQtyPosition.value = {
    ...position,
    lastTradedPrice: ltp,
  } as BrokerPosition
  showQtyModal.value = true
}

const handleQtyAdd = async (lots: number) => {
  if (!selectedQtyPosition.value?.broker) return

  const position = selectedQtyPosition.value
  const broker = position.broker
  const positionKey = getPositionKey(position)
  const lotSize = position.lotSize || 1
  const quantity = lots * lotSize

  try {
    addingQuantity.value.add(positionKey)

    const action = position.quantity > 0 ? 'BUY' : 'SELL'
    const symbolKey = `${position.exchange}|${position.token}`
    const ltp = positionLtps.value[symbolKey] || positionLtps.value[position.token]
    const orderType = ltp && ltp > 0 ? 'Market Protection' : 'MARKET'
    const price = ltp && ltp > 0 ? calculateProtectedPrice(ltp, action) : undefined

    await placeOrder(
      {
        action,
        symbol: position.symbol,
        expiry: '',
        segment: position.instrumentName,
        tradingSymbol: position.symbol,
        quantity,
        productType: position.productType,
        orderType,
        exchange: position.exchange,
        price,
      },
      position.broker!
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    await fetchPositionsForBroker(broker!)
    window.dispatchEvent(new Event('multi-order-placed'))
  } catch (error) {
    console.error('Failed to add quantity:', error)
  } finally {
    addingQuantity.value.delete(positionKey)
    showQtyModal.value = false
  }
}

const handleQtyRemove = async (lots: number) => {
  if (!selectedQtyPosition.value?.broker) return

  const position = selectedQtyPosition.value
  const broker = position.broker
  const positionKey = getPositionKey(position)
  const lotSize = position.lotSize || 1
  const quantity = lots * lotSize
  const absQuantity = Math.abs(position.quantity)

  if (quantity >= absQuantity) return

  try {
    removingQuantity.value.add(positionKey)

    const action = position.quantity > 0 ? 'SELL' : 'BUY'
    const symbolKey = `${position.exchange}|${position.token}`
    const ltp = positionLtps.value[symbolKey] || positionLtps.value[position.token]
    const orderType = ltp && ltp > 0 ? 'Market Protection' : 'MARKET'
    const price = ltp && ltp > 0 ? calculateProtectedPrice(ltp, action) : undefined

    await placeOrder(
      {
        action,
        symbol: position.symbol,
        expiry: '',
        segment: position.instrumentName,
        tradingSymbol: position.symbol,
        quantity,
        productType: position.productType,
        orderType,
        exchange: position.exchange,
        price,
      },
      position.broker!
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    await fetchPositionsForBroker(broker!)
    window.dispatchEvent(new Event('multi-order-placed'))
  } catch (error) {
    console.error('Failed to remove quantity:', error)
  } finally {
    removingQuantity.value.delete(positionKey)
    showQtyModal.value = false
  }
}
</script>

<template>
  <div class="col-12 m-0 table-responsive p-2">
    <!-- Add key to force re-render -->
    <div :key="updateTrigger">
      <div v-if="combinedErrorMessage" class="alert alert-danger" role="alert">
        {{ combinedErrorMessage }}
      </div>

      <!-- Loading State -->
      <template v-if="isAnyBrokerLoading">
        <div class="d-flex justify-content-center py-4">
          <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <template v-else-if="filteredPositions.length === 0">
        <div class="text-center text-muted py-4">No open positions</div>
      </template>

      <!-- Position Cards -->
      <template v-else>
        <div class="d-flex flex-column gap-2 mt-2">
          <div v-for="position in filteredPositions" :key="`${position.broker?.id}-${position.symbol}`"
            class="card overflow-hidden" :class="{
              'border-success': calculateUnrealizedPnL(position) > 0,
              'border-danger': calculateUnrealizedPnL(position) < 0,
            }">
            <div class="card-body bg-color-2 py-3 px-3">
              <!-- Row 1: Symbol, Option Type, Broker, Product Type, Unrealized P&L, Realized P&L, B.Avg, S.Avg -->
              <div class="d-flex flex-wrap align-items-center justify-content-start gap-5 mb-2">
                <!-- Symbol & Badges -->
                <div class="d-flex align-items-center gap-2">
                  <div>{{ position.symbol }}</div>
                  <span v-if="getOptionType(position.symbol) === 'CE'" class="badge bg-success">CE</span>
                  <span v-else-if="getOptionType(position.symbol) === 'PE'" class="badge bg-danger">PE</span>
                  <span class="badge bg-secondary">{{ position.productType }}</span>
                  <small class="text-muted text-truncate w-25">{{ position.broker?.name || '-' }}</small>
                  <!-- Trigger executing indicator -->
                  <span v-if="isPositionTriggerProcessing(position)"
                    class="badge bg-warning text-dark d-flex align-items-center gap-1">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    Executing
                  </span>
                </div>

                <!-- Unrealized P&L -->
                <div class="d-flex align-items-center">
                  <small class="text-muted">U.PnL</small>
                  <span class="ms-1 fw-bold" :class="{
                    'text-success': calculateUnrealizedPnL(position) >= 0,
                    'text-danger': calculateUnrealizedPnL(position) < 0,
                  }">
                    {{ calculateUnrealizedPnL(position).toFixed(2) }}
                  </span>
                </div>

                <!-- Realized P&L -->
                <div class="d-flex align-items-center">
                  <small class="text-muted">R.PnL</small>
                  <span class="ms-1 fw-bold" :class="{
                    'text-success': position.realizedPnL >= 0,
                    'text-danger': position.realizedPnL < 0,
                    'text-muted': position.realizedPnL === 0,
                  }">
                    {{ position.realizedPnL.toFixed(2) }}
                  </span>
                </div>

                <!-- Buy Avg -->
                <div class="d-flex align-items-center">
                  <small class="text-muted">B.Avg</small>
                  <span class="ms-1">{{ position.buyAverage.toFixed(2) }}</span>
                </div>

                <!-- Sell Avg -->
                <div class="d-flex align-items-center">
                  <small class="text-muted">S.Avg</small>
                  <span class="ms-1">{{ position.sellAverage.toFixed(2) }}</span>
                </div>
              </div>

              <!-- Row 2: LTP, Qty Controls, Stoploss & Target Controls, Exit Buttons -->
              <div v-if="position.quantity !== 0"
                class="d-flex flex-wrap align-items-center justify-content-between gap-3 border-top pt-2">
                <div class="d-flex flex-wrap align-items-center gap-5">
                  <!-- LTP -->
                  <div class="d-flex align-items-center">
                    <small class="text-muted">LTP</small>
                    <span class="ms-1 fw-bold" :class="{
                      'text-success': isLtpUp(position) === true,
                      'text-danger': isLtpUp(position) === false,
                    }">
                      {{ getPositionLtpFormatted(position) }}
                      <small v-if="getPositionChangePercent(position) !== null">
                        ({{ getPositionChangePercent(position)! >= 0 ? '+' : '' }}{{
                          getPositionChangePercent(position)!.toFixed(2) }}%)
                      </small>
                    </span>
                  </div>

                  <!-- Qty Controls -->
                  <div class="d-flex align-items-center">
                    <small class="text-muted">Qty</small>
                    <button class="btn btn-sm rounded-1 ms-1" :class="{
                      'btn-outline-success': position.quantity > 0,
                      'btn-outline-danger': position.quantity < 0,
                    }" @click="openQtyModal(position)"
                      :disabled="addingQuantity.has(getPositionKey(position)) || removingQuantity.has(getPositionKey(position))"
                      title="Adjust quantity">
                      <FontAwesomeIcon
                        v-if="addingQuantity.has(getPositionKey(position)) || removingQuantity.has(getPositionKey(position))"
                        icon="spinner" spin />
                      <span v-else class="fw-bold">{{ position.quantity }}</span>
                    </button>
                  </div>

                  <!-- Stoploss Controls -->
                  <div class="d-flex align-items-center gap-1">
                    <span class="text-muted">SL:</span>
                    <template v-if="stopLossEnabled">
                      <button v-if="!position.stopLoss && !position.trailingStopLoss"
                        class="btn btn-sm btn-outline-danger rounded-1" @click="openTriggerModal(position, 'stoploss')"
                        title="Add stoploss">
                        <FontAwesomeIcon icon="plus" />
                      </button>
                      <template v-else>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="decrementStopLoss(position)"
                          title="Decrease stoploss">
                          <FontAwesomeIcon icon="minus" />
                        </button>
                        <button class="btn btn-sm rounded-1"
                          :class="position.stopLoss ? 'btn-danger' : 'btn-outline-danger'"
                          @click="openTriggerModal(position, 'stoploss')">
                          {{ (position.stopLoss || position.trailingStopLoss || 0).toFixed(2) }}
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="incrementStopLoss(position)"
                          title="Increase stoploss">
                          <FontAwesomeIcon icon="plus" />
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="removeStopLoss(position)"
                          title="Remove stoploss">
                          <FontAwesomeIcon icon="xmark" />
                        </button>
                      </template>
                      <button class="btn btn-sm rounded-1"
                        :class="position.trailingStopLoss === null ? 'btn-outline-secondary' : 'btn-secondary'"
                        @click="toggleTrailingStoploss(position)"
                        :title="position.trailingStopLoss === null ? 'Switch to Trailing' : 'Switch to Static'">
                        {{ position.trailingStopLoss === null ? 'T' : 'S' }}
                      </button>
                    </template>
                    <span v-else class="text-muted">-</span>
                  </div>

                  <!-- Target Controls -->
                  <div class="d-flex align-items-center gap-1">
                    <span class="text-muted">TG:</span>
                    <template v-if="targetEnabled">
                      <button v-if="!position.target" class="btn btn-sm btn-outline-success rounded-1"
                        @click="openTriggerModal(position, 'target')" title="Add target">
                        <FontAwesomeIcon icon="plus" />
                      </button>
                      <template v-else>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="decrementTarget(position)"
                          title="Decrease target">
                          <FontAwesomeIcon icon="minus" />
                        </button>
                        <button class="btn btn-sm rounded-1"
                          :class="position.target ? 'btn-success' : 'btn-outline-success'"
                          @click="openTriggerModal(position, 'target')">
                          {{ (position.target || 0).toFixed(2) }}
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="incrementTarget(position)"
                          title="Increase target">
                          <FontAwesomeIcon icon="plus" />
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-1" @click="removeTarget(position)"
                          title="Remove target">
                          <FontAwesomeIcon icon="xmark" />
                        </button>
                      </template>
                    </template>
                    <span v-else class="text-muted">-</span>
                  </div>
                </div>

                <!-- Exit Buttons -->
                <div class="d-flex align-items-center gap-1">
                  <span class="text-muted">Exit:</span>
                  <div class="btn-group" role="group">
                    <button class="btn btn-outline-danger btn-sm" type="button"
                      @click="handlePartialClose(position, 25)"
                      :disabled="closingPositions.has(getPositionKey(position))" title="Exit 25%">
                      25%
                    </button>
                    <button class="btn btn-outline-danger btn-sm" type="button"
                      @click="handlePartialClose(position, 50)"
                      :disabled="closingPositions.has(getPositionKey(position))" title="Exit 50%">
                      50%
                    </button>
                    <button class="btn btn-outline-danger btn-sm" type="button"
                      @click="handlePartialClose(position, 75)"
                      :disabled="closingPositions.has(getPositionKey(position))" title="Exit 75%">
                      75%
                    </button>
                    <button class="btn btn-outline-danger btn-sm" type="button" @click="handleClosePosition(position)"
                      :disabled="closingPositions.has(getPositionKey(position))" title="Exit 100%">
                      <FontAwesomeIcon v-if="closingPositions.has(getPositionKey(position))" icon="spinner" spin />
                      <span v-else>100%</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Closed position: show LTP and trigger status -->
              <div v-else class="d-flex align-items-center gap-3 border-top pt-2">
                <!-- LTP -->
                <div class="d-flex align-items-center">
                  <small class="text-muted">LTP</small>
                  <span class="ms-1 fw-bold" :class="{
                    'text-success': isLtpUp(position) === true,
                    'text-danger': isLtpUp(position) === false,
                  }">
                    {{ getPositionLtpFormatted(position) }}
                  </span>
                </div>
                <small class="text-muted">Qty</small>
                <span class="text-muted">{{ position.quantity }}</span>
                <span v-if="getTriggerStatus(position, triggerValues) === 'stopLoss'" class="badge bg-danger">SL
                  Hit</span>
                <span v-else-if="getTriggerStatus(position, triggerValues) === 'target'" class="badge bg-success">TG
                  Hit</span>
                <span class="badge bg-secondary ms-auto">Closed</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
  <TriggerModal v-model:isOpen="showTriggerModal" :position="selectedPosition"
    :default-stop-loss="computedDefaultStopLoss || getDefaultStopLoss()" :default-target="computedDefaultTarget || 20"
    :trigger-type="selectedTriggerType" @save="handleTriggerSave" />
  <QtyControlModal v-model:isOpen="showQtyModal" :position="selectedQtyPosition" @add="handleQtyAdd"
    @remove="handleQtyRemove" />
</template>
