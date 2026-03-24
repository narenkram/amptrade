import { ref, computed, watch, type Ref } from 'vue'
import { useStoplossTarget } from '@/modules/private/shared/composables/useStoplossTarget'
import {
  getDefaultStopLoss,
  getDefaultTarget,
} from '@/modules/private/shared/composables/useStoplossTarget'
import { getTriggerKey, type UnifiedPosition } from '@/modules/private/shared/utils/triggerUtils'
import { logger } from '@/modules/utils/logger'

export interface TriggerModalOptions {
  positionLtps: Ref<Record<string, number>>
  updatePosition: (symbol: string, updates: Record<string, unknown>, broker?: unknown) => Promise<void>
  defaultStopLoss?: number
  defaultTarget?: number
}

export function usePositionTriggerModal<T extends UnifiedPosition>(options: TriggerModalOptions) {
  const { setTriggers } = useStoplossTarget()

  // Modal state
  const showTriggerModal = ref(false)
  const selectedPosition = ref<T | null>(null)
  const selectedTriggerType = ref<'stoploss' | 'target'>('stoploss')

  // Computed defaults
  const computedDefaultStopLoss = computed(() =>
    typeof options.defaultStopLoss === 'number' ? options.defaultStopLoss : getDefaultStopLoss(),
  )

  const computedDefaultTarget = computed(() =>
    typeof options.defaultTarget === 'number' ? options.defaultTarget : getDefaultTarget(),
  )

  // Open trigger modal with current LTP
  const openTriggerModal = (position: T, triggerType: 'stoploss' | 'target') => {
    const symbolKey = `${position.exchange}|${position.token}`

    // First try with exchange|token format
    let currentLtp = options.positionLtps.value[symbolKey]

    // If not found, try token-only format (for Zerodha)
    if (currentLtp === undefined) {
      currentLtp = options.positionLtps.value[position.token]
    }

    // Fall back to position's lastTradedPrice if still not found
    const ltp = currentLtp ?? position.lastTradedPrice

    // Update position with current LTP
    selectedPosition.value = {
      ...position,
      lastTradedPrice: ltp,
    } as T

    selectedTriggerType.value = triggerType
    showTriggerModal.value = true
  }

  // Handle trigger save with standardized key generation
  const handleTriggerSave = async (type: string, value: number | null) => {
    if (!selectedPosition.value) return

    try {
      const position = selectedPosition.value
      const symbol = position.symbol ?? position.tradingSymbol ?? ''

      await options.updatePosition(symbol, {
        [type]: value,
      }, position.broker)

      // Get the correct trigger key based on position type using the utility
      const triggerKey = getTriggerKey(position)

      logger.debug('Setting triggers:', {
        symbol,
        triggerKey,
        type,
        value,
      })

      // Update local triggers with standardized key
      setTriggers(triggerKey, {
        [type]: value,
      })
    } catch (error) {
      logger.error(`Failed to save ${type}:`, error)
    }
  }

  // Watch for positionLtps changes to update selectedPosition's LTP
  watch(
    options.positionLtps,
    (newLtps) => {
      if (selectedPosition.value && showTriggerModal.value) {
        const position = selectedPosition.value
        const symbolKey = `${position.exchange}|${position.token}`

        // First try with exchange|token format
        let currentLtp = newLtps[symbolKey]

        // If not found, try token-only format (for Zerodha)
        if (currentLtp === undefined) {
          currentLtp = newLtps[position.token]
        }

        // Fall back to position.lastTradedPrice if still not found
        currentLtp = currentLtp ?? position.lastTradedPrice

        // Update the selectedPosition with the new LTP
        selectedPosition.value = {
          ...position,
          lastTradedPrice: currentLtp,
        } as T
      }
    },
    { deep: true }
  )

  return {
    // Modal state
    showTriggerModal,
    selectedPosition,
    selectedTriggerType,

    // Computed values
    computedDefaultStopLoss,
    computedDefaultTarget,

    // Methods
    openTriggerModal,
    handleTriggerSave,
  }
}
