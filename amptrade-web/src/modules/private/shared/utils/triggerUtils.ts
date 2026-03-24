import {
  getDefaultStopLoss,
  getDefaultTarget,
  getInstrumentStopLoss,
  getInstrumentTarget,
  isIndexOptionWithCustomSettings,
} from '@/modules/private/shared/composables/useStoplossTarget'
import { useTriggerCoordination } from '@/modules/private/shared/composables/useTriggerCoordination'
import type { Position } from '@/modules/private/shared/types/trade'
import { calculateProtectedPrice } from '@/modules/utils/marketProtection'

/**
 * Minimal subset of a Position-like object needed for trigger enrichment
 */
export interface BasicPosition {
  // Prefer `symbol` but fall back to `tradingSymbol`
  symbol?: string
  tradingSymbol?: string
  quantity: number
  lastTradedPrice: number
  stopLoss?: number | null
  target?: number | null
  // Net average price for the current position (from broker's netavgprc)
  netAvgPrice?: number
  // Optional broker info for multi-broker trigger lookup
  broker?: { id: string; name?: string; clientId?: string } | null
}

/**
 * Enriches a position with stop-loss / target coming from either previously
 * saved triggers *or* the user's default rupee values when those features are
 * enabled in localStorage.
 *
 * The logic used to exist (copy-pasted) in three different composables.  By
 * moving it here we keep the code base DRY and guarantee identical behaviour
 * everywhere.
 */
export function enrichPositionWithTriggers<T extends BasicPosition>(
  position: T,
  savedTriggers: Record<string, { stopLoss?: number | null; target?: number | null }>,
): T {
  const symbol = position.symbol ?? position.tradingSymbol ?? ''

  // Try to find saved triggers using multiple key formats (for backward compatibility):
  // 1. First try with new enhanced key format: brokerName|clientId|symbol|token|productType
  // 2. Then try legacy broker-prefixed key: brokerId|symbol
  // 3. Fall back to plain symbol key (for single-broker)
  let saved: { stopLoss?: number | null; target?: number | null } = {}

  if (symbol) {
    // Try new enhanced key format first (using getTriggerKey)
    const enhancedKey = getTriggerKey(position)
    saved = savedTriggers[enhancedKey] || {}

    // If no triggers found with enhanced key, try legacy broker-prefixed key
    if (!saved.stopLoss && !saved.target && position.broker?.id) {
      const legacyBrokerKey = `${position.broker.id}|${symbol}`
      saved = savedTriggers[legacyBrokerKey] || {}
    }

    // If still no triggers found, fall back to plain symbol key
    if (!saved.stopLoss && !saved.target) {
      saved = savedTriggers[symbol] || {}
    }
  }


  const isLong = position.quantity > 0
  const ltp = position.lastTradedPrice

  // Get the appropriate SL/Target values based on instrument type
  // For index options (Nifty, BankNifty, Sensex), use instrument-specific values
  const defaultSL = isIndexOptionWithCustomSettings(symbol)
    ? getInstrumentStopLoss(symbol)
    : getDefaultStopLoss()
  const defaultTarget = isIndexOptionWithCustomSettings(symbol)
    ? getInstrumentTarget(symbol)
    : getDefaultTarget()

  // 1) STOP-LOSS -------------------------------------------------------------
  // Priority: saved value > existing position value > auto-calculate (if enabled and no value exists)
  let stopLoss = saved.stopLoss ?? position.stopLoss
  if (
    stopLoss == null && // not already present from saved or position
    position.quantity !== 0 &&
    localStorage.getItem('steadfast:stoploss_enabled') === 'true'
  ) {
    // Use netAvgPrice for SL calculation - this is the actual entry price
    // Falls back to LTP if netAvgPrice not available
    const entryPrice = position.netAvgPrice ?? ltp
    const calc = isLong ? entryPrice - defaultSL : entryPrice + defaultSL
    stopLoss = Math.max(calc, 0)
  }

  // 2) TARGET ----------------------------------------------------------------
  // Priority: saved value > existing position value > auto-calculate (if enabled and no value exists)
  let target = saved.target ?? position.target
  if (
    target == null &&
    position.quantity !== 0 &&
    localStorage.getItem('steadfast:target_enabled') === 'true'
  ) {
    // Use netAvgPrice for target calculation - this is the actual entry price
    // Falls back to LTP if netAvgPrice not available
    const entryPrice = position.netAvgPrice ?? ltp
    const calc = isLong ? entryPrice + defaultTarget : entryPrice - defaultTarget
    target = Math.max(calc, 0)
  }

  return {
    ...position,
    stopLoss,
    target,
  }

}

