<script setup lang="ts">
import { ref, watch, computed, inject, type Ref, onMounted, onUnmounted } from 'vue'
import { useOrders } from '@/modules/private/shared/composables/useOrders'
import { useResizableTable } from '@/modules/private/shared/composables/useResizableTable'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { Trade } from '@/modules/private/shared/types/trade'

// Define props for filters
const props = defineProps<{
  filterByBrokerType: string
  filterByClientId: string
}>()

// Inject selected brokers from parent component
const selectedBrokers = inject<Ref<Broker[]>>('selectedBrokers', ref([]))
const { isLoading, error } = useOrders()
const allTrades = ref<(Trade & { brokerName: string; broker: Broker })[]>([])
const updateTrigger = ref(0)
const { startResize } = useResizableTable()

// Helper function to remove duplicate trades
const removeDuplicateTrades = (trades: (Trade & { brokerName: string; broker: Broker })[]) => {
  const seenTradeKeys = new Set<string>()
  return trades.filter((trade) => {
    // Create a unique key for each trade based on its attributes
    const tradeKey = `${trade.brokerName}-${trade.tradeId || trade.orderId}-${trade.symbol}-${trade.side}-${trade.quantity}-${trade.tradeTimestamp}`
    // Only keep trades that haven't been seen before
    if (!seenTradeKeys.has(tradeKey)) {
      seenTradeKeys.add(tradeKey)
      return true
    }
    return false
  })
}

// Function to fetch trades for all selected brokers
const fetchAllTrades = async () => {
  if (!selectedBrokers.value || selectedBrokers.value.length === 0) {
    allTrades.value = []
    return
  }

  try {
    const tempTrades: (Trade & { brokerName: string; broker: Broker })[] = []

    // Fetch trades for each broker
    for (const broker of selectedBrokers.value) {
      try {
        // Create a new instance of useOrders for each broker to avoid state interference
        const { trades, fetchOrders } = useOrders()
        await fetchOrders(broker)

        // Add broker name and broker object to each trade
        if (trades.value && trades.value.length > 0) {
          const brokerTrades = trades.value.map((trade) => ({
            ...trade,
            brokerName: broker.name,
            broker: broker,
          }))
          tempTrades.push(...brokerTrades)
        }
      } catch (err) {
        console.error(`Error fetching trades for broker ${broker.name}:`, err)
      }
    }

    // Remove duplicates before assigning to allTrades
    const uniqueTrades = removeDuplicateTrades(tempTrades)

    // Sort trades by timestamp (newest first)
    uniqueTrades.sort(
      (a, b) => new Date(b.tradeTimestamp).getTime() - new Date(a.tradeTimestamp).getTime(),
    )

    allTrades.value = uniqueTrades
    updateTrigger.value++ // Increment to force re-render
  } catch (error) {
    console.error('Error fetching all trades:', error)
  }
}

// Create computed filteredTrades to apply filters
const filteredTrades = computed(() => {
  let filtered = allTrades.value

  // Apply broker type filter if selected
  if (props.filterByBrokerType) {
    filtered = filtered.filter((trade) => trade.broker?.type === props.filterByBrokerType)
  }

  // Apply client ID filter if selected
  if (props.filterByClientId) {
    filtered = filtered.filter((trade) => trade.broker?.clientId === props.filterByClientId)
  }

  return filtered
})

// Watch for broker changes
watch(
  selectedBrokers,
  async (newBrokers) => {
    if (newBrokers && newBrokers.length > 0) {
      await fetchAllTrades()
    } else {
      allTrades.value = []
    }
  },
  { immediate: true, deep: true },
)

// Handle order updates from WebSocket
const handleOrderUpdate = async () => {
  console.log('Order update received in MultiBrokerTradeBook')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (selectedBrokers.value && selectedBrokers.value.length > 0) {
    await fetchAllTrades()
  }
}

// Wrap the callback to satisfy TS types
const orderUpdateListener: EventListener = () => {
  handleOrderUpdate()
}

// Initial fetch on mount
onMounted(() => {
  // Fetch trades immediately
  fetchAllTrades()

  // Listen for order updates to refresh tradebook
  window.addEventListener('order-update', orderUpdateListener)
  window.addEventListener('multi-order-placed', orderUpdateListener)
  window.addEventListener('multi-positions-updated', orderUpdateListener)
})

onUnmounted(() => {
  // Clean up event listeners
  window.removeEventListener('order-update', orderUpdateListener)
  window.removeEventListener('multi-order-placed', orderUpdateListener)
  window.removeEventListener('multi-positions-updated', orderUpdateListener)
})

// Computed property for trade count
const tradeCount = computed(() => filteredTrades.value.length)

// Expose tradeCount for parent component to display in tab
defineExpose({
  tradeCount,
})
</script>

<template>
  <div class="col-12">
    <div :key="updateTrigger" class="m-0 table-responsive p-2">
      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      <table class="table table-striped table-hover table-bordered resizable-table"
        style="table-layout: auto; width: 100%">
        <thead>
          <tr>
            <th v-for="(column, index) in [
              'Time',
              'Broker',
              'Symbol',
              'Side',
              'Qty',
              'Price',
              'Value',
            ]" :key="index" scope="col" class="position-relative"
              style="width: auto; min-width: 50px; white-space: nowrap">
              {{ column }}
              <div class="resize-handle" @mousedown="
                (e: MouseEvent) => {
                  const parent = (e.target as HTMLElement).parentElement
                  if (parent) startResize(e, parent)
                }
              " @touchstart="
                (e: TouchEvent) => {
                  const parent = (e.target as HTMLElement).parentElement
                  if (parent) startResize(e, parent)
                }
              "></div>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="isLoading">
            <tr>
              <td colspan="7" class="text-center">
                <div class="spinner-border" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
              </td>
            </tr>
          </template>
          <template v-else-if="filteredTrades.length === 0">
            <tr>
              <td colspan="7" class="text-center text-muted">No trades found</td>
            </tr>
          </template>
          <template v-else>
            <tr v-for="(trade, index) in filteredTrades"
              :key="`${trade.brokerName}-${trade.tradeId || trade.orderId || index}`">
              <td>{{ new Date(trade.tradeTimestamp).toLocaleTimeString() }}</td>
              <td>{{ trade.brokerName }}</td>
              <td>{{ trade.symbol }}</td>
              <td>
                <span :class="trade.side === 'BUY' ? 'badge text-bg-success' : 'badge text-bg-danger'">{{ trade.side
                }}</span>
              </td>
              <td>{{ trade.quantity }}</td>
              <td>{{ trade.price?.toFixed(2) || '-' }}</td>
              <td>{{ trade.productType }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
