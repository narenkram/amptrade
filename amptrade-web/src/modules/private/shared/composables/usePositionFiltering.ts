import { computed, type ComputedRef } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'

/**
 * Generic position interface for filtering
 */
interface FilterablePosition {
  quantity: number
  exchange: string
  instrumentName?: string
  instrumentType?: string
  product?: string
  realizedPnL?: number
  realizedPnl?: number
  broker?: Broker
  [key: string]: unknown
}

/**
 * Position filtering options
 */
export interface PositionFilterOptions {
  positionFilter: string
  filterByBrokerType?: string
  filterByClientId?: string
}

/**
 * Shared composable for position filtering, sorting, and calculations
 * Eliminates duplication across SingleBroker and MultiBroker position components
 */
export function usePositionFiltering<T extends FilterablePosition>(
  positions: ComputedRef<T[]>,
  options: ComputedRef<PositionFilterOptions>
) {

  /**
   * Filter positions by instrument type (EQUITY/FNO/ALL)
   */
  const instrumentFilteredPositions = computed(() => {
    const filter = options.value.positionFilter

    if (filter === 'ALL') {
      return positions.value
    }

    return positions.value.filter((position) => {
      if (filter === 'EQUITY') {
        // Check for equity instruments
        return (
          (position.exchange === 'NSE' ||
           position.exchange === 'BSE' ||
           position.exchange === 'MCX') &&
          (position.instrumentName === 'EQ' || position.instrumentType === 'EQ')
        )
      }

      if (filter === 'FNO') {
        // Check for F&O instruments
        return (
          (position.exchange === 'NFO' || position.exchange === 'BFO') &&
          (
            ['OPTIDX', 'OPTSTK', 'FUTIDX', 'FUTSTK'].includes(position.instrumentName || '') ||
            ['FUT', 'CALL', 'PUT'].includes(position.instrumentType || '')
          )
        )
      }

      return true
    })
  })

  /**
   * Apply broker-specific filtering (for multi-broker components)
   */
  const brokerFilteredPositions = computed(() => {
    let filtered = instrumentFilteredPositions.value

    // Apply broker type filter if specified
    if (options.value.filterByBrokerType) {
      filtered = filtered.filter((position) => {
        return position.broker?.type === options.value.filterByBrokerType
      })
    }

    // Apply client ID filter if specified
    if (options.value.filterByClientId) {
      filtered = filtered.filter((position) => {
        return position.broker?.clientId === options.value.filterByClientId
      })
    }

    return filtered
  })

  /**
   * Final filtered and sorted positions
   */
  const filteredPositions = computed(() => {
    return brokerFilteredPositions.value.sort((a, b) => {
      const aQty = Math.abs(a.quantity)
      const bQty = Math.abs(b.quantity)

      // If one is open and other is closed, open comes first
      if ((aQty === 0) !== (bQty === 0)) {
        return aQty === 0 ? 1 : -1
      }

      // For multi-broker, group by broker
      if (a.broker?.id !== b.broker?.id) {
        return (a.broker?.name || '').localeCompare(b.broker?.name || '')
      }

      // If both are open or both are closed, sort by absolute quantity
      return bQty - aQty
    })
  })

  /**
   * Total net quantity (sum of absolute quantities)
   */
  const totalNetQuantity = computed(() => {
    return positions.value.reduce((sum, position) => {
      return sum + Math.abs(position.quantity)
    }, 0)
  })

  /**
   * Total realized P&L
   */
  const totalRealizedPnL = computed(() => {
    return positions.value.reduce((sum, position) => {
      const realizedPnL = position.realizedPnL ?? position.realizedPnl ?? 0
      return sum + realizedPnL
    }, 0)
  })

  return {
    filteredPositions,
    totalNetQuantity,
    totalRealizedPnL,
    instrumentFilteredPositions,
    brokerFilteredPositions
  }
}

/**
 * Standardized error handling for position composables
 */
export function createStandardizedErrorHandler() {
  return {
    handleError: (error: unknown, context: string): string => {
      console.error(`Error in ${context}:`, error)

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string } } }
        return axiosError.response?.data?.message || `Failed to ${context}`
      }

      if (error instanceof Error) {
        return error.message
      }

      return `Failed to ${context}`
    }
  }
}
