import { useFlattradeLogin } from './useFlattradeLogin'
import { useShoonyaLogin } from './useShoonyaLogin'
import { useZebuLogin } from './useZebuLogin'
import { useTradesmartLogin } from './useTradesmartLogin'
import { useZerodhaLogin } from './useZerodhaLogin'
import { useUpstoxLogin } from './useUpstoxLogin'
import { ref } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { BrokerStore } from '@/modules/private/shared/stores/brokerStore'

export function useBrokerLogin() {
  const flattradeLogin = useFlattradeLogin()
  const shoonyaLogin = useShoonyaLogin()
  const zebuLogin = useZebuLogin()
  const tradesmartLogin = useTradesmartLogin()
  const zerodhaLogin = useZerodhaLogin()
  const upstoxLogin = useUpstoxLogin()
  const showShoonyaModal = ref(false)
  const showZebuModal = ref(false)
  const showTradesmartModal = ref(false)
  const selectedBroker = ref<Broker | null>(null)
  const storageRef = ref<BrokerStore | null>(null)
  const error = ref<string | null>(null)
  const isLoggingIn = ref(false)

  const handleLogin = async (broker: Broker, brokerStore: BrokerStore) => {
    storageRef.value = brokerStore
    error.value = null
    isLoggingIn.value = true

    try {
      switch (broker.type) {
        case 'Flattrade':
          await flattradeLogin.handleLogin(broker, brokerStore)
          break
        case 'Shoonya':
          selectedBroker.value = broker
          showShoonyaModal.value = true
          break
        case 'Zebu':
          selectedBroker.value = broker
          showZebuModal.value = true
          break
        case 'Tradesmart':
          selectedBroker.value = broker
          showTradesmartModal.value = true
          break
        case 'Zerodha':
          await zerodhaLogin.handleLogin(broker, brokerStore)
          break
        case 'Upstox':
          await upstoxLogin.handleLogin(broker, brokerStore)
          break
        default:
          throw new Error(`Unsupported broker type: ${broker.type}`)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw err
    } finally {
      isLoggingIn.value = false
    }
  }

  const handleShoonyaCredentials = async (password: string, totp: string): Promise<void> => {
    if (!selectedBroker.value || !storageRef.value) {
      throw new Error('Invalid state: missing broker or store reference')
    }

    try {
      await shoonyaLogin.handleLogin(selectedBroker.value, storageRef.value, password, totp)
      showShoonyaModal.value = false
      selectedBroker.value = null
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('An unknown error occurred')
    }
  }

  const handleZebuCredentials = async (password: string, totp: string): Promise<void> => {
    if (!selectedBroker.value || !storageRef.value) {
      throw new Error('Invalid state: missing broker or store reference')
    }

    try {
      await zebuLogin.handleLogin(selectedBroker.value, storageRef.value, password, totp)
      showZebuModal.value = false
      selectedBroker.value = null
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('An unknown error occurred')
    }
  }

  const handleTradesmartCredentials = async (password: string, totp: string): Promise<void> => {
    if (!selectedBroker.value || !storageRef.value) {
      throw new Error('Invalid state: missing broker or store reference')
    }

    try {
      await tradesmartLogin.handleLogin(selectedBroker.value, storageRef.value, password, totp)
      showTradesmartModal.value = false
      selectedBroker.value = null
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('An unknown error occurred')
    }
  }

  return {
    handleLogin,
    handleShoonyaCredentials,
    handleZebuCredentials,
    handleTradesmartCredentials,
    showShoonyaModal,
    showZebuModal,
    showTradesmartModal,
    selectedBroker,
    isLoggingIn,
    error,
  }
}
