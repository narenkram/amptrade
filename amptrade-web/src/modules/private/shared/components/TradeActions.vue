<script setup lang="ts">
import type {
  InstrumentType,
  InstrumentContext,
  OrderContext,
  TradeActionPayload,
} from '@/modules/private/shared/types/trade'
import { ref, inject, type Ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useOrderManagement } from '@/modules/private/shared/composables/useOrderManagement'
import { useMultiBrokerPositions } from '@/modules/private/multibrokertrade/composables/useMultiBrokerPositions'
import LimitOrderModal from '@/modules/private/shared/components/LimitOrderModal.vue'
import { useLtp } from '@/modules/private/shared/composables/useLtp'
import { useShortcutKeys } from '@/modules/private/shared/composables/useShortcutKeys'
import { useOrders } from '@/modules/private/shared/composables/useOrders'
import type { Broker } from '@/modules/private/shared/types/broker'
import { calculateProtectedPrice } from '@/modules/utils/marketProtection'

/**
 * Trade mode types
 */
type TradeMode = 'multi'

/**
 * Component Props
 */
const props = withDefaults(
  defineProps<{
    mode: TradeMode
    type?: InstrumentType
    position?: 'left' | 'center' | 'right'
    showTradeButtons?: boolean
    showCloseButtons?: boolean
    shortcutsEnabled?: boolean
  }>(),
  {
    showTradeButtons: true,
    showCloseButtons: true,
    shortcutsEnabled: true,
  },
)

/**
 * Component Emits
 */
const emit = defineEmits<{
  (e: 'buy'): void
  (e: 'sell'): void
  (e: 'closeAll'): void
  (e: 'cancelOrders'): void
}>()

// Inject the consolidated contexts if available
const instrumentContext = inject<InstrumentContext | null>('instrumentContext', null)
const orderContext = inject<OrderContext | null>('orderContext', null)

// Inject selected brokers for multi-broker trading
const selectedBrokers = inject<Ref<Broker[]>>('selectedBrokers', ref([]))

// Fallback to legacy form data structure if needed
const tradeFormData = inject('tradeFormData') as {
  selectedSymbol: Ref<string>
  selectedExpiry: Ref<string>
  selectedSegment: Ref<string>
  totalQuantity: Ref<number>
}

// Get trading symbols either from context or individual injections
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

// Get order parameters
const productType = orderContext
  ? orderContext.productType
  : (inject('productType', ref('')) as Ref<string>)

const orderType = orderContext
  ? orderContext.orderType
  : (inject('orderType', ref('')) as Ref<string>)

const exchange = instrumentContext
  ? instrumentContext.selectedExchange
  : (inject('exchange', ref('')) as Ref<string>)

const quantity = orderContext ? orderContext.quantity : (inject('quantity', ref(0)) as Ref<number>)

// Get trading symbol for commodity products
const commodityFuturesTradingSymbol = inject(
  'commodityFuturesTradingSymbol',
  ref(''),
) as Ref<string>
const commodityOptionsCallSymbol = inject('commodityOptionsCallSymbol', ref('')) as Ref<string>
const commodityOptionsPutSymbol = inject('commodityOptionsPutSymbol', ref('')) as Ref<string>

// Inject instrument token refs from TradingInstrument component
// These are used for Upstox orders which require the instrumentKey (token)
const callInstrumentSymbolToken = inject('callInstrumentSymbolToken', ref('')) as Ref<string>
const putInstrumentSymbolToken = inject('putInstrumentSymbolToken', ref('')) as Ref<string>
const futuresInstrumentSymbolToken = inject('futuresInstrumentSymbolToken', ref('')) as Ref<string>
const equityInstrumentSymbolToken = inject('equityInstrumentSymbolToken', ref('')) as Ref<string>

// Update computed for the correct trading symbol based on type and segment
const tradingSymbol = computed(() => {
  const segment = instrumentContext
    ? instrumentContext.selectedSegment.value
    : tradeFormData.selectedSegment.value

  switch (props.type) {
    case 'CALL':
      return segment === 'Commodity Options'
        ? commodityOptionsCallSymbol.value
        : callTradingSymbol.value
    case 'PUT':
      return segment === 'Commodity Options'
        ? commodityOptionsPutSymbol.value
        : putTradingSymbol.value
    case 'FUT':
      return segment === 'Commodity Futures'
        ? commodityFuturesTradingSymbol.value
        : futuresTradingSymbol.value
    case 'EQ':
      return equityTradingSymbol.value
    default:
      return ''
  }
})

