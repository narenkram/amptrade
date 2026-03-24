<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, inject, type Ref } from 'vue'
import { useOrders } from '@/modules/private/shared/composables/useOrders'
import { useOrderManagement } from '@/modules/private/shared/composables/useOrderManagement'
import { useResizableTable } from '@/modules/private/shared/composables/useResizableTable'
import BulkEditOrdersModal from '@/modules/private/shared/components/BulkEditOrdersModal.vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { Order } from '@/modules/private/shared/types/trade'

// Define extended Order type that includes broker information
interface OrderWithBroker extends Order {
  broker?: Broker
}

// Define props for filters
const props = defineProps<{
  filterByBrokerType: string
  filterByClientId: string
}>()

// Get selected brokers from parent component via injection
const selectedBrokers = inject<Ref<Broker[]>>('selectedBrokers', ref([]))
const { orders, error, fetchOrders } = useOrders()
const { cancelOrder } = useOrderManagement()
const updateTrigger = ref(0)
const { startResize } = useResizableTable()

// Store all orders from all brokers
const allOrders = ref<OrderWithBroker[]>([])

// Store loading state for each broker
const brokerLoadingStates = ref<Record<string, boolean>>({})

// Add these refs for toast management
const showToast = ref(false)
const toastMessage = ref('')

// Bulk edit modal state
const showBulkEditModal = ref(false)
const selectedOrderIds = ref<Set<string>>(new Set())


// Pending orders that can be selected for bulk edit
const pendingOrders = computed(() => {
  return filteredOrders.value.filter((order) =>
    ['OPEN', 'PENDING', 'TRIGGER_PENDING'].includes(order.status),
  )
})

// Selected orders for bulk edit
const selectedOrders = computed(() => {
  return pendingOrders.value.filter((order) => selectedOrderIds.value.has(order.orderId))
})

// Toggle order selection
const toggleOrderSelection = (orderId: string) => {
  if (selectedOrderIds.value.has(orderId)) {
    selectedOrderIds.value.delete(orderId)
  } else {
    selectedOrderIds.value.add(orderId)
  }
}

// Select all pending orders
const selectAllPending = () => {
  if (selectedOrderIds.value.size === pendingOrders.value.length) {
    selectedOrderIds.value.clear()
  } else {
    selectedOrderIds.value = new Set(pendingOrders.value.map((o) => o.orderId))
  }
}

// Check if an order is pending
const isOrderPending = (order: OrderWithBroker) => {
  return ['OPEN', 'PENDING', 'TRIGGER_PENDING'].includes(order.status)
}

// Handle bulk edit button click
const handleBulkEdit = () => {
  if (selectedOrders.value.length > 0) {
    showBulkEditModal.value = true
  }
}

// Handle orders modified event from modal
const handleOrdersModified = async () => {
  selectedOrderIds.value.clear()
  await fetchAllOrders()
}

// Add function to handle rejection reason click
const showRejectionReason = (reason: string) => {
  toastMessage.value = reason
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 3500)
}

// Create computed filteredOrders to apply filters
const filteredOrders = computed(() => {
  let filtered = allOrders.value

  // Apply broker type filter if selected
  if (props.filterByBrokerType) {
    filtered = filtered.filter((order) => order.broker?.type === props.filterByBrokerType)
  }

  // Apply client ID filter if selected
  if (props.filterByClientId) {
    filtered = filtered.filter((order) => order.broker?.clientId === props.filterByClientId)
  }

  // Sort orders: pending orders first, then by timestamp descending
  const pendingStatuses = ['OPEN', 'PENDING', 'TRIGGER_PENDING']
  return [...filtered].sort((a, b) => {
    const aIsPending = pendingStatuses.includes(a.status)
    const bIsPending = pendingStatuses.includes(b.status)

    // Pending orders come first
    if (aIsPending && !bIsPending) return -1
    if (!aIsPending && bIsPending) return 1

    // Within the same group, sort by timestamp descending (most recent first)
    return new Date(b.orderTimestamp).getTime() - new Date(a.orderTimestamp).getTime()
  })
})

