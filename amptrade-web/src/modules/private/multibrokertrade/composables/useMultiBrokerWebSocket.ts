import { ref, onUnmounted, onMounted } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import { getWebSocketAdapter } from '@/modules/private/shared/adapters/websocketAdapters'

interface WebSocketMessage {
  action: 'subscribe' | 'unsubscribe' | 'auth' | 'set_mode'
  symbols?: Array<string>
  usersession?: string
  userid?: string
  firebaseToken?: string
  access_token?: string
  api_key?: string
  isPositionSubscription?: boolean
  mode?: string // Add mode parameter for Zerodha
  tokens?: Array<number> // Add tokens parameter for Zerodha
}

// Constants
const RECONNECT_DELAY = 5000
const CONNECTION_TIMEOUT = 10000
const MAX_RECONNECT_ATTEMPTS = 50

// State
const websocketConnections = ref<Map<string, WebSocket>>(new Map())
const messageQueue = ref<Map<string, WebSocketMessage[]>>(new Map())
const reconnectAttempts = ref<Map<string, number>>(new Map())
const reconnectTimeouts = ref<Map<string, NodeJS.Timeout>>(new Map())
const intentionalDisconnects = ref<Set<string>>(new Set())

// Add separate tracking for regular subscriptions and position subscriptions
const subscribedSymbols = ref<Map<string, Array<{ exchange: string; token: string }>>>(new Map())
const positionSubscriptions = ref<Map<string, Array<{ exchange: string; token: string }>>>(
  new Map(),
)

// Store the last valid broker for each broker type
const lastValidBrokers = ref<Map<string, Broker>>(new Map())
const primaryQuoteBrokerType = ref<string | null>(null)

export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
  ERROR: 'error',
} as const

const wsStatus = ref<Record<string, string>>({
  Flattrade: CONNECTION_STATES.DISCONNECTED,
  Shoonya: CONNECTION_STATES.DISCONNECTED,
  Zebu: CONNECTION_STATES.DISCONNECTED,
  Tradesmart: CONNECTION_STATES.DISCONNECTED,
  Zerodha: CONNECTION_STATES.DISCONNECTED,
  Upstox: CONNECTION_STATES.DISCONNECTED,
})

const getWebSocketUrl = (broker: Broker) => {
  switch (broker.type.toLowerCase()) {
    case 'flattrade':
      return process.env.FLATTRADE_WS_URL as string
    case 'shoonya':
      return process.env.SHOONYA_WS_URL as string
    case 'infinn':
      return process.env.INFINN_WS_URL as string
    case 'zebu':
      return process.env.ZEBU_WS_URL as string
    case 'tradesmart':
      return process.env.TRADESMART_WS_URL as string
    case 'zerodha':
      return process.env.ZERODHA_WS_URL as string
    case 'upstox':
      return process.env.UPSTOX_WS_URL as string
    default:
      throw new Error(`Unknown broker type: ${broker.type}`)
  }
}