// -----------------------------------------------------------------------------
// Utility helpers used by multiple position tables/components.
// Keeping them here guarantees single-source-of-truth and avoids duplication.
// -----------------------------------------------------------------------------

/**
 * Return the most up-to-date LTP for a position: first look up the composite
 * key (exchange|token) in the map, fall back to token-only (needed for Zerodha
 * quotes) and finally return the last traded price already present on the
 * position.
 */
export function getEffectiveLtp<P extends { exchange: string; token: string; lastTradedPrice: number }>(
  position: P,
  ltpMap: Record<string, number>,
): number {
  const symbolKey = `${position.exchange}|${position.token}`

  // 1) try composite key (works for most brokers)
  let ltp = ltpMap[symbolKey]

  // 2) Zerodha streams numeric token without exchange
  if (ltp === undefined) {
    ltp = ltpMap[position.token]
  }

  // 3) fall back to stale price from position
  return ltp ?? position.lastTradedPrice
}

/**
 * Calculate unrealised P&L given an LTP map. Works for both long and short
 * positions and handles closed positions (qty === 0).
 */
export function calcUnrealizedPnL<P extends {
  quantity: number
  buyAverage: number
  sellAverage: number
  exchange: string
  token: string
  lastTradedPrice: number
}>(position: P, ltpMap: Record<string, number>): number {
  const ltp = getEffectiveLtp(position, ltpMap)

  if (!ltp || position.quantity === 0) return 0

  return position.quantity > 0
    ? (ltp - position.buyAverage) * position.quantity // long
    : (position.sellAverage - ltp) * Math.abs(position.quantity) // short
}

/**
 * Decide whether the trailing stop-loss should be moved after a fresh quote.
 * Returns the new trailing stop value or the original one when no update is
 * required.
 */
export function computeNewTrailingSL(
  qty: number,
  currentTSL: number,
  ltp: number,
  offset: number,
): number {
  if (qty > 0) {
    // Long – SL can only move up
    const candidate = ltp - offset
    return candidate > currentTSL ? candidate : currentTSL
  }
  // Short – SL can only move down
  const candidate = ltp + offset
  return candidate < currentTSL ? candidate : currentTSL
}

/**
 * Toggle helper: given a position, current LTP and default SL offset it returns
 * the minimal patch that has to be applied to switch between static and
 * trailing stop-loss.
 */
export function buildTrailingToggleUpdate<P extends {
  quantity: number
  stopLoss: number | null
  trailingStopLoss: number | null
}>(position: P, ltp: number, defaultOffset: number) {
  if (position.trailingStopLoss == null) {
    // switch from static -> trailing
    const initialTSL =
      position.stopLoss != null
        ? position.stopLoss
        : position.quantity > 0
          ? ltp - defaultOffset
          : ltp + defaultOffset
    return { stopLoss: null, trailingStopLoss: initialTSL }
  }
  // switch from trailing -> static (freeze current TSL)
  return { trailingStopLoss: null, stopLoss: position.trailingStopLoss }
}

/**
 * Unified position interface that works across all position types
 * This helps standardize trigger handling regardless of broker type
 */
export interface UnifiedPosition {
  // Flexible symbol handling - prefer symbol, fallback to tradingSymbol
  symbol?: string
  tradingSymbol?: string
  quantity: number
  // Support both lastTradedPrice and lastPrice for different position types
  lastTradedPrice?: number
  lastPrice?: number
  stopLoss?: number | null
  trailingStopLoss?: number | null
  target?: number | null
  exchange: string
  token: string
  broker?: { id: string; name?: string; clientId?: string } | string | null

  // For UI display consistency
  buyAverage?: number
  sellAverage?: number
  averagePrice?: number
  realizedPnL?: number
  realizedPnl?: number // Support both camelCase variations
  productType?: string
  // Net average price from broker for trigger key uniqueness
  netAvgPrice?: number
}

/**
 * Get the standardized symbol from any position type
 */
export function getPositionSymbol(position: UnifiedPosition): string {
  return position.symbol ?? position.tradingSymbol ?? ''
}

