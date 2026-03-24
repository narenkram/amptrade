/**
 * Shortcut Key System Documentation
 * --------------------------------
 *
 * Loading State Flow:
 * 1. Keyboard shortcuts (F6/F9) trigger custom events via window.dispatchEvent
 * 2. These events ('shortcut-close-all' and 'shortcut-cancel-orders') are caught by components
 * 3. Components manage loading states and execute the actual actions
 *
 * Important Implementation Details:
 * - NEVER directly call action handlers from this file
 * - ALWAYS use the custom event system (window.dispatchEvent)
 * - Loading states are managed externally by components listening for these events
 *
 * Event Flow Example:
 * F6 Press → dispatchEvent('shortcut-close-all') → Component → Set Loading State → Execute Action
 *
 * Custom Events:
 * - 'shortcut-close-all': Triggered by F6, handles closing all positions
 * - 'shortcut-cancel-orders': Triggered by F9, handles cancelling all orders
 *
 * @example Component Usage:
 * const { setupGlobalShortcuts, setupTradingShortcuts } = useShortcutKeys()
 *
 * setupGlobalShortcuts({
 *   shortcutsEnabled,
 *   mode: 'single' // or 'multi'
 * })
 */

import { onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'
import { logger } from '@/modules/utils/logger'

type TradeMode = 'single' | 'multi'
type InstrumentType = 'CALL' | 'PUT' | 'FUT' | 'EQ'

interface GlobalShortcutOptions {
  shortcutsEnabled: Ref<boolean>
  mode: TradeMode
}

interface TradingShortcutOptions {
  shortcutsEnabled: Ref<boolean>
  type?: InstrumentType
  handleAction: (action: 'buy' | 'sell') => Promise<void>
  selectedSegment: Ref<string>
}

export function useShortcutKeys() {
  /**
   * Global shortcut handler (F6, F9)
   * Works consistently across all trading modes
   */
  const setupGlobalShortcuts = ({ shortcutsEnabled, mode }: GlobalShortcutOptions) => {
    const handleGlobalKeyPress = async (event: KeyboardEvent) => {
      if (!shortcutsEnabled.value) return

      // Skip if we're in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === 'F6') {
        event.preventDefault()
        logger.debug(`[${mode}] F6 pressed - dispatching shortcut-close-all event`)
        window.dispatchEvent(
          new CustomEvent('shortcut-close-all', {
            detail: {
              target: 'center',
              mode: mode
            },
          }),
        )
      } else if (event.key === 'F9') {
        event.preventDefault()
        logger.debug(`[${mode}] F9 pressed - dispatching shortcut-cancel-orders event`)
        window.dispatchEvent(
          new CustomEvent('shortcut-cancel-orders', {
            detail: {
              target: 'center',
              mode: mode
            },
          }),
        )
      }
    }

    onMounted(() => {
      logger.debug(`[${mode}] Setting up global shortcuts (F6/F9)`)
      window.addEventListener('keydown', handleGlobalKeyPress, true)
    })

    onBeforeUnmount(() => {
      logger.debug(`[${mode}] Cleaning up global shortcuts (F6/F9)`)
      window.removeEventListener('keydown', handleGlobalKeyPress, true)
    })
  }

  /**
   * Trading shortcut handler (Arrow keys)
   * Handles buy/sell actions via arrow keys
   */
  const setupTradingShortcuts = ({
    shortcutsEnabled,
    type,
    handleAction,
    selectedSegment,
  }: TradingShortcutOptions) => {
    const handleTradingKeyPress = async (event: KeyboardEvent) => {
      // Skip if shortcuts are disabled
      if (!shortcutsEnabled.value) return

      // Skip if we're in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      // Updated segment checks with explicit commodity handling
      const isCommodityOptions = selectedSegment.value === 'Commodity Options'
      const isCommodityFutures = selectedSegment.value === 'Commodity Futures'
      const isRegularOptions =
        selectedSegment.value === 'Index Options' || selectedSegment.value === 'Stocks Options'
      const isRegularFutures =
        selectedSegment.value === 'Index Futures' || selectedSegment.value === 'Stocks Futures'

      if (type) {
        switch (type) {
          case 'CALL':
            if ((isRegularOptions || isCommodityOptions) && event.key === 'ArrowUp') {
              event.preventDefault()
              await handleAction('buy')
            } else if ((isRegularOptions || isCommodityOptions) && event.key === 'ArrowLeft') {
              event.preventDefault()
              await handleAction('sell')
            }
            break
          case 'PUT':
            if ((isRegularOptions || isCommodityOptions) && event.key === 'ArrowDown') {
              event.preventDefault()
              await handleAction('buy')
            } else if ((isRegularOptions || isCommodityOptions) && event.key === 'ArrowRight') {
              event.preventDefault()
              await handleAction('sell')
            }
            break
          case 'FUT':
            if ((isRegularFutures || isCommodityFutures) && event.key === 'ArrowUp') {
              event.preventDefault()
              await handleAction('buy')
            } else if ((isRegularFutures || isCommodityFutures) && event.key === 'ArrowDown') {
              event.preventDefault()
              await handleAction('sell')
            }
            break
          case 'EQ':
            if (selectedSegment.value === 'Stocks Equity' && event.key === 'ArrowUp') {
              event.preventDefault()
              await handleAction('buy')
            } else if (selectedSegment.value === 'Stocks Equity' && event.key === 'ArrowDown') {
              event.preventDefault()
              await handleAction('sell')
            }
            break
        }
      }
    }

    onMounted(() => {
      window.addEventListener('keydown', handleTradingKeyPress, true)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleTradingKeyPress, true)
    })
  }

  /**
   * Setup shortcut event listeners for components
   * This is a helper function for components that need to listen for shortcut events
   */
  const setupShortcutListeners = (
    onCloseAll: () => Promise<void>,
    onCancelOrders: () => Promise<void>,
    mode: TradeMode
  ) => {
    const handleCloseAllShortcut = async (event: Event) => {
      const customEvent = event as CustomEvent
      const eventMode = customEvent.detail?.mode
      // Only respond to events meant for this mode or global events
      if (eventMode && eventMode !== mode) return

      logger.debug(`[${mode}] Handling shortcut-close-all event`)
      await onCloseAll()
    }

    const handleCancelOrdersShortcut = async (event: Event) => {
      const customEvent = event as CustomEvent
      const eventMode = customEvent.detail?.mode
      // Only respond to events meant for this mode or global events
      if (eventMode && eventMode !== mode) return

      logger.debug(`[${mode}] Handling shortcut-cancel-orders event`)
      await onCancelOrders()
    }

    onMounted(() => {
      logger.debug(`[${mode}] Setting up shortcut event listeners`)
      window.addEventListener('shortcut-close-all', handleCloseAllShortcut)
      window.addEventListener('shortcut-cancel-orders', handleCancelOrdersShortcut)
    })

    onBeforeUnmount(() => {
      logger.debug(`[${mode}] Cleaning up shortcut event listeners`)
      window.removeEventListener('shortcut-close-all', handleCloseAllShortcut)
      window.removeEventListener('shortcut-cancel-orders', handleCancelOrdersShortcut)
    })
  }

  return {
    setupGlobalShortcuts,
    setupTradingShortcuts,
    setupShortcutListeners,
  }
}