export function useMultiBrokerWebSocket() {
  const processMessageQueue = (broker: Broker) => {
    if (!broker.type) return

    const ws = websocketConnections.value.get(broker.type)
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const queue = messageQueue.value.get(broker.type) || []
    while (queue.length > 0) {
      const message = queue.shift()
      if (message) {
        try {
          // Check if this is a Zerodha message format (has tokens array instead of symbols)
          const isZerodhaFormat = Array.isArray(message.tokens)

          // If this is a position subscription, update the position tracking separately
          if (message.action === 'subscribe' && message.isPositionSubscription) {
            if (isZerodhaFormat && message.tokens) {
              // Convert numeric tokens to exchange|token format for internal tracking
              const positionSymbols = message.tokens.map((token) => ({
                exchange: 'NSE', // Default to NSE for Zerodha
                token: token.toString(),
              }))
              positionSubscriptions.value.set(broker.type, positionSymbols)
            } else if (message.symbols) {
              // Extract position symbols from the message
              const positionSymbols = message.symbols.map((symbolStr) => {
                const [exchange, token] = symbolStr.split('|')
                return { exchange, token }
              })
              positionSubscriptions.value.set(broker.type, positionSymbols)
            }
          }

          // If this is a regular subscription, update the subscribed symbols tracking
          if (message.action === 'subscribe' && !message.isPositionSubscription) {
            if (isZerodhaFormat && message.tokens) {
              // Convert numeric tokens to exchange|token format for internal tracking
              const symbols = message.tokens.map((token) => ({
                exchange: 'NSE', // Default to NSE for Zerodha
                token: token.toString(),
              }))
              const currentSymbols = subscribedSymbols.value.get(broker.type) || []
              subscribedSymbols.value.set(broker.type, [...currentSymbols, ...symbols])
            } else if (message.symbols) {
              // Extract symbols from the standard format
              const symbols = message.symbols.map((symbolStr) => {
                const [exchange, token] = symbolStr.split('|')
                return { exchange, token }
              })
              const currentSymbols = subscribedSymbols.value.get(broker.type) || []
              subscribedSymbols.value.set(broker.type, [...currentSymbols, ...symbols])
            }
          }

          // If this is an unsubscribe message, update the tracking accordingly
          if (message.action === 'unsubscribe') {
            if (isZerodhaFormat && message.tokens) {
              // Convert numeric tokens to format for comparison with tracking
              const symbolsToUnsubscribe = message.tokens.map((token) => ({
                exchange: 'NSE', // Default to NSE for Zerodha
                token: token.toString(),
              }))

              // Remove from subscribed symbols
              const currentSymbols = subscribedSymbols.value.get(broker.type) || []
              const filteredSymbols = currentSymbols.filter(
                (sub) => !symbolsToUnsubscribe.some((sym) => sym.token === sub.token),
              )
              subscribedSymbols.value.set(broker.type, filteredSymbols)
            } else if (message.symbols) {
              const symbolsToUnsubscribe = message.symbols.map((symbolStr) => {
                const [exchange, token] = symbolStr.split('|')
                return { exchange, token }
              })

              // Remove from subscribed symbols for this broker
              const currentSymbols = subscribedSymbols.value.get(broker.type) || []
              const filteredSymbols = currentSymbols.filter(
                (sub) =>
                  !symbolsToUnsubscribe.some(
                    (sym) => sym.exchange === sub.exchange && sym.token === sub.token,
                  ),
              )
              subscribedSymbols.value.set(broker.type, filteredSymbols)
            }
          }

          ws.send(JSON.stringify(message))
        } catch (error) {
          console.error(`Error sending queued message to ${broker.type}:`, error)
          queue.unshift(message) // Put message back at start of queue
          break
        }
      }
    }
    messageQueue.value.set(broker.type, queue)
  }

  const isReconnecting = new Map<string, boolean>()

  const handleReconnect = (broker: Broker) => {
    if (!broker.type) return

    // Prevent overlapping reconnects for the same broker
    if (isReconnecting.get(broker.type)) {
      return
    }
    isReconnecting.set(broker.type, true)

    // Mark this as NOT an intentional disconnect to preserve subscriptions
    intentionalDisconnects.value.delete(broker.type)

    const attempts = reconnectAttempts.value.get(broker.type) || 0
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      wsStatus.value[broker.type] = CONNECTION_STATES.FAILED
      console.error(`Max reconnection attempts reached for ${broker.type}`)
      isReconnecting.set(broker.type, false)
      return
    }

    const timeout = reconnectTimeouts.value.get(broker.type)
    if (timeout) {
      clearTimeout(timeout)
    }

    const newTimeout = setTimeout(() => {
      reconnectAttempts.value.set(broker.type, attempts + 1)
      connectWebSocket(broker)
      isReconnecting.set(broker.type, false)
    }, RECONNECT_DELAY)

    reconnectTimeouts.value.set(broker.type, newTimeout)
  }

  const disconnectWebSocket = (broker: Broker) => {
    if (!broker.type) return

    // Mark this as an intentional disconnect
    intentionalDisconnects.value.add(broker.type)

    const timeout = reconnectTimeouts.value.get(broker.type)
    if (timeout) {
      clearTimeout(timeout)
      reconnectTimeouts.value.delete(broker.type)
    }

    // Reset reconnect attempts
    reconnectAttempts.value.delete(broker.type)

    // If this is an intentional disconnect, clear the message queue
    // Otherwise preserve it for reconnection
    if (intentionalDisconnects.value.has(broker.type)) {
      messageQueue.value.delete(broker.type)

      // Clear all subscriptions tracking only for intentional disconnects
      subscribedSymbols.value.delete(broker.type)
      positionSubscriptions.value.delete(broker.type)
    }

    const ws = websocketConnections.value.get(broker.type)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close()
    }

    websocketConnections.value.delete(broker.type)
    wsStatus.value[broker.type] = CONNECTION_STATES.DISCONNECTED
  }

  const connectWebSocket = async (broker: Broker) => {
    if (!broker || broker.status !== BROKER_CONSTANTS.STATUS.VALID || !broker.type) return

    // Reset intentional disconnect flag when connecting
    console.log(
      `MultiBrokerWebSocket: Connecting to broker ${broker?.type}, resetting intentional disconnect flag`,
    )
    intentionalDisconnects.value.delete(broker.type)

    const ws = websocketConnections.value.get(broker.type)
    if (ws?.readyState === WebSocket.OPEN) {
      return
    }

    // Update lastValidBrokers map with this broker
    lastValidBrokers.value.set(broker.type, broker)

    wsStatus.value[broker.type] = CONNECTION_STATES.CONNECTING
    const wsUrl = getWebSocketUrl(broker)

    try {
      const newWs = new WebSocket(wsUrl)
      websocketConnections.value.set(broker.type, newWs)

      // Connection timeout handler
      const connectionTimeout = setTimeout(() => {
        if (newWs.readyState !== WebSocket.OPEN) {
          newWs.close()
          wsStatus.value[broker.type] = CONNECTION_STATES.FAILED
          console.error(`WebSocket connection timeout for ${broker.type}`)
          handleReconnect(broker)
        }
      }, CONNECTION_TIMEOUT)

      newWs.onopen = async () => {
        clearTimeout(connectionTimeout)
        console.log(`🔗 WebSocket: Connected to ${broker.type}`)
        reconnectAttempts.value.delete(broker.type)
        wsStatus.value[broker.type] = CONNECTION_STATES.CONNECTED

        try {
          const authMessage: WebSocketMessage = { action: 'auth' }
          if (broker.type.toLowerCase() === 'zerodha') {
            authMessage.access_token = broker.apiToken
            authMessage.api_key = broker.apiKey
          } else if (broker.type.toLowerCase() === 'upstox') {
            authMessage.access_token = broker.apiToken
          } else {
            authMessage.usersession = broker.apiToken
            authMessage.userid = broker.clientId
          }
          newWs.send(JSON.stringify(authMessage))

          // Process any queued messages after authentication with a slight delay
          setTimeout(() => {
            if (newWs.readyState === WebSocket.OPEN) {
              console.log(
                `Processing queued messages for ${broker.type} after connection established`,
              )
              processMessageQueue(broker)

              // After processing the queue, check if we need to resubscribe to position symbols
              const positionSubs = positionSubscriptions.value.get(broker.type) || []
              if (positionSubs.length > 0) {
                console.log(
                  `Resubscribing to position symbols for ${broker.type} after reconnection:`,
                  positionSubs,
                )

                // Check if this is Zerodha (they have a different API)
                const isZerodha = broker.type.toLowerCase() === 'zerodha'

                const message: WebSocketMessage = isZerodha ?
                  {
                    action: 'subscribe',
                    tokens: positionSubs.map(({ token }) => parseInt(token, 10)),
                  } :
                  {
                    action: 'subscribe',
                    symbols: positionSubs.map(({ exchange, token }) => `${exchange}|${token}`),
                    isPositionSubscription: true,
                  }

                const queue = messageQueue.value.get(broker.type) || []
                queue.push(message)
                messageQueue.value.set(broker.type, queue)
                processMessageQueue(broker)
              }

              // Also check if there are any regular subscriptions to restore
              const regularSubs = subscribedSymbols.value.get(broker.type) || []
              if (regularSubs.length > 0) {
                console.log(
                  `Resubscribing to trading symbols for ${broker.type} after reconnection:`,
                  regularSubs,
                )

                // Check if this is Zerodha (they have a different API)
                const isZerodha = broker.type.toLowerCase() === 'zerodha'

                const message: WebSocketMessage = isZerodha ?
                  {
                    action: 'subscribe',
                    tokens: regularSubs.map(({ token }) => parseInt(token, 10)),
                  } :
                  {
                    action: 'subscribe',
                    symbols: regularSubs.map(({ exchange, token }) => `${exchange}|${token}`),
                    isPositionSubscription: false,
                  }

                const queue = messageQueue.value.get(broker.type) || []
                queue.push(message)
                messageQueue.value.set(broker.type, queue)
                processMessageQueue(broker)

                // If this is Zerodha, also set the mode
                if (isZerodha && regularSubs.length > 0) {
                  setTimeout(() => {
                    if (newWs.readyState === WebSocket.OPEN) {
                      const numericTokens = regularSubs.map(({ token }) => parseInt(token, 10))

                      // Separate index and non-index tokens
                      const indexTokens = numericTokens.filter(
                        (token) =>
                          (String(token).startsWith('2') && String(token).length === 6) || // NIFTY pattern
                          token < 1000, // SENSEX/BSE pattern
                      )

                      const nonIndexTokens = numericTokens.filter(
                        (token) =>
                          !((String(token).startsWith('2') && String(token).length === 6) || token < 1000),
                      )

                      // Set full mode for index tokens
                      if (indexTokens.length > 0) {
                        const indexModeMessage: WebSocketMessage = {
                          action: 'set_mode',
                          tokens: indexTokens,
                          mode: 'full', // For indices, we need full mode to get all fields
                        }
                        const queue = messageQueue.value.get(broker.type) || []
                        queue.push(indexModeMessage)
                        messageQueue.value.set(broker.type, queue)
                      }

                      // Set quote mode for non-index tokens
                      if (nonIndexTokens.length > 0) {
                        const standardModeMessage: WebSocketMessage = {
                          action: 'set_mode',
                          tokens: nonIndexTokens,
                          mode: 'quote', // Using 'quote' mode for regular instruments
                        }
                        const queue = messageQueue.value.get(broker.type) || []
                        queue.push(standardModeMessage)
                        messageQueue.value.set(broker.type, queue)
                      }

                      processMessageQueue(broker)
                    }
                  }, 200)
                }
              }
            }
          }, 1000)
        } catch (error) {
          console.error(`Error during authentication for ${broker.type}:`, error)
          wsStatus.value[broker.type] = CONNECTION_STATES.ERROR
          handleReconnect(broker)
        }
      }

      newWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)


          // Handle broker connection established notification
          if (data.type === 'broker_connected') {
            console.log(`Broker connection established for ${broker.type}:`, data.message)
            // Update connection status
            wsStatus.value[broker.type] = CONNECTION_STATES.CONNECTED
            // Dispatch event for other components that might need to know
            window.dispatchEvent(
              new CustomEvent('broker-connected', {
                detail: { message: data.message, broker: broker.type },
              }),
            )
            return
          }

          // Handle broker disconnection notification
          if (data.type === 'broker_disconnected') {
            console.log(`Broker connection lost for ${broker.type}, reconnecting...`)
            intentionalDisconnects.value.delete(broker.type)

            // Use stored broker information to reconnect
            const brokerToReconnect = lastValidBrokers.value.get(broker.type)
            if (brokerToReconnect) {
              // Don't call disconnectWebSocket which would erase subscriptions
              // Just close the socket and reconnect
              const ws = websocketConnections.value.get(broker.type)
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close()
              }
              // Force a small delay before reconnecting to avoid rapid reconnect cycles
              setTimeout(() => {
                connectWebSocket(brokerToReconnect)
              }, 1000)
            }
            return
          }


          // Check for order update messages
          if (data.type === 'order_update') {
            window.dispatchEvent(
              new CustomEvent('order-update', {
                detail: { ...data, broker: broker.type },
              }),
            )
            return
          }

          // Handle regular quote updates
          // Get the appropriate adapter based on broker type
          const adapter = getWebSocketAdapter(broker.type || 'flattrade')

          // Use adapter to convert broker-specific data to standardized format
          const standardizedData = adapter(data)

          // Add broker information to standardized data for multi-broker tracking
          standardizedData.broker = broker.type

          if (primaryQuoteBrokerType.value && broker.type !== primaryQuoteBrokerType.value) {
            return
          }

          const quoteEvent = new CustomEvent('quote-update', {
            detail: standardizedData,
          })

          // Log when dispatching quote events
          if (standardizedData.token && standardizedData.ltp) {
            // console.log(
            //   `📊 [${broker.type}] Dispatching quote update: token=${standardizedData.token}, ltp=${standardizedData.ltp}, exchange=${standardizedData.exchange}`,
            // )
          }

          window.dispatchEvent(quoteEvent)
        } catch (error) {
          console.error(`❌ [${broker.type}] WebSocket: Error processing message:`, error)
        }
      }

      newWs.onclose = () => {
        wsStatus.value[broker.type] = CONNECTION_STATES.DISCONNECTED
        console.log(`WebSocket disconnected from ${broker.type}`)

        // Only attempt reconnection if this wasn't an intentional disconnect
        if (!intentionalDisconnects.value.has(broker.type)) {
          console.log(
            `Auto-reconnecting to ${broker.type} since disconnection was not intentional`,
            `Current position subscriptions: ${(positionSubscriptions.value.get(broker.type) || []).length}`,
            `Current symbol subscriptions: ${(subscribedSymbols.value.get(broker.type) || []).length}`,
          )
          const brokerToReconnect = lastValidBrokers.value.get(broker.type)
          if (brokerToReconnect) {
            handleReconnect(brokerToReconnect)
          }
        } else {
          console.log(`Not reconnecting to ${broker.type} - disconnection was intentional`)
        }
      }

      newWs.onerror = (error) => {
        wsStatus.value[broker.type] = CONNECTION_STATES.ERROR
        console.error(`WebSocket error for ${broker.type}:`, error)
      }
    } catch (error) {
      console.error(`Error creating WebSocket for ${broker.type}:`, error)
      wsStatus.value[broker.type] = CONNECTION_STATES.FAILED
      handleReconnect(broker)
    }
  }

  const connectAllBrokers = async (brokers: Broker[]) => {
    for (const broker of brokers) {
      await connectWebSocket(broker)
    }
  }

  const subscribe = async (symbols: Array<{ exchange: string; token: string }>) => {
    // Only proceed if we have valid symbols to subscribe to
    if (symbols && symbols.length > 0) {
      console.log('📊 MultiBroker: Subscribing to symbols:', symbols)

      // Send subscription to all connected brokers
      for (const [brokerType, ws] of websocketConnections.value.entries()) {
        if (primaryQuoteBrokerType.value && brokerType !== primaryQuoteBrokerType.value) {
          continue
        }
        // Check if this is Zerodha (they have a different API)
        const isZerodha = brokerType.toLowerCase() === 'zerodha'

        // Add to tracking for this broker
        const currentSymbols = subscribedSymbols.value.get(brokerType) || []
        subscribedSymbols.value.set(brokerType, [
          ...currentSymbols,
          ...symbols.filter(
            (sym) =>
              !currentSymbols.some((s) => s.exchange === sym.exchange && s.token === sym.token),
          ),
        ])

        if (ws.readyState === WebSocket.OPEN) {
          try {
            if (isZerodha) {
              // Zerodha uses a different format - numeric tokens without exchange prefix
              const numericTokens = symbols.map(({ token }) => parseInt(token, 10))

              // Step 1: Subscribe to the symbols
              const subscribeMessage: WebSocketMessage = {
                action: 'subscribe',
                tokens: numericTokens,
              }
              ws.send(JSON.stringify(subscribeMessage))

              // Step 2: After a short delay, set the mode to 'quote' (more reliable than 'ltp')
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  // For indices, we need to detect them by their token structure
                  // Two types of index tokens in Zerodha:
                  // 1. NIFTY family: tokens start with '2' and are 6 digits (like 256265 for NIFTY)
                  // 2. SENSEX/BSE indices: very small tokens (under 1000, like 265 for SENSEX)
                  const indexTokens = numericTokens.filter(
                    (token) =>
                      (String(token).startsWith('2') && String(token).length === 6) || // NIFTY pattern
                      token < 1000, // SENSEX/BSE pattern
                  )

                  const nonIndexTokens = numericTokens.filter(
                    (token) =>
                      !((String(token).startsWith('2') && String(token).length === 6) || token < 1000),
                  )

                  // Set full mode for index tokens
                  if (indexTokens.length > 0) {
                    const indexModeMessage: WebSocketMessage = {
                      action: 'set_mode',
                      tokens: indexTokens,
                      mode: 'full', // For indices, we need full mode to get all fields
                    }
                    ws.send(JSON.stringify(indexModeMessage))
                    console.log('📥 WebSocket: Set mode to full for index tokens:', indexTokens)
                  }

                  // Set quote mode for non-index tokens
                  if (nonIndexTokens.length > 0) {
                    const standardModeMessage: WebSocketMessage = {
                      action: 'set_mode',
                      tokens: nonIndexTokens,
                      mode: 'quote', // Using 'quote' mode for regular instruments
                    }
                    ws.send(JSON.stringify(standardModeMessage))
                    console.log('📥 WebSocket: Set mode to quote for non-index tokens:', nonIndexTokens)
                  }
                }
              }, 200)
            } else {
              // Standard format for other brokers
              const message: WebSocketMessage = {
                action: 'subscribe',
                symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`),
                isPositionSubscription: false,
              }
              ws.send(JSON.stringify(message))
            }
          } catch (error) {
            console.error(`Error sending subscription to ${brokerType}:`, error)
            const queue = messageQueue.value.get(brokerType) || []
            queue.push(isZerodha ?
              { action: 'subscribe', tokens: symbols.map(({ token }) => parseInt(token, 10)) } :
              { action: 'subscribe', symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`), isPositionSubscription: false }
            )
            messageQueue.value.set(brokerType, queue)
          }
        } else {
          const queue = messageQueue.value.get(brokerType) || []
          queue.push(isZerodha ?
            { action: 'subscribe', tokens: symbols.map(({ token }) => parseInt(token, 10)) } :
            { action: 'subscribe', symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`), isPositionSubscription: false }
          )
          messageQueue.value.set(brokerType, queue)
        }
      }
    }
  }

  const unsubscribe = async (symbols: Array<{ exchange: string; token: string }>) => {
    // Only update the tracking array if we have valid symbols
    if (symbols && symbols.length > 0) {
      // For each broker, filter symbols to unsubscribe to exclude position symbols
      for (const [brokerType, ws] of websocketConnections.value.entries()) {
        if (primaryQuoteBrokerType.value && brokerType !== primaryQuoteBrokerType.value) {
          continue
        }
        // Get position symbols for this broker
        const positionSubs = positionSubscriptions.value.get(brokerType) || []

        // Filter out any symbols that are currently in position subscriptions
        const filteredSymbols = symbols.filter(
          (symbol) =>
            !positionSubs.some(
              (posSymbol) =>
                posSymbol.exchange === symbol.exchange && posSymbol.token === symbol.token,
            ),
        )

        if (filteredSymbols.length > 0) {
          // Update tracking for this broker
          const currentSymbols = subscribedSymbols.value.get(brokerType) || []
          subscribedSymbols.value.set(
            brokerType,
            currentSymbols.filter(
              (sub) =>
                !filteredSymbols.some(
                  (sym) => sym.exchange === sub.exchange && sym.token === sub.token,
                ),
            ),
          )

          // Check if this is Zerodha (they have a different API)
          const isZerodha = brokerType.toLowerCase() === 'zerodha'

          if (ws.readyState === WebSocket.OPEN) {
            try {
              if (isZerodha) {
                // Zerodha uses a different format
                const message: WebSocketMessage = {
                  action: 'unsubscribe',
                  tokens: filteredSymbols.map(({ token }) => parseInt(token, 10)),
                }
                ws.send(JSON.stringify(message))
              } else {
                // Standard format for other brokers
                const message: WebSocketMessage = {
                  action: 'unsubscribe',
                  symbols: filteredSymbols.map(({ exchange, token }) => `${exchange}|${token}`),
                }
                ws.send(JSON.stringify(message))
              }
            } catch (error) {
              console.error(`Error sending unsubscription to ${brokerType}:`, error)
              const queue = messageQueue.value.get(brokerType) || []
              queue.push(isZerodha ?
                { action: 'unsubscribe', tokens: filteredSymbols.map(({ token }) => parseInt(token, 10)) } :
                { action: 'unsubscribe', symbols: filteredSymbols.map(({ exchange, token }) => `${exchange}|${token}`) }
              )
              messageQueue.value.set(brokerType, queue)
            }
          } else {
            const queue = messageQueue.value.get(brokerType) || []
            queue.push(isZerodha ?
              { action: 'unsubscribe', tokens: filteredSymbols.map(({ token }) => parseInt(token, 10)) } :
              { action: 'unsubscribe', symbols: filteredSymbols.map(({ exchange, token }) => `${exchange}|${token}`) }
            )
            messageQueue.value.set(brokerType, queue)
          }
        } else {
          console.log(
            `All symbols to unsubscribe for ${brokerType} are position symbols, skipping unsubscription`,
          )
        }
      }
    }
  }

  // New function: subscribeToPositions
  const subscribeToPositions = async (symbols: Array<{ exchange: string; token: string }>) => {
    if (symbols && symbols.length > 0) {
      console.log('📊 MultiBroker: Subscribing to positions:', symbols)

      // Send subscription to all connected brokers
      for (const [brokerType, ws] of websocketConnections.value.entries()) {
        if (primaryQuoteBrokerType.value && brokerType !== primaryQuoteBrokerType.value) {
          continue
        }
        // Update position subscriptions for this broker
        positionSubscriptions.value.set(brokerType, symbols)

        // Check if this is Zerodha (they have a different API)
        const isZerodha = brokerType.toLowerCase() === 'zerodha'

        if (ws.readyState === WebSocket.OPEN) {
          try {
            if (isZerodha) {
              // Zerodha uses a different format - numeric tokens without exchange prefix
              const numericTokens = symbols.map(({ token }) => parseInt(token, 10))

              // Step 1: Subscribe to the symbols
              const subscribeMessage: WebSocketMessage = {
                action: 'subscribe',
                tokens: numericTokens,
              }
              ws.send(JSON.stringify(subscribeMessage))

              // Step 2: After a short delay, set the mode
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  // Separate index and non-index tokens
                  const indexTokens = numericTokens.filter(
                    (token) =>
                      (String(token).startsWith('2') && String(token).length === 6) || // NIFTY pattern
                      token < 1000, // SENSEX/BSE pattern
                  )

                  const nonIndexTokens = numericTokens.filter(
                    (token) =>
                      !((String(token).startsWith('2') && String(token).length === 6) || token < 1000),
                  )

                  // Set full mode for index tokens
                  if (indexTokens.length > 0) {
                    const indexModeMessage: WebSocketMessage = {
                      action: 'set_mode',
                      tokens: indexTokens,
                      mode: 'full', // For indices, we need full mode to get all fields
                    }
                    ws.send(JSON.stringify(indexModeMessage))
                  }

                  // Set quote mode for non-index tokens
                  if (nonIndexTokens.length > 0) {
                    const standardModeMessage: WebSocketMessage = {
                      action: 'set_mode',
                      tokens: nonIndexTokens,
                      mode: 'quote', // Using 'quote' mode for regular instruments
                    }
                    ws.send(JSON.stringify(standardModeMessage))
                  }
                }
              }, 200)
            } else {
              // Standard format for other brokers
              const message: WebSocketMessage = {
                action: 'subscribe',
                symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`),
                isPositionSubscription: true,
              }
              ws.send(JSON.stringify(message))
            }
          } catch (error) {
            console.error(`Error sending position subscription to ${brokerType}:`, error)
            const queue = messageQueue.value.get(brokerType) || []
            queue.push(isZerodha ?
              { action: 'subscribe', tokens: symbols.map(({ token }) => parseInt(token, 10)) } :
              {
                action: 'subscribe',
                symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`),
                isPositionSubscription: true
              }
            )
            messageQueue.value.set(brokerType, queue)
          }
        } else {
          const queue = messageQueue.value.get(brokerType) || []
          queue.push(isZerodha ?
            { action: 'subscribe', tokens: symbols.map(({ token }) => parseInt(token, 10)) } :
            {
              action: 'subscribe',
              symbols: symbols.map(({ exchange, token }) => `${exchange}|${token}`),
              isPositionSubscription: true
            }
          )
          messageQueue.value.set(brokerType, queue)
        }
      }
    }
  }

  // New function: unsubscribeFromPositions
  const unsubscribeFromPositions = () => {
    for (const [brokerType, positionSubs] of positionSubscriptions.value.entries()) {
      if (primaryQuoteBrokerType.value && brokerType !== primaryQuoteBrokerType.value) {
        continue
      }
      if (positionSubs.length > 0) {
        console.log(`Unsubscribing from all positions for ${brokerType}:`, positionSubs)

        // Check if this is Zerodha (they have a different API)
        const isZerodha = brokerType.toLowerCase() === 'zerodha'

        const ws = websocketConnections.value.get(brokerType)
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            if (isZerodha) {
              // Zerodha uses a different format
              const message: WebSocketMessage = {
                action: 'unsubscribe',
                tokens: positionSubs.map(({ token }) => parseInt(token, 10)),
              }
              ws.send(JSON.stringify(message))
            } else {
              // Standard format for other brokers
              const message: WebSocketMessage = {
                action: 'unsubscribe',
                symbols: positionSubs.map(({ exchange, token }) => `${exchange}|${token}`),
              }
              ws.send(JSON.stringify(message))
            }
          } catch (error) {
            console.error(`Error unsubscribing from positions for ${brokerType}:`, error)
          }
        }

        // Clear position subscriptions for this broker
        positionSubscriptions.value.delete(brokerType)
      }
    }
  }

  const cleanup = (forceDisconnect = false) => {
    console.log(
      'MultiBrokerWebSocket: Cleanup initiated, disconnection mode:',
      forceDisconnect ? 'full' : 'partial',
    )

    // Only perform full disconnection if specifically requested (like on page navigation)
    if (forceDisconnect) {
      // Unsubscribe from all symbols
      for (const [brokerType, subs] of subscribedSymbols.value.entries()) {
        if (subs.length > 0) {
          console.log(
            `MultiBrokerWebSocket: Unsubscribing from ${subs.length} symbols for ${brokerType}`,
          )
          unsubscribe(subs)
        }
      }

      // Mark all current connections as intentional disconnects
      for (const brokerType of websocketConnections.value.keys()) {
        console.log(
          `MultiBrokerWebSocket: Marking ${brokerType} for intentional disconnect, reconnections will be disabled`,
        )
        intentionalDisconnects.value.add(brokerType)
      }

      // Disconnect all WebSocket connections
      for (const [brokerType, ws] of websocketConnections.value.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
          console.log(
            `MultiBrokerWebSocket: Closing websocket connection for broker: ${brokerType}`,
          )
          ws.close()
        }
      }

      // Clear all timeouts
      console.log('MultiBrokerWebSocket: Clearing all reconnect timeouts')
      for (const timeout of reconnectTimeouts.value.values()) {
        clearTimeout(timeout)
      }

      // Reset all collections
      websocketConnections.value.clear()
      messageQueue.value.clear()
      reconnectAttempts.value.clear()
      reconnectTimeouts.value.clear()
      subscribedSymbols.value.clear()
      positionSubscriptions.value.clear()
      lastValidBrokers.value.clear()
      intentionalDisconnects.value.clear()

      // Reset status
      for (const broker in wsStatus.value) {
        wsStatus.value[broker] = CONNECTION_STATES.DISCONNECTED
      }

      console.log('MultiBrokerWebSocket: Cleanup completed, all connections closed')
    } else {
      console.log('MultiBrokerWebSocket: Partial cleanup - keeping connections active')
    }
  }

  onMounted(() => {})

  onUnmounted(() => {
    cleanup(false)
  })

  // Refresh/reset all broker connections - useful when LTP updates stop working
  const refreshBrokerConnections = async (primaryBroker: Broker | null) => {
    console.log('🔄 RefreshBrokerConnections: Starting connection refresh...')

    // 1. Store current subscriptions before cleanup
    const storedPositionSubs = new Map(positionSubscriptions.value)
    const storedRegularSubs = new Map(subscribedSymbols.value)

    console.log('🔄 RefreshBrokerConnections: Stored subscriptions:', {
      positionSubs: Array.from(storedPositionSubs.entries()),
      regularSubs: Array.from(storedRegularSubs.entries()),
    })

    // 2. Perform full cleanup - disconnect all connections
    cleanup(true)

    // 3. Wait a moment for cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 4. Reconnect to primary broker if valid
    if (primaryBroker && primaryBroker.status === BROKER_CONSTANTS.STATUS.VALID) {
      console.log(
        '🔄 RefreshBrokerConnections: Reconnecting to primary broker:',
        primaryBroker.type,
      )
      await connectWebSocket(primaryBroker)

      // 5. Wait for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 6. Restore position subscriptions
      const primaryPositionSubs = storedPositionSubs.get(primaryBroker.type) || []
      if (primaryPositionSubs.length > 0) {
        console.log(
          '🔄 RefreshBrokerConnections: Restoring position subscriptions:',
          primaryPositionSubs,
        )
        await subscribeToPositions(primaryPositionSubs)
      }

      // 7. Restore regular subscriptions
      const primaryRegularSubs = storedRegularSubs.get(primaryBroker.type) || []
      if (primaryRegularSubs.length > 0) {
        console.log(
          '🔄 RefreshBrokerConnections: Restoring regular subscriptions:',
          primaryRegularSubs,
        )
        await subscribe(primaryRegularSubs)
      }
    }

    console.log('🔄 RefreshBrokerConnections: Connection refresh completed')
  }

  const setPrimaryQuoteBrokerType = (type: string | null) => {
    primaryQuoteBrokerType.value = type
  }

  return {
    wsStatus,
    connectWebSocket,
    disconnectWebSocket,
    connectAllBrokers,
    CONNECTION_STATES,
    subscribe,
    unsubscribe,
    subscribeToPositions,
    unsubscribeFromPositions,
    cleanup,
    setPrimaryQuoteBrokerType,
    refreshBrokerConnections,
  }
}
