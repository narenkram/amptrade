import { ref, computed } from 'vue'
import type { Position } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'
import api from '@/modules/common/api/axios'
import { getPositionAdapter } from '@/modules/private/shared/adapters/positionAdapters'
import { enrichPositionWithTriggers, createStandardizedUpdatePositionHandler } from '@/modules/private/shared/utils/triggerUtils'

// Define an extended Position type with broker property
export interface BrokerPosition extends Position {
  broker?: Broker
}

// Singleton shared state - persists across all components using this composable
const allPositionsByBroker = ref<Record<string, BrokerPosition[]>>({})
const isLoadingByBroker = ref<Record<string, boolean>>({})
const errorByBroker = ref<Record<string, string | null>>({})
const updateTrigger = ref(0)
const positionLtps = ref<Record<string, number>>({})

export function useMultiBrokerPositions() {

  // Create our own fetchPositions function
  const fetchPositionsForBroker = async (broker: Broker): Promise<Position[]> => {
    if (!broker) return []

    try {
      const response = await api.get(
        `${import.meta.env.VITE_API_URL}/${broker.type}/getPositionBook`,
        {
          params: {
            [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
            [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
          },
        },
      )

      // Use the appropriate adapter to transform the data
      const adapter = getPositionAdapter(broker)
      const transformedPositions = adapter.transform(response.data)

      // Load saved triggers and apply them to positions using DRY helper
      const savedTriggers = JSON.parse(localStorage.getItem('steadfast:position_triggers') || '{}')

      // Add broker info to positions BEFORE enriching so trigger lookup can use brokerId|symbol key
      const positionsWithBroker = transformedPositions.map((pos) => ({
        ...pos,
        broker,
      }))

      const positionsWithTriggers = positionsWithBroker.map((position) =>
        enrichPositionWithTriggers(position, savedTriggers),
      )

      return positionsWithTriggers

    } catch (err) {
      console.error('Error fetching positions:', err)
      throw err
    }
  }

  // Fetch positions for all selected brokers
  const fetchAllPositions = async (brokers: Broker[]) => {
    if (brokers.length === 0) return

    const promises = brokers.map(async (broker) => {
      try {
        isLoadingByBroker.value[broker.id] = true
        errorByBroker.value[broker.id] = null

        const fetchedPositions = await fetchPositionsForBroker(broker)
        // Broker is already added in fetchPositionsForBroker, just cast
        allPositionsByBroker.value[broker.id] = fetchedPositions as BrokerPosition[]

      } catch (err) {
        console.error(`Error fetching positions for broker ${broker.name}:`, err)
        errorByBroker.value[broker.id] = `Failed to load positions: ${err}`
        allPositionsByBroker.value[broker.id] = []
      } finally {
        isLoadingByBroker.value[broker.id] = false
      }
    })

    await Promise.all(promises)
    updateTrigger.value++

    return allPositionsByBroker.value
  }

  // Create standardized updatePosition handler
  const updatePosition = createStandardizedUpdatePositionHandler({
    findAndUpdatePosition: async (symbol: string, updates: Record<string, unknown>) => {
      // For multi-broker, we need to find the position across all brokers
      let foundPosition = false
      for (const positions of Object.values(allPositionsByBroker.value)) {
        const position = positions.find((p) => p.symbol === symbol)
        if (position) {
          // Update the position with new values
          Object.assign(position, updates)
          foundPosition = true
          break
        }
      }

      if (!foundPosition) {
        throw new Error(`Position not found for symbol: ${symbol}`)
      }
    }
  })

  // Get all positions across all brokers
  const allPositions = computed<BrokerPosition[]>(() => {
    return Object.values(allPositionsByBroker.value).flat()
  })

  // Add computed property for total net quantity
  const totalNetQuantity = computed(() => {
    return (
      allPositions.value?.reduce((sum, position) => {
        // Use Math.abs() to get absolute value of each position quantity
        return sum + Math.abs(position.quantity)
      }, 0) ?? 0
    )
  })

  // Reset the state for a new set of brokers
  const resetPositionsState = (brokers: Broker[]) => {
    allPositionsByBroker.value = {}
    brokers.forEach((broker) => {
      allPositionsByBroker.value[broker.id] = []
      isLoadingByBroker.value[broker.id] = false
      errorByBroker.value[broker.id] = null
    })
  }

  // Update local position data without API call
  const updatePositionLocal = (position: BrokerPosition, type: string, newVal: number) => {
    if (!position.broker) return

    const brokerPositions = allPositionsByBroker.value[position.broker.id] || []
    const pos = brokerPositions.find((p) => p.symbol === position.symbol)

    if (pos) {
      if (type === 'stoploss') {
        // Ensure we update the static stopLoss (and clear trailing mode)
        pos.stopLoss = newVal
        pos.trailingStopLoss = null
      } else if (type === 'target') {
        pos.target = newVal
      }
    }
  }

  // Add computed for loading state
  const isAnyBrokerLoading = computed(() => {
    return Object.values(isLoadingByBroker.value).some((loading) => loading)
  })

  // Get combined error message
  const combinedErrorMessage = computed(() => {
    const errors = Object.entries(errorByBroker.value)
      .filter(([, error]) => error)
      .map(([brokerId, error]) => {
        const broker = Object.values(allPositionsByBroker.value)
          .flatMap((positions) => positions.map((p) => p.broker))
          .find((b) => b?.id === brokerId)
        return `${broker?.name || 'Unknown broker'}: ${error}`
      })

    return errors.length > 0 ? errors.join('; ') : null
  })

  return {
    allPositionsByBroker,
    isLoadingByBroker,
    errorByBroker,
    updateTrigger,
    positionLtps,
    fetchPositionsForBroker,
    fetchAllPositions,
    updatePosition,
    updatePositionLocal,
    resetPositionsState,
    allPositions,
    totalNetQuantity,
    isAnyBrokerLoading,
    combinedErrorMessage,
  }
}