// Get the instrument token based on type (used by Upstox for instrumentKey)
const instrumentToken = computed(() => {
  switch (props.type) {
    case 'CALL':
      return callInstrumentSymbolToken.value
    case 'PUT':
      return putInstrumentSymbolToken.value
    case 'FUT':
      return futuresInstrumentSymbolToken.value
    case 'EQ':
      return equityInstrumentSymbolToken.value
    default:
      return ''
  }
})

/**
 * Button display text based on instrument type
 */
const getButtonText = (action: 'buy' | 'sell', type?: InstrumentType) => {
  if (!type) return action.toUpperCase()

  switch (type) {
    case 'CALL':
      return `${action.toUpperCase()} CE`
    case 'PUT':
      return `${action.toUpperCase()} PE`
    case 'FUT':
      return `${action.toUpperCase()} FUT`
    case 'EQ':
      return `${action.toUpperCase()} EQ`
    default:
      return action.toUpperCase()
  }
}

/**
 * Button icons and corresponding keyboard shortcuts based on instrument type
 */
const getButtonIcon = (action: 'buy' | 'sell', type?: InstrumentType) => {
  switch (type) {
    case 'CALL':
      return action === 'buy' ? 'arrow-up' : 'arrow-left'
    case 'PUT':
      return action === 'buy' ? 'arrow-down' : 'arrow-right'
    case 'FUT':
    case 'EQ':
      return action === 'buy' ? 'arrow-up' : 'arrow-down'
    default:
      return 'arrow-right'
  }
}

// Initialize composables based on mode
const { placeOrder: singlePlaceOrder, closeAllPositions, cancelAllOrders } = useOrderManagement()
const { allPositions, fetchAllPositions, positionLtps } = useMultiBrokerPositions()
const { orders, fetchOrders } = useOrders()

// Add refs for modals and loading states
const showLimitOrderModal = ref(false)
const pendingOrderDetails = ref<TradeActionPayload | null>(null)

// Multi-broker specific loading state
const multiLoadingStates = ref({
  buy: false,
  sell: false,
  closeAll: false,
  cancelOrders: false,
})

// Track completed operations for each broker (multi-broker mode)
const completedOperations = ref<Record<string, Record<string, boolean>>>({
  buy: {},
  sell: {},
  closeAll: {},
  cancelOrders: {},
})

// Track errors during multi-broker operations
const operationErrors = ref<Record<string, string[]>>({
  buy: [],
  sell: [],
  closeAll: [],
  cancelOrders: [],
})

const { getCurrentLtp } = useLtp(props.type)

// Computed properties for loading states
const currentLoadingStates = computed(() => {
  return multiLoadingStates.value
})

// Computed properties that vary by mode
const currentBrokers = computed(() => {
  return selectedBrokers.value
})

/**
 * Main action handler
 */
const handleAction = async (action: 'buy' | 'sell' | 'closeAll' | 'cancelOrders') => {
  console.log('Multi-broker action triggered:', action)
  await handleMultiBrokerAction(action)
}

/**
 * Multi-broker action handler
 */
