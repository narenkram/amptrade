import { ref } from 'vue'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import type { Position } from '@/modules/private/shared/types/trade'
import { getIndexInstrument, isIndexOptionWithCustomSettings as _isIndexOptionWithCustomSettings } from '@/modules/private/shared/utils/symbolUtils'
import { logger } from '@/modules/utils/logger'

export const DEFAULT_RUPEES_SL = 21
export const DEFAULT_RUPEES_TARGET = 42

// Default SL/Target values for index options instruments
export const DEFAULT_NIFTY_SL = 11
export const DEFAULT_NIFTY_TARGET = 21
export const DEFAULT_BANKNIFTY_SL = 63
export const DEFAULT_BANKNIFTY_TARGET = 189
export const DEFAULT_SENSEX_SL = 21
export const DEFAULT_SENSEX_TARGET = 63


export const getDefaultStopLoss = () => DEFAULT_RUPEES_SL

export const getDefaultTarget = () => DEFAULT_RUPEES_TARGET

// Get instrument-specific SL/Target settings using the shared symbol detection
export const getInstrumentStopLoss = (symbol: string) => {
  const instrument = getIndexInstrument(symbol)
  switch (instrument) {
    case 'NIFTY':
      return DEFAULT_NIFTY_SL
    case 'BANKNIFTY':
      return DEFAULT_BANKNIFTY_SL
    case 'SENSEX':
      return DEFAULT_SENSEX_SL
    default:
      return getDefaultStopLoss()
  }
}

export const getInstrumentTarget = (symbol: string) => {
  const instrument = getIndexInstrument(symbol)
  switch (instrument) {
    case 'NIFTY':
      return DEFAULT_NIFTY_TARGET
    case 'BANKNIFTY':
      return DEFAULT_BANKNIFTY_TARGET
    case 'SENSEX':
      return DEFAULT_SENSEX_TARGET
    default:
      return getDefaultTarget()
  }
}

// Re-export from shared utility for backward compatibility
export const isIndexOptionWithCustomSettings = _isIndexOptionWithCustomSettings

interface TriggerValues {
  stopLoss: number | null
  target: number | null
  trailingStopLoss?: number | null
  trailingOffset?: number | null
  lastTrigger?: 'stopLoss' | 'target'
  pendingOrderId?: string
  isClosing?: boolean
}

const loadSavedTriggers = (): Record<string, TriggerValues> => {
  const saved = localStorage.getItem(STORAGE_KEYS.POSITION_TRIGGERS)
  return saved ? JSON.parse(saved) : {}
}

const saveTriggers = (triggers: Record<string, TriggerValues>) => {
  localStorage.setItem(STORAGE_KEYS.POSITION_TRIGGERS, JSON.stringify(triggers))
}

