import { computed, type Ref } from 'vue'
import { calcUnrealizedPnL } from '@/modules/private/shared/utils/triggerUtils'

export interface MtmCalculationOptions {
  positions: Ref<Array<{
    quantity: number
    buyAverage?: number
    sellAverage?: number
    averagePrice?: number
    realizedPnL?: number
    realizedPnl?: number
    lastTradedPrice?: number
    lastPrice?: number
    exchange: string
    token: string
  }>>
  positionLtps: Ref<Record<string, number>>
}

/**
 * Shared composable for standardized MTM calculations
 * Eliminates duplication across position components
 */
export function usePositionMtm(options: MtmCalculationOptions) {
  // Calculate unrealized P&L for a single position
  const calculatePositionUnrealizedPnL = (position: {
    quantity: number
    buyAverage?: number
    sellAverage?: number
    averagePrice?: number
    lastTradedPrice?: number
    lastPrice?: number
    exchange: string
    token: string
  }) => {
    // Standardize the position structure for the utility function
    const standardizedPosition = {
      quantity: position.quantity,
      buyAverage: position.buyAverage || position.averagePrice || 0,
      sellAverage: position.sellAverage || position.averagePrice || 0,
      lastTradedPrice: position.lastTradedPrice || position.lastPrice || 0,
      exchange: position.exchange,
      token: position.token
    }

    return calcUnrealizedPnL(standardizedPosition, options.positionLtps.value)
  }

  // Get realized P&L for a position (standardize the property name)
  const getPositionRealizedPnL = (position: {
    realizedPnL?: number
    realizedPnl?: number
  }) => {
    return position.realizedPnL ?? position.realizedPnl ?? 0
  }

  // Add computed property for total net quantity
  const totalNetQuantity = computed(() => {
    return options.positions.value.reduce((sum, position) => {
      // Use Math.abs() to get absolute value of each position quantity
      return sum + Math.abs(position.quantity)
    }, 0)
  })

  // Add computed property for total unrealized P&L
  const totalUnrealizedPnL = computed(() => {
    return options.positions.value.reduce((sum, position) => {
      return sum + calculatePositionUnrealizedPnL(position)
    }, 0)
  })

  // Add computed property for total realized P&L
  const totalRealizedPnL = computed(() => {
    return options.positions.value.reduce((sum, position) => {
      return sum + getPositionRealizedPnL(position)
    }, 0)
  })

  // Add computed property for total MTM (realized + unrealized)
  const totalMtm = computed(() => {
    return totalRealizedPnL.value + totalUnrealizedPnL.value
  })

  return {
    // Individual position calculations
    calculatePositionUnrealizedPnL,
    getPositionRealizedPnL,

    // Aggregated calculations
    totalNetQuantity,
    totalUnrealizedPnL,
    totalRealizedPnL,
    totalMtm,
  }
}