const handleMultiBrokerAction = async (action: 'buy' | 'sell' | 'closeAll' | 'cancelOrders') => {
  if (selectedBrokers.value.length === 0) {
    console.error('No brokers selected')
    return
  }

  if (action === 'buy' || action === 'sell') {
    if (multiLoadingStates.value[action]) return

    if (!tradingSymbol.value) {
      console.error('No trading symbol selected')
      return
    }

    const payload = createTradePayload(action)
    if (!payload) return

    if (orderType.value === 'Limit') {
      pendingOrderDetails.value = payload
      showLimitOrderModal.value = true
      return
    } else if (orderType.value === 'Limit at LTP') {
      await placeMultiBrokerOrder({ ...payload, price: payload.ltp! }, payload.ltp!)
      return
    } else if (orderType.value === 'Market Protection') {
      // Calculate protected price based on action direction
      const protectedPrice = calculateProtectedPrice(payload.ltp!, payload.action)
      await placeMultiBrokerOrder({ ...payload, price: protectedPrice }, protectedPrice)
      return
    }

    await placeMultiBrokerOrder(payload)
  } else if (action === 'closeAll') {
    if (multiLoadingStates.value.closeAll) return

    try {
      multiLoadingStates.value.closeAll = true
      operationErrors.value.closeAll = []
      completedOperations.value.closeAll = {}

      const promises = selectedBrokers.value.map(async (broker) => {
        try {
          console.log(`Closing positions for broker: ${broker.name}`)
          await fetchAllPositions(selectedBrokers.value)

          const brokerPositions = allPositions.value.filter((pos) => pos.broker?.id === broker.id)
          if (!brokerPositions || brokerPositions.length === 0) {
            console.log(`No positions to close for broker: ${broker.name}`)
            completedOperations.value.closeAll[broker.id] = true
            return
          }

          const result = await closeAllPositions(brokerPositions, broker, orderType.value, positionLtps.value)
          console.log(`Close all result for ${broker.name}:`, result)
          completedOperations.value.closeAll[broker.id] = true

          await new Promise((resolve) => setTimeout(resolve, 1000))
          await fetchAllPositions(selectedBrokers.value)
        } catch (error) {
          console.error(`Error closing positions for broker ${broker.name}:`, error)
          operationErrors.value.closeAll.push(`${broker.name}: ${error}`)
          completedOperations.value.closeAll[broker.id] = false
        }
      })

      await Promise.all(promises)
      window.dispatchEvent(new Event('multi-order-closed'))
    } finally {
      multiLoadingStates.value.closeAll = false
    }
  } else if (action === 'cancelOrders') {
    if (multiLoadingStates.value.cancelOrders) return

    try {
      multiLoadingStates.value.cancelOrders = true
      operationErrors.value.cancelOrders = []
      completedOperations.value.cancelOrders = {}

      const promises = selectedBrokers.value.map(async (broker) => {
        try {
          console.log(`Cancelling orders for broker: ${broker.name}`)
          await fetchOrders(broker)

          if (!orders.value || orders.value.length === 0) {
            console.log(`No orders to cancel for broker: ${broker.name}`)
            completedOperations.value.cancelOrders[broker.id] = true
            return
          }

          const result = await cancelAllOrders(orders.value, broker)
          console.log(`Cancel all result for ${broker.name}:`, result)
          completedOperations.value.cancelOrders[broker.id] = true

          await new Promise((resolve) => setTimeout(resolve, 1000))
          await Promise.all([fetchOrders(broker), fetchAllPositions(selectedBrokers.value)])
        } catch (error) {
          console.error(`Error cancelling orders for broker ${broker.name}:`, error)
          operationErrors.value.cancelOrders.push(`${broker.name}: ${error}`)
          completedOperations.value.cancelOrders[broker.id] = false
        }
      })

      await Promise.all(promises)
      window.dispatchEvent(new Event('multi-orders-cancelled'))
      window.dispatchEvent(new Event('multi-positions-updated'))
    } catch (error) {
      console.error('Cancel orders failed:', error)
    } finally {
      multiLoadingStates.value.cancelOrders = false
    }
  }
}

/**
 * Create trade payload for regular trading
 */
const createTradePayload = (action: 'buy' | 'sell'): TradeActionPayload | null => {
  // Debug: Log all instrument token values
  console.log('[TradeActions] createTradePayload - instrumentToken debug:', {
    type: props.type,
    instrumentToken: instrumentToken.value,
    callToken: callInstrumentSymbolToken.value,
    putToken: putInstrumentSymbolToken.value,
    futToken: futuresInstrumentSymbolToken.value,
    eqToken: equityInstrumentSymbolToken.value,
  })

  const currentLtp = getCurrentLtp()

  if (currentLtp === null || currentLtp <= 0) {
    console.warn('Invalid LTP, order not placed')
    return null
  }

  if (
    (orderType.value === 'Limit' || orderType.value === 'Limit at LTP') &&
    (currentLtp === null || currentLtp <= 0)
  ) {
    console.warn('Invalid LTP, order not placed')
    return null
  }

  const isEquitySegment = tradeFormData.selectedSegment.value === 'Stocks Equity'

  return {
    action: action.toUpperCase() as 'BUY' | 'SELL',
    symbol: tradeFormData.selectedSymbol.value,
    expiry: tradeFormData.selectedExpiry.value,
    segment: tradeFormData.selectedSegment.value,
    tradingSymbol: tradingSymbol.value,
    instrumentType: props.type,
    quantity: isEquitySegment ? Number(quantity.value) : tradeFormData.totalQuantity.value,
    rawQuantity: Number(quantity.value),
    lotSize: isEquitySegment ? 1 : tradeFormData.totalQuantity.value / Number(quantity.value),
    productType: productType.value,
    orderType: orderType.value,
    exchange: exchange.value,
    ltp: currentLtp ?? undefined,
    token: instrumentToken.value || undefined, // Instrument token (required for Upstox as instrumentKey)
  }
}

/**
 * Place order for a single broker (used internally by multi-broker order placement)
 */
const placeSingleOrder = async (
  payload: TradeActionPayload,
  broker: Broker,
  limitPrice?: number,
) => {
  try {
    if (limitPrice !== undefined) {
      payload = { ...payload, price: limitPrice }
    }

    await singlePlaceOrder(payload, broker)
  } catch (error) {
    console.error('Order placement failed:', error)
    throw error
  }
}