export function useStoplossTarget() {
  const triggerValues = ref<Record<string, TriggerValues>>(loadSavedTriggers())

  const getDefaultValues = () => ({
    stopLoss: getDefaultStopLoss(),
    target: getDefaultTarget(),
  })

  const setTriggers = (
    symbol: string,
    values: {
      stopLoss?: number | null
      target?: number | null
      lastTrigger?: 'stopLoss' | 'target'
      pendingOrderId?: string
      isClosing?: boolean
    },
  ) => {
    logger.debug('Setting triggers:', {
      symbol,
      currentValues: triggerValues.value[symbol],
      newValues: values,
    })

    triggerValues.value[symbol] = {
      ...triggerValues.value[symbol],
      ...values,
    }

    saveTriggers(triggerValues.value)

    logger.debug('Updated triggers:', triggerValues.value)
  }

  const resetTriggers = (symbol: string) => {
    logger.debug('Resetting triggers for:', symbol)
    triggerValues.value[symbol] = {
      stopLoss: null,
      target: null,
      lastTrigger: undefined,
      pendingOrderId: undefined,
      isClosing: false,
    }

    saveTriggers(triggerValues.value)
  }

  const checkTriggers = async (
    position: Position,
    currentLtp: number,
    triggerKey?: string,
    opts: { checkStopLoss?: boolean; checkTarget?: boolean } = {},
  ) => {
    // Respect the per-feature enable flags. The caller may have entered this code
    // path because *target* monitoring is on; if so we must NOT also fire a
    // stop-loss that the user has disabled (and vice versa).
    const checkStopLoss = opts.checkStopLoss !== false
    const checkTarget = opts.checkTarget !== false

    // Use the provided triggerKey if available, otherwise use position.symbol
    const lookupKey = triggerKey || position.symbol
    const triggers = triggerValues.value[lookupKey] || {}

    // console.log('Current trigger state:', {
    //   symbol: position.symbol,
    //   lookupKey,
    //   triggers,
    //   hasPosition: !!position.quantity,
    // })

    if (triggers.pendingOrderId || triggers.isClosing) {
      logger.debug(`Skipping trigger check - ${lookupKey} has:`, {
        pendingOrderId: triggers.pendingOrderId,
        isClosing: triggers.isClosing,
      })
      return null
    }

    if (triggers.lastTrigger) return null

    try {
      // Use the trailing stoploss if set; otherwise, use the static stopLoss.
      // NOTE: `!= null` (not `!== null`) so that an `undefined` trailing value
      // falls through to the static stop instead of becoming NaN and silently
      // disabling the stop-loss.
      const effectiveStopLoss =
        position.trailingStopLoss != null ? position.trailingStopLoss : position.stopLoss
      const target = position.target
      const isLong = position.quantity > 0

      // Ensure numeric values
      const numericLtp = Number(currentLtp)
      const numericStopLoss = effectiveStopLoss != null ? Number(effectiveStopLoss) : null
      const numericTarget = target != null ? Number(target) : null

      // console.log('Checking triggers (numeric):', {
      //   symbol: position.symbol,
      //   lookupKey,
      //   currentLtp: numericLtp,
      //   stopLoss: numericStopLoss,
      //   target: numericTarget,
      //   isLong,
      // })

      if (checkStopLoss && numericStopLoss !== null && Number.isFinite(numericStopLoss)) {
        if (
          (isLong && numericLtp <= numericStopLoss) ||
          (!isLong && numericLtp >= numericStopLoss)
        ) {
          // Mark as closing to dedupe concurrent ticks, but do NOT set
          // `lastTrigger` here: that permanently disarms the stop. The close
          // pipeline records `lastTrigger` only after the exit order is placed,
          // and `isClosing` is cleared if the close fails so the stop re-arms.
          setTriggers(lookupKey, { isClosing: true })
          return { type: 'stopLoss', price: numericLtp }
        }
      }

      if (checkTarget && numericTarget !== null && Number.isFinite(numericTarget)) {
        if ((isLong && numericLtp >= numericTarget) || (!isLong && numericLtp <= numericTarget)) {
          setTriggers(lookupKey, { isClosing: true })
          return { type: 'target', price: numericLtp }
        }
      }

      return null
    } catch (error) {
      logger.error('Error checking triggers:', error)
      return null
    }
  }

  /**
   * Clear all triggers that contain the given symbol in their key.
   * Used when closing a position to prevent stale triggers on re-entry.
   */
  const clearTriggersForSymbol = (symbol: string) => {
    logger.debug('Clearing triggers for symbol:', symbol)
    const currentTriggers = { ...triggerValues.value }
    let modified = false

    // Remove all trigger keys for this symbol. Match the symbol as a delimited
    // key segment (keys are `...|symbol|token|...`) rather than a loose substring,
    // so we don't accidentally clear unrelated symbols that share a prefix.
    for (const key of Object.keys(currentTriggers)) {
      if (key.split('|').includes(symbol)) {
        logger.debug('Removing trigger key:', key)
        delete currentTriggers[key]
        modified = true
      }
    }

    if (modified) {
      triggerValues.value = currentTriggers
      saveTriggers(currentTriggers)
    }
  }

  /**
   * Clean up stale triggers that no longer have active positions.
   * Call this after fetching positions to remove orphaned triggers.
   */
  const cleanupStaleTriggers = (activePositionKeys: string[]) => {
    logger.debug('Cleaning up stale triggers, active keys:', activePositionKeys.length)
    const currentTriggers = { ...triggerValues.value }
    let modified = false

    for (const key of Object.keys(currentTriggers)) {
      // Skip if this trigger key matches an active position
      if (activePositionKeys.includes(key)) continue

      // Remove stale trigger
      logger.debug('Removing stale trigger:', key)
      delete currentTriggers[key]
      modified = true
    }

    if (modified) {
      triggerValues.value = currentTriggers
      saveTriggers(currentTriggers)
      logger.debug('Cleaned up stale triggers, remaining:', Object.keys(currentTriggers).length)
    }
  }

  return {
    triggerValues,
    setTriggers,
    resetTriggers,
    checkTriggers,
    getDefaultValues,
    clearTriggersForSymbol,
    cleanupStaleTriggers,
  }
}