/**
 * Extract option type (CE/PE/FUT/EQ) from symbol
 * Examples:
 *   NIFTY25JAN25P23000 -> PE
 *   NIFTY25JAN25C23500 -> CE
 *   NIFTY25JANFUT -> FUT
 *   RELIANCE -> EQ
 */
export function extractOptionType(symbol: string): string {
  if (!symbol) return 'EQ'
  const upperSymbol = symbol.toUpperCase()

  // Check for Put options (ends with P followed by strike price)
  if (/P\d+$/.test(upperSymbol)) return 'PE'

  // Check for Call options (ends with C followed by strike price)
  if (/C\d+$/.test(upperSymbol)) return 'CE'

  // Check for Futures
  if (upperSymbol.includes('FUT')) return 'FUT'

  // Default to Equity
  return 'EQ'
}

/**
 * Standardized trigger key generation for consistent trigger management
 * across single broker and multi-broker positions.
 * 
 * Key format: {brokerName}|{clientId}|{symbol}|{token}|{productType}|{netAvgPrice}
 * Example: Flattrade|ABC123|NIFTY25JAN25P23000|12345|I|105.5
 * 
 * token: Unique instrument identifier from broker (available for all brokers)
 * productType values: I (Intraday), M (Carry Forward/NRML), C (CNC/Holding)
 * netAvgPrice: Rounded net average price to make each trade entry unique
 * 
 * Including netAvgPrice in the key prevents stale triggers from previous trades
 * on the same instrument from affecting new trades.
 */
export function getTriggerKey(position: {
  symbol?: string
  tradingSymbol?: string
  token?: string
  productType?: string
  netAvgPrice?: number
  broker?: { id: string; name?: string; clientId?: string } | string | null
}): string {
  const symbol = position.symbol ?? position.tradingSymbol ?? ''
  // Use token as primary identifier - it's unique per instrument for all brokers
  // Fallback to parsing from symbol only if token not available
  const token = position.token || extractOptionType(symbol)
  // Normalize productType: I for Intraday, M for Carry Forward/NRML, C for CNC
  const productType = position.productType || 'I'
  // Round netAvgPrice to 2 decimal places for key stability
  // This makes each trade entry unique but handles minor price fluctuations
  const avgPricePart = position.netAvgPrice ? Math.round(position.netAvgPrice * 100) / 100 : '0'

  // Handle broker positions with broker objects or strings
  if (position.broker) {
    if (typeof position.broker === 'string') {
      // Legacy format - string broker ID
      return `${position.broker}|${symbol}|${token}|${productType}|${avgPricePart}`
    } else {
      // Enhanced format with broker name and clientId
      const brokerName = position.broker.name || 'Unknown'
      const clientId = position.broker.clientId || position.broker.id
      return `${brokerName}|${clientId}|${symbol}|${token}|${productType}|${avgPricePart}`
    }
  }

  // Fallback for positions without broker info
  return `${symbol}|${token}|${productType}|${avgPricePart}`
}

/**
 * Standardized trigger status checker
 */
export function getTriggerStatus(
  position: UnifiedPosition,
  triggerValues: Record<string, { lastTrigger?: string }>
): string | null {
  const triggerKey = getTriggerKey(position)
  const triggers = triggerValues[triggerKey]
  return triggers?.lastTrigger ?? null
}

/**
 * Universal position LTP getter using the DRY utility
 */
export function getPositionLtp(position: UnifiedPosition, ltpMap: Record<string, number>): string {
  const ltp = getEffectiveLtp(
    {
      exchange: position.exchange,
      token: position.token,
      lastTradedPrice: position.lastTradedPrice ?? position.lastPrice ?? 0
    },
    ltpMap
  )
  if (typeof ltp === 'number') {
    return ltp.toFixed(2)
  }
  return '0'
}

/**
 * Unified quote update handler that can be used across all position components
 * to reduce code duplication and ensure consistent trigger checking
 */
