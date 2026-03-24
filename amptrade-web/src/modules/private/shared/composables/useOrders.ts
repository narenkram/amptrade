import { ref } from 'vue'
import type { Order, Trade } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'
import api from '@/modules/common/api/axios'
import { getOrderAdapter } from '@/modules/private/shared/adapters/orderAdapters'
import { logger } from '@/modules/utils/logger'

// Create a shared state for orders and trades
const orders = ref<Array<Order>>([])
const trades = ref<Array<Trade>>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useOrders() {
  const fetchOrders = async (broker: Broker | null) => {
    logger.log('Fetching orders for broker:', broker?.type, broker?.clientId)
    if (!broker) {
      orders.value = []
      trades.value = []
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const response = await api.get(
        `${import.meta.env.VITE_API_URL}/${broker.type}/getOrdersAndTrades`,
        {
          params: {
            [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
            [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
          },
        },
      )

      logger.log('Raw response data for', broker.type, ':', response.data)

      const adapter = getOrderAdapter(broker)
      logger.log('Using adapter for broker type:', broker.type)

      const transformedRecords = adapter.transform(response.data)
      logger.log('Transformed records:', transformedRecords)

      // Update the shared state
      orders.value = transformedRecords.filter(
        (record): record is Order => record.recordType === 'order',
      )
      trades.value = transformedRecords.filter(
        (record): record is Trade => record.recordType === 'trade',
      )

      logger.log('Filtered orders:', orders.value.length, 'trades:', trades.value.length)
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        error.value =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to fetch orders'
        logger.error('Axios error:', {
          status: (err as { response?: { status?: number } }).response?.status,
          data: (err as { response?: { data?: unknown } }).response?.data,
        })
      } else {
        error.value = 'Failed to fetch orders'
        logger.error('Non-axios error:', err)
      }
    } finally {
      isLoading.value = false
    }
  }

  return {
    orders,
    trades,
    isLoading,
    error,
    fetchOrders,
  }
}