// Add computed properties for order statistics based on filtered orders
const orderStats = computed(() => {
  return {
    total: filteredOrders.value.length,
    pending: filteredOrders.value.filter((order) =>
      ['OPEN', 'PENDING', 'TRIGGER_PENDING'].includes(order.status),
    ).length,
    completed: filteredOrders.value.filter((order) => order.status === 'COMPLETE').length,
    rejected: filteredOrders.value.filter((order) => order.status === 'REJECTED').length,
    cancelled: filteredOrders.value.filter((order) => order.status === 'CANCELLED').length,
  }
})

const handleCancelOrder = async (orderId: string, broker: Broker) => {
  try {
    await cancelOrder(orderId, broker)
    // Order cancellation will trigger the 'orders-cancelled' event
    // which will refresh the orders
  } catch (error) {
    console.error('Failed to cancel order:', error)
  }
}

// Helper function to remove duplicate orders
const removeDuplicateOrders = (orders: OrderWithBroker[]): OrderWithBroker[] => {
  const seenOrderKeys = new Set<string>()
  return orders.filter((order) => {
    // Create a unique key for each order based on its attributes
    const orderKey = `${order.broker?.clientId}-${order.symbol}-${order.side}-${order.quantity}-${order.orderTimestamp}`
    // Only keep orders that haven't been seen before
    if (!seenOrderKeys.has(orderKey)) {
      seenOrderKeys.add(orderKey)
      return true
    }
    return false
  })
}

// Function to fetch orders from all brokers
const fetchAllOrders = async () => {
  if (!selectedBrokers.value || selectedBrokers.value.length === 0) {
    allOrders.value = []
    return
  }

  const tempOrders: OrderWithBroker[] = []

  // Fetch orders for each broker
  for (const broker of selectedBrokers.value) {
    brokerLoadingStates.value[broker.clientId] = true
    try {
      await fetchOrders(broker)
      // Add the broker info to each order for identification
      const brokersOrders = orders.value.map((order) => ({
        ...order,
        broker: broker,
      })) as OrderWithBroker[]
      tempOrders.push(...brokersOrders)
    } catch (err) {
      console.error(`Failed to fetch orders for broker ${broker.name}:`, err)
    } finally {
      brokerLoadingStates.value[broker.clientId] = false
    }
  }

  // Remove duplicate orders before setting to allOrders
  allOrders.value = removeDuplicateOrders(tempOrders)
}

// Watch for broker selection changes
watch(
  selectedBrokers,
  async (newBrokers) => {
    if (newBrokers && newBrokers.length > 0) {
      await fetchAllOrders()
    } else {
      allOrders.value = []
    }
  },
  { deep: true },
)

const handleOrderUpdate = async (event: CustomEvent) => {
  console.log('Order update received:', event.detail)
  // Refresh the orders for all brokers
  await fetchAllOrders()
  // Dispatch event to refresh positions in MultiBrokerPositions.vue
  window.dispatchEvent(new Event('multi-positions-updated'))
}

// Wrap the callback to satisfy TS types
const orderUpdateListener = (event: Event) => handleOrderUpdate(event as CustomEvent)

onMounted(() => {
  window.addEventListener('order-update', orderUpdateListener)
  // Initial fetch of orders
  fetchAllOrders()
})

onUnmounted(() => {
  window.removeEventListener('order-update', orderUpdateListener)
})

// Expose orderStats for parent component to display pending count in tab
defineExpose({
  orderStats,
})
</script>