export function createQuoteUpdateHandler<T extends {
  symbol?: string
  tradingSymbol?: string
  quantity: number
  stopLoss?: number | null
  trailingStopLoss?: number | null
  target?: number | null
  broker?: { id: string } | string | null
  exchange: string
  token: string
}>(options: {
  positions: () => T[]
  positionLtps: { value: Record<string, number> }
  stopLossEnabled: () => boolean
  targetEnabled: () => boolean
  checkTriggers: (position: T, ltp: number, triggerKey?: string) => Promise<{ type: string; price: number } | null>
  setTriggers: (key: string, updates: Record<string, unknown>) => void
  updatePosition: (symbol: string, updates: Record<string, unknown>, broker?: { id: string }) => Promise<void>
  handleClosePosition: (position: T) => Promise<void>
  getDefaultStopLoss: () => number
}) {
  // Initialize trigger coordination - use position-based coordination for better duplicate prevention
  const { executePositionTrigger, isPositionProcessing } = useTriggerCoordination()

  return async (event: CustomEvent) => {
    const { token, ltp, exchange } = event.detail
    const symbolKey = `${exchange}|${token}`

    // Convert ltp to number explicitly
    const numericLtp = typeof ltp === 'string' ? parseFloat(ltp) : ltp

    if (numericLtp !== null && numericLtp !== undefined && numericLtp !== 0) {
      // Only update if the LTP has changed
      if (options.positionLtps.value[symbolKey] !== numericLtp) {
        // Store LTP with the exchange|token key
        options.positionLtps.value[symbolKey] = numericLtp
        // Also store without exchange prefix for Zerodha compatibility
        options.positionLtps.value[token] = numericLtp

        // Find matching positions
        const matchingPositions = options.positions().filter(position => {
          // Standard format: match both exchange and token
          const exactMatch = position.exchange === exchange && position.token === token
          // Zerodha format: match just token
          const zerodhaMatch = position.token === token && position.quantity !== 0
          return exactMatch || zerodhaMatch
        })

        // Process each matching position
        for (const position of matchingPositions) {
          if (position.quantity === 0) continue

          const triggerKey = getTriggerKey(position)

          // CRITICAL: Check if this position is already being processed BEFORE checking triggers
          // This prevents race conditions when multiple LTP updates arrive rapidly
          if (isPositionProcessing(triggerKey)) {
            console.log(`🚫 [Early Block] Skipping trigger check - already processing: ${triggerKey}`)
            continue
          }

          if (
            (options.stopLossEnabled() && (position.stopLoss || position.trailingStopLoss)) ||
            (options.targetEnabled() && position.target)
          ) {
            // Check if a trigger is hit
            try {
              const triggerResult = await options.checkTriggers(position, numericLtp, triggerKey)
              if (triggerResult) {
                const symbol = position.symbol ?? position.tradingSymbol ?? ''

                // Use position-based trigger coordination to prevent duplicates
                // The triggerKey uniquely identifies this position: brokerName|clientId|symbol|token|productType
                await executePositionTrigger(triggerKey, async () => {
                  console.log('Position trigger hit:', {
                    symbol,
                    triggerKey,
                    type: triggerResult.type,
                    price: triggerResult.price,
                  })

                  // Store which trigger was hit
                  options.setTriggers(triggerKey, {
                    lastTrigger: triggerResult.type as 'stopLoss' | 'target',
                    stopLoss: null,
                    target: null,
                  })

                  // Close the position
                  await options.handleClosePosition(position)
                })
              }
            } catch (error) {
              console.error('Error checking triggers:', error)
            }

            // Handle trailing stop loss updates
            if (position.trailingStopLoss !== null && position.trailingStopLoss !== undefined) {
              const newTrailingStopLoss = computeNewTrailingSL(
                position.quantity,
                position.trailingStopLoss,
                numericLtp,
                options.getDefaultStopLoss(),
              )

              if (newTrailingStopLoss !== position.trailingStopLoss) {
                console.log('Updating trailing stop-loss:', {
                  symbol: position.symbol ?? position.tradingSymbol,
                  oldValue: position.trailingStopLoss,
                  newValue: newTrailingStopLoss,
                  currentLtp: numericLtp,
                })

                await options.updatePosition(
                  position.symbol ?? position.tradingSymbol ?? '',
                  { trailingStopLoss: newTrailingStopLoss },
                  position.broker as { id: string }
                )
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Standardized position update interface
 */
export interface StandardizedUpdatePosition {
  (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null): Promise<void>
}

/**
 * Standardized position update options
 */
export interface PositionUpdateOptions<T extends UnifiedPosition> {
  updatePosition: StandardizedUpdatePosition
  setTriggers: (key: string, updates: Record<string, unknown>) => void
  getTriggerKey?: (position: T) => string
}

/**
 * Create standardized position update handler that works across all position types
 */
export function createStandardizedPositionUpdater<T extends UnifiedPosition>(
  options: PositionUpdateOptions<T>
) {
  const { updatePosition, setTriggers, getTriggerKey: customGetTriggerKey } = options

  return {
    updateTrigger: async (position: T, type: 'stopLoss' | 'trailingStopLoss' | 'target', value: number | null) => {
      const symbol = position.symbol ?? position.tradingSymbol ?? ''

      try {
        await updatePosition(symbol, { [type]: value }, position.broker as { id: string } | null)

        // Update local triggers with standardized key
        const triggerKey = customGetTriggerKey ? customGetTriggerKey(position) : getTriggerKey(position)
        setTriggers(triggerKey, { [type]: value })

        console.log(`Updated ${type} for ${symbol}:`, value)
      } catch (error) {
        console.error(`Failed to update ${type} for ${symbol}:`, error)
        throw error
      }
    },

    removeTrigger: async (position: T, type: 'stopLoss' | 'target') => {
      const symbol = position.symbol ?? position.tradingSymbol ?? ''

      try {
        const updates = type === 'stopLoss'
          ? { stopLoss: null, trailingStopLoss: null }
          : { target: null }

        await updatePosition(symbol, updates, position.broker as { id: string } | null)

        // Update local triggers
        const triggerKey = customGetTriggerKey ? customGetTriggerKey(position) : getTriggerKey(position)
        setTriggers(triggerKey, updates)

        console.log(`Removed ${type} for ${symbol}`)
      } catch (error) {
        console.error(`Failed to remove ${type} for ${symbol}:`, error)
        throw error
      }
    }
  }
}

/**
 * Standardized trigger removal utilities
 */
export const createTriggerRemovalHandlers = <T extends {
  symbol?: string
  tradingSymbol?: string
  quantity: number
  broker?: { id: string }
}>(
  updatePosition: (symbol: string, updates: Record<string, unknown>, broker?: { id: string }) => Promise<void>,
  setTriggers: (key: string, updates: Record<string, unknown>) => void
) => ({
  removeStopLoss: async (position: T) => {
    if (position.quantity === 0) return

    const symbol = position.symbol ?? position.tradingSymbol ?? ''
    try {
      await updatePosition(symbol, {
        stopLoss: null,
        trailingStopLoss: null,
      }, position.broker)

      // Update local triggers
      const triggerKey = getTriggerKey(position)
      setTriggers(triggerKey, { stopLoss: null })

      console.log('Removed stoploss for:', symbol)
    } catch (error) {
      console.error('Failed to remove stoploss:', error)
      throw error
    }
  },

  removeTarget: async (position: T) => {
    if (position.quantity === 0) return

    const symbol = position.symbol ?? position.tradingSymbol ?? ''
    try {
      await updatePosition(symbol, { target: null }, position.broker)

      // Update local triggers
      const triggerKey = getTriggerKey(position)
      setTriggers(triggerKey, { target: null })

      console.log('Removed target for:', symbol)
    } catch (error) {
      console.error('Failed to remove target:', error)
      throw error
    }
  }
})

/**
 * Unified event dispatcher for consistent trigger and position updates
 */
export interface StandardizedEventDispatcher {
  dispatchTriggerUpdate: (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => void
  dispatchTriggerSave: (symbol: string, stopLoss?: number | null, target?: number | null, trailingStopLoss?: number | null, broker?: { id: string } | null) => void
}

export function createEventDispatcher(): StandardizedEventDispatcher {
  return {
    dispatchTriggerUpdate: (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => {
      window.dispatchEvent(
        new CustomEvent('position-triggers-updated', {
          detail: { symbol, updates, broker },
        })
      )
    },

    dispatchTriggerSave: (symbol: string, stopLoss?: number | null, target?: number | null, trailingStopLoss?: number | null, broker?: { id: string } | null) => {
      const detail: Record<string, unknown> = { symbol, broker }

      if (stopLoss !== undefined) detail.stoploss = stopLoss
      if (target !== undefined) detail.target = target
      if (trailingStopLoss !== undefined) detail.trailingStopLoss = trailingStopLoss

      window.dispatchEvent(
        new CustomEvent('save-position-triggers', {
          detail,
        })
      )
    }
  }
}

/**
 * Standardized position mapping utilities
 * Helps convert different position types to UnifiedPosition consistently
 */

/**
 * Flexible position-like type for mapping - uses Record for maximum compatibility
 */
type PositionLike = Record<string, unknown>

/**
 * Map any position-like object to UnifiedPosition
 * This replaces the complex mapping functions scattered across components
 */
export function mapToUnifiedPosition(position: PositionLike): UnifiedPosition {
  // Handle different symbol/tradingSymbol patterns
  const symbol = (position.symbol as string) ?? (position.tradingSymbol as string)
  const tradingSymbol = (position.tradingSymbol as string) ?? (position.symbol as string)

  // Handle different price patterns
  const lastTradedPrice = (position.lastTradedPrice as number) ?? (position.lastPrice as number) ?? 0

  // Handle different average price patterns
  const buyAverage = (position.buyAverage as number) ?? (position.averagePrice as number) ?? 0
  const sellAverage = (position.sellAverage as number) ?? (position.averagePrice as number) ?? 0

  // Handle different PnL patterns
  const realizedPnL = (position.realizedPnL as number) ?? (position.realizedPnl as number) ?? 0

  // Handle broker patterns
  let broker = position.broker
  if (typeof broker === 'string') {
    broker = null // For positions where broker is just a string
  }

  return {
    symbol,
    tradingSymbol,
    quantity: (position.quantity as number) || 0,
    lastTradedPrice,
    lastPrice: lastTradedPrice, // Alias for compatibility
    exchange: (position.exchange as string) || '',
    token: (position.token as string) || '',
    stopLoss: (position.stopLoss as number | null) ?? null,
    trailingStopLoss: (position.trailingStopLoss as number | null) ?? null,
    target: (position.target as number | null) ?? null,
    buyAverage,
    sellAverage,
    averagePrice: (position.averagePrice as number) ?? buyAverage, // Prefer specific averagePrice if available
    realizedPnL,
    realizedPnl: realizedPnL, // Alias for compatibility
    productType: (position.productType as string) ?? (position.product as string),
    broker: broker as UnifiedPosition['broker']
  }
}

/**
 * Create a standardized position converter function
 * Returns a function that consistently converts positions to UnifiedPosition
 */
export function createPositionConverter<T extends PositionLike>(): (position: T) => UnifiedPosition {
  return (position: T) => mapToUnifiedPosition(position)
}

/**
 * Standardized updatePosition factory to eliminate duplication across composables
 * Creates a consistent updatePosition function that works with any position type
 */
export function createStandardizedUpdatePositionHandler(options: {
  findAndUpdatePosition: (symbol: string, updates: Record<string, unknown>) => Promise<void>
  dispatchEvents?: boolean
}): (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => Promise<void> {
  const { findAndUpdatePosition, dispatchEvents = true } = options

  return async (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => {
    try {
      // Update the position using the specific implementation
      await findAndUpdatePosition(symbol, updates)

      if (dispatchEvents) {
        // Dispatch event to notify other components
        window.dispatchEvent(
          new CustomEvent('position-triggers-updated', {
            detail: { symbol, updates, broker },
          })
        )

        // Save triggers to localStorage if they are trigger-related updates
        if (
          updates.stopLoss !== undefined ||
          updates.target !== undefined ||
          updates.trailingStopLoss !== undefined
        ) {
          window.dispatchEvent(
            new CustomEvent('save-position-triggers', {
              detail: {
                symbol,
                stoploss: updates.stopLoss,
                trailingStopLoss: updates.trailingStopLoss,
                target: updates.target,
                broker,
              },
            })
          )
        }
      }
    } catch (err) {
      console.error('Error updating position:', err)
      throw err
    }
  }
}

/**
 * Universal position update factory that works across all position component types
 * Eliminates duplication between SingleBroker and MultiBroker position components
 */
export function createPositionUpdaterFactory<T extends UnifiedPosition>(options: {
  updatePosition: (symbol: string, updates: Record<string, unknown>, broker?: { id: string } | null) => Promise<void>
  setTriggers: (key: string, updates: Record<string, unknown>) => void
  getDefaultStopLoss: () => number
}) {
  const { updatePosition, setTriggers, getDefaultStopLoss } = options

  return {
    // Toggle between trailing and static stop-loss
    toggleTrailingStoploss: async (position: T, positionLtps: Record<string, number>) => {
      if (position.quantity === 0) return

      const currentLtp = getEffectiveLtp({
        exchange: position.exchange,
        token: position.token,
        lastTradedPrice: position.lastTradedPrice ?? position.lastPrice ?? 0
      }, positionLtps)

      const updateObj = buildTrailingToggleUpdate({
        quantity: position.quantity,
        stopLoss: position.stopLoss ?? null,
        trailingStopLoss: position.trailingStopLoss ?? null
      }, currentLtp, getDefaultStopLoss())

      try {
        await updatePosition(
          position.symbol ?? position.tradingSymbol ?? '',
          updateObj,
          position.broker as { id: string } | null
        )
      } catch (error) {
        console.error('Error toggling trailing stoploss:', error)
      }
    },

    // Remove stop loss with standardized key
    removeStopLoss: async (position: T) => {
      if (position.quantity === 0) return

      const symbol = position.symbol ?? position.tradingSymbol ?? ''
      try {
        await updatePosition(symbol, {
          stopLoss: null,
          trailingStopLoss: null,
        }, position.broker as { id: string } | null)

        const triggerKey = getTriggerKey(position)
        setTriggers(triggerKey, { stopLoss: null })

        console.log('Removed stoploss for:', symbol)
      } catch (error) {
        console.error('Failed to remove stoploss:', error)
        throw error
      }
    },

    // Remove target with standardized key
    removeTarget: async (position: T) => {
      if (position.quantity === 0) return

      const symbol = position.symbol ?? position.tradingSymbol ?? ''
      try {
        await updatePosition(symbol, { target: null }, position.broker as { id: string } | null)

        const triggerKey = getTriggerKey(position)
        setTriggers(triggerKey, { target: null })

        console.log('Removed target for:', symbol)
      } catch (error) {
        console.error('Failed to remove target:', error)
        throw error
      }
    },

    // Update position locally (for UI responsiveness)
    updatePositionLocal: (positions: T[], position: T, type: string, newVal: number) => {
      const pos = positions.find((p) =>
        (p.symbol ?? p.tradingSymbol) === (position.symbol ?? position.tradingSymbol)
      )

      if (pos) {
        if (type === 'stoploss') {
          pos.stopLoss = newVal
          pos.trailingStopLoss = null
        } else if (type === 'target') {
          pos.target = newVal
        }
      }
    }
  }
}

/**
 * Standardized position closing utility
 * Eliminates duplication of freeze quantity/lot size logic across components
 */
export interface PositionToClose {
  symbol?: string
  tradingSymbol?: string
  quantity: number
  exchange: string
  token: string
  productType?: string
  instrumentName?: string
  freezeQuantity?: number
  lotSize?: number
  tickSize?: number
  broker?: { id: string; name?: string } | null
}

export interface PositionClosingOptions {
  placeOrder: (payload: Record<string, unknown>, broker: Record<string, unknown>) => Promise<string>
  getPositionLtps: () => Record<string, number>
  setTriggers: (key: string, updates: Record<string, unknown>) => void
  getTriggerKey: (position: PositionToClose) => string
}

/**
 * Creates a standardized position closing handler
 * Handles freeze quantity, lot size calculations, and sequential order placement
 */
export function createPositionClosingHandler(options: PositionClosingOptions) {
  const { placeOrder, getPositionLtps, setTriggers, getTriggerKey } = options

  return async function closePosition(position: PositionToClose, broker: Record<string, unknown>): Promise<void> {
    if (!broker || position.quantity === 0) return

    try {
      const triggerKey = getTriggerKey(position)
      setTriggers(triggerKey, { isClosing: true })

      const action = position.quantity > 0 ? 'SELL' : 'BUY'
      const totalQuantity = Math.abs(position.quantity)
      const freezeQty = position.freezeQuantity || 1000
      const lotSize = position.lotSize || 1

      // Standardized quantity calculation logic
      const orderQuantities = []
      let remainingQty = totalQuantity

      while (remainingQty > 0) {
        let orderQty = Math.min(remainingQty, freezeQty)

        if (lotSize > 1) {
          orderQty = Math.floor(orderQty / lotSize) * lotSize
        }

        if (orderQty === 0 && remainingQty >= lotSize) {
          orderQty = lotSize
        }

        if (orderQty === 0 && remainingQty > 0) {
          console.warn(`Cannot fulfill order with lot size ${lotSize} for remaining qty ${remainingQty}`)
          break
        }

        if (orderQty > 0) {
          orderQuantities.push(orderQty)
          remainingQty -= orderQty
        } else {
          break
        }
      }

      console.log(`Closing position with ${orderQuantities.length} orders: ${orderQuantities.join(', ')}`)

      // Place orders sequentially
      let lastOrderId = ''
      for (const qty of orderQuantities) {
        const symbol = position.symbol ?? position.tradingSymbol ?? ''

        const payload: Record<string, unknown> = {
          action,
          symbol,
          tradingSymbol: symbol,
          quantity: qty,
          productType: position.productType || 'Carry Forward',
          orderType: 'MARKET', // Default, will be updated below
          exchange: position.exchange,
          segment: position.instrumentName || '',
          expiry: '',
        }

        // Use Market Protection for all position closings
        const positionLtps = getPositionLtps()
        const symbolKey = `${position.exchange}|${position.token}`
        const currentLtp = positionLtps[symbolKey] || positionLtps[position.token]
        if (currentLtp && currentLtp > 0) {
          payload.orderType = 'Market Protection'
          // Calculate protected price based on closing action direction and tick size
          payload.price = calculateProtectedPrice(currentLtp, action, position.tickSize)
        } else {
          console.warn(`No valid LTP available for ${symbol}, using market order instead`)
          payload.orderType = 'MARKET'
        }

        lastOrderId = await placeOrder(payload, broker)

        if (orderQuantities.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Update triggers with pending order
      setTriggers(triggerKey, {
        stopLoss: null,
        target: null,
        lastTrigger: undefined,
        pendingOrderId: lastOrderId,
        isClosing: true,
      })

    } catch (error) {
      console.error('Failed to close position:', error)
      const triggerKey = getTriggerKey(position)
      setTriggers(triggerKey, {
        isClosing: false,
        pendingOrderId: undefined,
      })
      throw error
    }
  }
}

/**
 * Converts any position type to the format expected by checkTriggers
 * This eliminates manual mapping in components
 */
export function createPositionForTriggerCheck<T extends {
  symbol?: string
  tradingSymbol?: string
  quantity: number
  lastTradedPrice?: number
  lastPrice?: number
  averagePrice?: number
  stopLoss?: number | null
  trailingStopLoss?: number | null
  target?: number | null
  exchange: string
  token: string
  realizedPnl?: number
  realizedPnL?: number
  instrumentType?: string
  product?: string
  broker?: unknown
}>(position: T): Position {
  const symbol = position.symbol ?? position.tradingSymbol ?? ''
  const lastTradedPrice = position.lastTradedPrice ?? position.lastPrice ?? 0
  const avgPrice = position.averagePrice ?? 0
  const realizedPnL = position.realizedPnL ?? position.realizedPnl ?? 0

  return {
    symbol,
    tradingSymbol: symbol,
    quantity: position.quantity,
    lastTradedPrice,
    exchange: position.exchange,
    token: position.token,
    stopLoss: position.stopLoss ?? null,
    trailingStopLoss: position.trailingStopLoss ?? null,
    target: position.target ?? null,
    realizedPnL,
    instrumentName: position.instrumentType ?? '',
    displayName: symbol,
    buyAverage: avgPrice,
    sellAverage: avgPrice,
    totalBuyQty: position.quantity > 0 ? position.quantity : 0,
    totalSellQty: position.quantity < 0 ? Math.abs(position.quantity) : 0,
    productType: position.product === 'NRML' ? 'Carry Forward' : 'Intraday',
    side: position.quantity > 0 ? 'BUY' : 'SELL',
    totalBuyAmount: position.quantity > 0 ? position.quantity * avgPrice : 0,
    totalSellAmount: position.quantity < 0 ? Math.abs(position.quantity) * avgPrice : 0,
    // Add other required Position fields with sensible defaults
    unrealizedPnL: 0, // Will be calculated elsewhere
    buyValue: 0,
    sellValue: 0,
    netValue: 0,
    multiplier: 1,
    pnl: 0,
    lotSize: 1,
    freezeQuantity: 1000,
    netQty: position.quantity,
    closedQty: 0,
    mtm: 0,
    isIntraday: false
  } as Position
}