/**
 * Place multi-broker order
 */
const placeMultiBrokerOrder = async (payload: TradeActionPayload, limitPrice?: number) => {
  try {
    if (limitPrice !== undefined) {
      payload = { ...payload, price: limitPrice }
    }

    multiLoadingStates.value[payload.action.toLowerCase() as 'buy' | 'sell'] = true
    operationErrors.value[payload.action.toLowerCase() as 'buy' | 'sell'] = []
    completedOperations.value[payload.action.toLowerCase() as 'buy' | 'sell'] = {}

    const promises = selectedBrokers.value.map(async (broker) => {
      try {
        console.log(`Placing ${payload.action} order for broker: ${broker.name}`)
        await placeSingleOrder(payload, broker, limitPrice)
        completedOperations.value[payload.action.toLowerCase() as 'buy' | 'sell'][broker.id] = true
      } catch (error) {
        console.error(`Error placing order for broker ${broker.name}:`, error)
        operationErrors.value[payload.action.toLowerCase() as 'buy' | 'sell'].push(
          `${broker.name}: ${error}`,
        )
        completedOperations.value[payload.action.toLowerCase() as 'buy' | 'sell'][broker.id] = false
      }
    })

    await Promise.all(promises)
    window.dispatchEvent(new Event('multi-order-placed'))

    if (payload.action.toLowerCase() === 'buy') {
      emit('buy')
    } else if (payload.action.toLowerCase() === 'sell') {
      emit('sell')
    }
  } catch (error) {
    console.error('Multi-broker order placement failed:', error)
  } finally {
    multiLoadingStates.value[payload.action.toLowerCase() as 'buy' | 'sell'] = false
  }
}

// Add handlers for the modal
const handleLimitOrderConfirm = (price: number, quantity: number) => {
  if (pendingOrderDetails.value) {
    const updatedPayload = {
      ...pendingOrderDetails.value,
      quantity,
    }

    switch (props.mode) {
      case 'multi':
        placeMultiBrokerOrder(updatedPayload as TradeActionPayload, price)
        break
    }
  }
  showLimitOrderModal.value = false
  pendingOrderDetails.value = null
}

const handleLimitOrderClose = () => {
  showLimitOrderModal.value = false
  pendingOrderDetails.value = null
}

// Setup trading shortcuts
const { setupTradingShortcuts } = useShortcutKeys()

setupTradingShortcuts({
  shortcutsEnabled: computed(() => props.shortcutsEnabled ?? true),
  type: props.type,
  handleAction,
  selectedSegment: tradeFormData.selectedSegment,
})

// Computed property to check if current segment is options
const isOptionsSegment = computed(() => {
  const segment = tradeFormData.selectedSegment?.value || ''
  return segment.includes('Options')
})

// Multi-broker specific helper functions
const getBrokerSuccessCount = (action: 'buy' | 'sell' | 'closeAll' | 'cancelOrders') => {
  return Object.values(completedOperations.value[action] || {}).filter((status) => status).length
}

const getStatusText = (action: 'buy' | 'sell' | 'closeAll' | 'cancelOrders') => {
  const successCount = getBrokerSuccessCount(action)
  return `${successCount}/${selectedBrokers.value.length}`
}

// Add event listeners for center position components
onMounted(() => {
  const handleCloseAll = (event: CustomEvent) => {
    if (props.position === 'center' && event.detail?.target === 'center') {
      handleAction('closeAll')
    }
  }

  const handleCancelOrders = (event: CustomEvent) => {
    if (props.position === 'center' && event.detail?.target === 'center') {
      handleAction('cancelOrders')
    }
  }

  window.addEventListener('shortcut-close-all', handleCloseAll as EventListener)
  window.addEventListener('shortcut-cancel-orders', handleCancelOrders as EventListener)

  onBeforeUnmount(() => {
    window.removeEventListener('shortcut-close-all', handleCloseAll as EventListener)
    window.removeEventListener('shortcut-cancel-orders', handleCancelOrders as EventListener)
  })
})
</script>