<template>
  <div class="col-12">
    <!-- Add toast component at the top -->
    <div class="toast-container position-fixed top-50 start-50 translate-middle p-3">
      <div class="toast bg-color-2" :class="{ show: showToast }" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header">
          <strong class="me-auto">Order Rejection</strong>
          <button type="button" class="btn-close" @click="showToast = false" aria-label="Close"></button>
        </div>
        <div class="toast-body text-danger">
          {{ toastMessage }}
        </div>
      </div>
    </div>

    <div :key="updateTrigger">
      <div v-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      <!-- Order Statistics and Edit Button -->
      <div class="d-flex flex-wrap gap-3 mb-2 small justify-content-between align-items-center">
        <button v-if="selectedOrders.length > 0" class="btn btn-sm btn-outline" @click="handleBulkEdit">
          Edit {{ selectedOrders.length }} Order{{ selectedOrders.length > 1 ? 's' : '' }}
        </button>
        <div class="d-flex flex-wrap gap-3 justify-content-around align-items-center flex-grow-1">
          <span>Total: <b>{{ orderStats.total }}</b></span>
          <span>Pending: <b class="text-warning">{{ orderStats.pending }}</b></span>
          <span>Completed: <b class="text-success">{{ orderStats.completed }}</b></span>
          <span>Rejected: <b class="text-danger">{{ orderStats.rejected }}</b></span>
          <span>Cancelled: <b class="text-secondary">{{ orderStats.cancelled }}</b></span>
        </div>
      </div>

      <div class="m-0 table-responsive p-2">
        <table class="table table-striped table-hover table-bordered resizable-table"
          style="table-layout: auto; width: 100%">
          <thead>
            <tr>
              <!-- Checkbox column header -->
              <th scope="col" class="text-center" style="width: 40px">
                <input type="checkbox" class="form-check-input"
                  :checked="pendingOrders.length > 0 && selectedOrderIds.size === pendingOrders.length"
                  :indeterminate="selectedOrderIds.size > 0 && selectedOrderIds.size < pendingOrders.length"
                  @change="selectAllPending" :disabled="pendingOrders.length === 0" title="Select all pending orders" />
              </th>
              <th v-for="column in [
                'Time',
                'Broker',
                'Symbol',
                'Price Type',
                'Side',
                'Qty',
                'Filled',
                'Price/Avg',
                'Status',
                'Product',
                'Action',
              ]" :key="column" scope="col" class="position-relative"
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
            <template v-if="Object.values(brokerLoadingStates).some((loading) => loading)">
              <tr>
                <td colspan="12" class="text-center">
                  <div class="spinner-border" role="status">
                    <span class="visually-hidden">Loading...</span>
                  </div>
                </td>
              </tr>
            </template>
            <template v-else-if="filteredOrders.length === 0">
              <tr>
                <td colspan="12" class="text-center text-muted">No orders found</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="order in filteredOrders" :key="`${order.broker?.id}-${order.orderId}`">
                <!-- Checkbox cell -->
                <td class="text-center">
                  <input v-if="isOrderPending(order)" type="checkbox" class="form-check-input"
                    :checked="selectedOrderIds.has(order.orderId)" @change="toggleOrderSelection(order.orderId)" />
                  <span v-else class="text-muted">-</span>
                </td>
                <td>{{ new Date(order.orderTimestamp).toLocaleTimeString() }}</td>
                <td>{{ order.broker?.name }}</td>
                <td>{{ order.symbol }}</td>

                <td>{{ order.orderType }}</td>
                <td>
                  <span :class="order.side === 'BUY' ? 'badge text-bg-success' : 'badge text-bg-danger'">{{ order.side
                  }}</span>
                </td>
                <td>{{ order.quantity }}</td>
                <td>{{ order.filledQuantity }}</td>
                <td>
                  {{
                    ['OPEN', 'PENDING', 'TRIGGER_PENDING'].includes(order.status)
                      ? order.price?.toFixed(2)
                      : order.averagePrice?.toFixed(2) || '-'
                  }}
                </td>
                <td>
                  <span :class="{
                    'text-success': order.status === 'COMPLETE',
                    'text-danger text-decoration-underline': order.status === 'REJECTED',
                    'text-primary': ['OPEN', 'PENDING'].includes(order.status),
                  }" :title="order.status === 'REJECTED' ? order.rejectionReason : ''" style="cursor: help" @click="
                    order.status === 'REJECTED' && order.rejectionReason
                      ? showRejectionReason(order.rejectionReason)
                      : null
                    ">{{ order.status }}</span>
                </td>
                <td>{{ order.productType }}</td>
                <td v-if="['OPEN', 'TRIGGER_PENDING'].includes(order.status) && order.broker">
                  <button class="btn btn-sm btn-outline-danger" @click="handleCancelOrder(order.orderId, order.broker)">
                    Cancel
                  </button>
                </td>
                <td v-else>-</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bulk Edit Modal -->
    <BulkEditOrdersModal v-model:isOpen="showBulkEditModal" :orders="selectedOrders"
      @orders-modified="handleOrdersModified" />
  </div>
</template>

<style scoped>
.toast {
  opacity: 0;
  transition: opacity 0.15s linear;
}

.toast.show {
  opacity: 1;
}
</style>
