import { useStorage } from '@vueuse/core'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'

/**
 * Shared, reactive, persisted settings for the position-level stop-loss / target
 * engine.
 *
 * These were previously THREE disconnected representations:
 *   - a non-persisted local `ref(false)` in TradeForm (reset on every reload),
 *   - a non-reactive `computed(() => localStorage.getItem('steadfast:trade:stopLossEnabled'))`
 *     in MultiBrokerPositions,
 *   - a different key `'steadfast:stoploss_enabled'` read by enrichPositionWithTriggers.
 *
 * The result was that toggling the checkbox never enabled the monitor, so stops /
 * targets / trailing never fired from a clean browser state. This composable is the
 * single source of truth: module-level `useStorage` refs are shared across every
 * component instance, persist to localStorage, and are reactive same-tab.
 *
 * `useStorage` serialises booleans as the strings 'true' / 'false', so any code that
 * still reads the raw key with `=== 'true'` stays compatible.
 */
const stopLossEnabled = useStorage<boolean>(STORAGE_KEYS.TRADE_STOPLOSS_ENABLED, false)
const targetEnabled = useStorage<boolean>(STORAGE_KEYS.TRADE_TARGET_ENABLED, false)

export function useTriggerSettings() {
  return {
    stopLossEnabled,
    targetEnabled,
  }
}