<template>
  <!-- Buy/Sell Buttons -->
  <div v-if="type && showTradeButtons" :class="[
    'col-6 col-md-4 col-lg-4',
    position === 'right' ? 'text-end' : '',
    `order-${position === 'left' ? '1' : '2'} order-md-${position === 'left' ? '1' : '3'} order-lg-${position === 'left' ? '1' : '3'}`,
  ]" :style="mode === 'multi'
    ? {
      display: 'flex',
      'flex-direction': 'column',
      'align-items': type === 'PUT' ? 'flex-end' : 'flex-start',
    }
    : {}
    ">
    <!-- Multi-broker layout with status indicators -->
    <template v-if="mode === 'multi'">
      <div class="input-group flex-nowrap my-2" :style="{ 'flex-direction': type === 'PUT' ? 'row-reverse' : 'row' }">
        <!-- Buy Button + Status -->
        <button type="button" :class="[
          'btn',
          type === 'PUT' ? 'rounded-start-0 rounded-end-1' : 'rounded-start-1 rounded-end-0',
          currentLoadingStates.buy ? 'btn-success-active' : 'btn-success',
        ]" @click="handleAction('buy')" :disabled="currentLoadingStates.buy || currentBrokers.length === 0">
          <div v-if="currentLoadingStates.buy" class="spinner-border spinner-border-sm me-1" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <template v-else>
            <kbd>
              <FontAwesomeIcon :icon="getButtonIcon('buy', type)" />
            </kbd>
          </template>
          {{ getButtonText('buy', type) }}
        </button>
        <span :class="[
          'input-group-text text-center',
          type === 'PUT' ? 'rounded-start-1 rounded-end-0' : 'rounded-0 rounded-end-1',
        ]">
          {{ getStatusText('buy') }}
        </span>
        <!-- Sell Button + Status -->
        <button type="button" :class="[
          'btn',
          type === 'PUT' ? 'me-2 rounded-start-0 rounded-end-1' : 'ms-2 rounded-start-1 rounded-end-0',
          currentLoadingStates.sell ? 'btn-danger-active' : 'btn-danger',
        ]" @click="handleAction('sell')" :disabled="currentLoadingStates.sell || currentBrokers.length === 0">
          <div v-if="currentLoadingStates.sell" class="spinner-border spinner-border-sm me-1" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <template v-else>
            <kbd>
              <FontAwesomeIcon :icon="getButtonIcon('sell', type)" />
            </kbd>
          </template>
          {{ getButtonText('sell', type) }}
        </button>
        <span :class="[
          'input-group-text text-center',
          type === 'PUT' ? 'rounded-1 rounded-end-0' : 'rounded-start-0 rounded-end-1',
        ]">
          {{ getStatusText('sell') }}
        </span>
      </div>
    </template>
  </div>

  <!-- Close & Cancel Buttons -->
  <div v-if="showCloseButtons && currentBrokers.length > 0" :class="[
    'col-12 col-md-4 col-lg-4',
    position === 'center' ? 'order-3 order-md-3 order-lg-3' : '',
  ]">
    <!-- Multi-broker layout with status indicators -->
    <div
      :class="['input-group', 'flex-nowrap', 'my-2', isOptionsSegment ? 'justify-content-center' : 'justify-content-end']">
      <!-- Close All Status + Button -->
      <span class="input-group-text text-center rounded-start-1 rounded-end-0">
        {{ getStatusText('closeAll') }}
      </span>
      <button :class="[
        'btn rounded-start-0 rounded-end-1',
        currentLoadingStates.closeAll ? 'btn-outline-active' : 'btn-outline',
      ]" @click="handleAction('closeAll')" :disabled="currentLoadingStates.closeAll || currentBrokers.length === 0">
        <div v-if="currentLoadingStates.closeAll" class="spinner-border spinner-border-sm me-1" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <template v-else>
          <kbd>F6</kbd>
        </template>
        Close All
      </button>
      <!-- Cancel All Button + Status -->
      <button :class="[
        'btn rounded-start-1 rounded-end-0 ms-2',
        currentLoadingStates.cancelOrders ? 'btn-outline-active' : 'btn-outline',
      ]" @click="handleAction('cancelOrders')"
        :disabled="currentLoadingStates.cancelOrders || currentBrokers.length === 0">
        <div v-if="currentLoadingStates.cancelOrders" class="spinner-border spinner-border-sm me-1" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <template v-else>
          <kbd>F9</kbd>
        </template>
        Cancel All
      </button>
      <span class="input-group-text text-center rounded-start-0 rounded-end-1">
        {{ getStatusText('cancelOrders') }}
      </span>
    </div>
  </div>

  <LimitOrderModal :show="showLimitOrderModal" :order-details="pendingOrderDetails" @close="handleLimitOrderClose"
    @confirm="handleLimitOrderConfirm" />
</template>

<style scoped>
.btn-success-active {
  background-color: #146c43;
}

.btn-danger-active {
  background-color: #b02a37;
}

.btn-outline-active {
  background-color: #e9ecef;
}

.spinner-border {
  width: 1rem;
  height: 1rem;
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
