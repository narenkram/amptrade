import { ref } from 'vue'
import api from '@/modules/common/api/axios'
import type { Position, TradeActionPayload, Order } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'
import { PRODUCT_TYPES, type ProductTypeDisplay } from '@/modules/private/shared/types/trade'
import { getExchange } from '@/modules/utils/exchangeUtils'
import { logger } from '@/modules/utils/logger'
import { calculateProtectedPrice } from '@/modules/utils/marketProtection'

/**
 * Interface for modifying an order
 */
export interface OrderModification {
  orderId: string
  broker: Broker
  params: {
    prctyp: string
    prc: number
    exch: string
    tsym: string
    qty: number
  }
}

export function useOrderManagement() {
  const loadingStates = ref({
    buy: false,
    sell: false,
    closeAll: false,
    cancelOrders: false,
    modifyOrders: false,
  })
  const error = ref<string | null>(null)

  const assertOrderOperationSuccess = (data: unknown, fallbackMessage: string) => {
    if (!data || typeof data !== 'object') return

    const payload = data as Record<string, unknown>
    const stat = payload.stat
    const emsg = payload.emsg
    const success = payload.success
    const message = payload.message
    const err = payload.error

    if (stat === 'Not_Ok') {
      throw new Error((typeof emsg === 'string' && emsg) || fallbackMessage)
    }

    if (success === false) {
      throw new Error(
        (typeof err === 'string' && err) || (typeof message === 'string' && message) || fallbackMessage,
      )
    }

    const inner = payload.data
    if (inner && typeof inner === 'object') {
      const innerPayload = inner as Record<string, unknown>
      const innerStatus = innerPayload.status
      const innerMessage = innerPayload.message

      if (typeof innerStatus === 'string' && innerStatus !== 'success') {
        throw new Error(
          (typeof innerMessage === 'string' && innerMessage) ||
            (typeof message === 'string' && message) ||
            fallbackMessage,
        )
      }
    }
  }

  const placeOrder = async (payload: TradeActionPayload, broker: Broker) => {
    const action = payload.action.toLowerCase() as 'buy' | 'sell'
    try {
      loadingStates.value[action] = true
      error.value = null

      // Add trading symbol validation
      if (!payload.tradingSymbol) {
        throw new Error('Trading symbol is required')
      }

      // Add detailed logging for order placement
      logger.log(`Placing ${action} order for ${payload.tradingSymbol}:`, {
        quantity: payload.quantity,
        lotSize: payload.lotSize,
        productType: payload.productType,
        orderType: payload.orderType,
        exchange: payload.exchange,
        segment: payload.segment,
      })

      // Update segment validation to include commodity options
      const isOptionsSegment = [
        'Index Options',
        'Stocks Options',
        'Commodity Options', // Add commodity options segment
      ].includes(payload.segment)

      const isFuturesSegment = [
        'Index Futures',
        'Stocks Futures',
        'Commodity Futures', // Add commodity futures segment
      ].includes(payload.segment)

      const isEquitySegment = payload.segment === 'Stocks Equity'

      // Validate instrument type matches segment
      const instrumentType = payload.instrumentType
      if (
        ((instrumentType === 'CALL' || instrumentType === 'PUT') && !isOptionsSegment) ||
        (instrumentType === 'FUT' && !isFuturesSegment) ||
        (instrumentType === 'EQ' && !isEquitySegment)
      ) {
        throw new Error(`Invalid instrument type ${instrumentType} for segment ${payload.segment}`)
      }

      const getTransType = (action: string) => {
        return action === 'BUY' ? 'B' : 'S'
      }

      const getPriceType = (orderType: string) => {
        switch (orderType.toUpperCase()) {
          case 'MARKET':
            return 'MKT'
          case 'LIMIT':
          case 'LIMIT AT LTP':
          case 'MARKET PROTECTION':
            return 'LMT'
          case 'STOPLOSS':
            return 'SL-LMT'
          case 'STOPLOSS_MARKET':
            return 'SL-MKT'
          default:
            return 'MKT'
        }
      }

      // Map display product type to broker format
      const getBrokerProductType = (displayType: ProductTypeDisplay) => {
        switch (displayType) {
          case 'Holding':
            return PRODUCT_TYPES.HOLDING
          case 'Carry Forward':
            return PRODUCT_TYPES.CARRY_FORWARD
          default:
            return PRODUCT_TYPES.INTRADAY
        }
      }

      // NorenAPI brokers (Shoonya, Flattrade, Zebu, Tradesmart, Infinn)
      // For stock equity, use CNC ('C') instead of NRML ('M') for Carry Forward
      // NRML is only valid for F&O segments in NorenAPI
      const norenApiBrokers = ['shoonya', 'flattrade', 'zebu', 'tradesmart', 'infinn']
      const validateNorenApiProductType = (segment: string, productType: string) => {
        // For stock equity with Carry Forward, use CNC instead of NRML
        if (segment === 'Stocks Equity' && productType === PRODUCT_TYPES.CARRY_FORWARD) {
          return PRODUCT_TYPES.HOLDING // Use CNC ('C') for equity holdings
        }
        return productType
      }

      const brokerTypeLower = broker.type.toLowerCase()
      const baseProductType = getBrokerProductType(payload.productType as ProductTypeDisplay)

      // Apply NorenAPI validation for equity orders, otherwise use base product type
      const prd = norenApiBrokers.includes(brokerTypeLower)
        ? validateNorenApiProductType(payload.segment, baseProductType)
        : baseProductType

      const response = await api.post(
        `${import.meta.env.VITE_API_URL}/${broker.type.toLowerCase()}/placeOrder`,
        {
          uid: broker.clientId,
          actid: broker.clientId,
          exch: getExchange(payload.exchange, payload.segment),
          tsym: payload.tradingSymbol,
          qty: payload.quantity.toString(),
          prc:
            payload.orderType === 'Limit' || payload.orderType === 'Limit at LTP'
              ? payload.price?.toString() || '0'
              : payload.orderType === 'Market Protection' && payload.price
                ? calculateProtectedPrice(payload.price, payload.action, payload.tickSize).toString()
                : '0',
          prd,
          trantype: getTransType(payload.action),
          prctyp: getPriceType(payload.orderType),
          ret: 'DAY',
          token: payload.token, // Instrument token (used by Upstox as instrumentKey)
        },
        {
          params: {
            [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
            [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
          },
        },
      )

      assertOrderOperationSuccess(response.data, 'Order placement failed')

      // After successful order placement, dispatch custom event
      window.dispatchEvent(new CustomEvent('funds-update-needed'))

      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to place order'
      throw error.value
    } finally {
      loadingStates.value[action] = false
    }
  }

  const closeAllPositions = async (
    positions: Position[],
    broker: Broker,
    orderType: string = 'Limit at LTP',
    positionLtps: Record<string, number> = {}
  ) => {
    try {
      loadingStates.value.closeAll = true
      error.value = null

      // Process each position sequentially
      for (const position of positions) {
        if (position.quantity === 0) continue

        const action = position.quantity > 0 ? 'SELL' : 'BUY'
        const totalQuantity = Math.abs(position.quantity)
        const freezeQty = position.freezeQuantity || 1000 // Default freeze quantity if not provided
        const lotSize = position.lotSize || 1 // Default lot size if not provided

        // Calculate the number of orders needed based on freeze quantity and lot size
        const orderQuantities = []
        let remainingQty = totalQuantity

        while (remainingQty > 0) {
          // Ensure quantity is a multiple of lot size
          let orderQty = Math.min(remainingQty, freezeQty)
          // Adjust to nearest lot size multiple, if needed
          if (lotSize > 1) {
            orderQty = Math.floor(orderQty / lotSize) * lotSize
          }

          // If after adjusting for lot size, the quantity is 0, take 1 lot at least
          if (orderQty === 0 && remainingQty >= lotSize) {
            orderQty = lotSize
          }

          // If we can't fulfill even one lot, and we still have remaining quantity, force a single lot order
          if (orderQty === 0 && remainingQty > 0) {
            logger.warn(
              `Cannot fulfill order with lot size ${lotSize} for remaining qty ${remainingQty}`,
            )
            break
          }

          if (orderQty > 0) {
            orderQuantities.push(orderQty)
            remainingQty -= orderQty
          } else {
            break // Safety check to prevent infinite loop
          }
        }

        logger.log(
          `Closing position ${position.symbol} with ${orderQuantities.length} orders: ${orderQuantities.join(', ')}`,
        )

        // Place orders sequentially
        for (const qty of orderQuantities) {
          // Determine actual order type and price based on setting
          let actualOrderType = orderType
          let price: number | undefined = undefined

          if (orderType === 'Limit at LTP' || orderType === 'Limit') {
            // Try to get LTP from positionLtps map
            const symbolKey = `${position.exchange}|${position.token}`
            const ltp = positionLtps[symbolKey] || positionLtps[position.token]

            if (ltp && ltp > 0) {
              actualOrderType = 'Limit at LTP'
              price = ltp
            } else {
              // Fallback to market order if LTP not available
              logger.warn(`No LTP available for ${position.symbol}, using market order`)
              actualOrderType = 'MARKET'
            }
          } else if (orderType === 'Market Protection') {
            // Try to get LTP from positionLtps map
            const symbolKey = `${position.exchange}|${position.token}`
            const ltp = positionLtps[symbolKey] || positionLtps[position.token]

            if (ltp && ltp > 0) {
              actualOrderType = 'Market Protection'
              // Calculate protected price based on closing action and tick size
              price = calculateProtectedPrice(ltp, action, position.tickSize)
            } else {
              // Fallback to market order if LTP not available
              logger.warn(`No LTP available for ${position.symbol}, using market order`)
              actualOrderType = 'MARKET'
            }
          }

          const payload: TradeActionPayload = {
            action,
            symbol: position.symbol,
            expiry: '', // Not needed for closing positions
            segment: position.instrumentName,
            tradingSymbol: position.symbol,
            quantity: qty,
            productType: position.productType,
            orderType: actualOrderType,
            exchange: position.exchange,
            price,
          }

          await placeOrder(payload, broker)

          // Wait a short time between orders to avoid rate limiting
          if (orderQuantities.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
      }

      // After closing all positions, dispatch custom event
      window.dispatchEvent(new CustomEvent('funds-update-needed'))

      return { status: 'success', message: 'All positions closed successfully' }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to close all positions'
      throw error.value
    } finally {
      loadingStates.value.closeAll = false
    }
  }

  const cancelOrder = async (orderId: string, broker: Broker) => {
    try {
      loadingStates.value.cancelOrders = true
      error.value = null

      const response = await api.post(
        `${import.meta.env.VITE_API_URL}/${broker.type.toLowerCase()}/cancelOrder`,
        {
          norenordno: orderId,
          uid: broker.clientId,
        },
        {
          params: {
            [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
            [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
          },
        },
      )

      assertOrderOperationSuccess(response.data, 'Order cancellation failed')

      // Dispatch events to refresh orders and positions
      window.dispatchEvent(new Event('order-placed'))
      window.dispatchEvent(new Event('positions-updated'))

      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to cancel order'
      throw error.value
    } finally {
      loadingStates.value.cancelOrders = false
    }
  }

  const cancelAllOrders = async (orders: Order[], broker: Broker) => {
    try {
      loadingStates.value.cancelOrders = true
      error.value = null

      const pendingOrders = orders.filter(
        (order) =>
          order.recordType === 'order' && ['OPEN', 'TRIGGER_PENDING'].includes(order.status),
      )

      const results = await Promise.allSettled(
        pendingOrders.map((order) => cancelOrder(order.orderId, broker)),
      )

      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length > 0) {
        console.error('Some orders failed to cancel:', failures)
      }

      return {
        success: failures.length === 0,
        totalCancelled: results.length - failures.length,
        totalFailed: failures.length,
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to cancel all orders'
      throw error.value
    } finally {
      loadingStates.value.cancelOrders = false
    }
  }

  /**
   * Modify a single pending order
   */
  const modifyOrder = async (
    orderId: string,
    broker: Broker,
    params: {
      prctyp: string // 'MKT' or 'LMT'
      prc: number // New price (0 for market)
      exch: string // Exchange
      tsym: string // Trading symbol
      qty: number // Quantity
    },
  ) => {
    try {
      loadingStates.value.modifyOrders = true
      error.value = null

      const response = await api.post(
        `${import.meta.env.VITE_API_URL}/${broker.type.toLowerCase()}/modifyOrder`,
        {
          norenordno: orderId,
          uid: broker.clientId,
          exch: params.exch,
          tsym: params.tsym,
          qty: params.qty,
          prc: params.prc,
          prctyp: params.prctyp,
        },
        {
          params: {
            [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
            [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
          },
        },
      )

      assertOrderOperationSuccess(response.data, 'Order modification failed')

      // Dispatch events to refresh orders
      window.dispatchEvent(new Event('order-update'))

      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to modify order'
      throw error.value
    } finally {
      loadingStates.value.modifyOrders = false
    }
  }

  /**
   * Modify multiple pending orders sequentially
   */

  const modifyMultipleOrders = async (modifications: OrderModification[]) => {
    try {
      loadingStates.value.modifyOrders = true
      error.value = null

      const results: { orderId: string; success: boolean; error?: string }[] = []

      // Process orders sequentially to avoid rate limiting
      for (const mod of modifications) {
        try {
          await modifyOrder(mod.orderId, mod.broker, mod.params)
          results.push({ orderId: mod.orderId, success: true })
        } catch (err) {
          results.push({
            orderId: mod.orderId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        // Small delay between modifications
        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      const failures = results.filter((r) => !r.success)
      if (failures.length > 0) {
        console.error('Some orders failed to modify:', failures)
      }

      // Dispatch events to refresh orders
      window.dispatchEvent(new Event('order-update'))

      return {
        success: failures.length === 0,
        totalModified: results.length - failures.length,
        totalFailed: failures.length,
        results,
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to modify orders'
      throw error.value
    } finally {
      loadingStates.value.modifyOrders = false
    }
  }

  return {
    loadingStates,
    error,
    placeOrder,
    closeAllPositions,
    cancelOrder,
    cancelAllOrders,
    modifyOrder,
    modifyMultipleOrders,
  }
}
