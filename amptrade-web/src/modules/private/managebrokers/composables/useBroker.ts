import { ref, readonly } from 'vue'
import { storeToRefs } from 'pinia'
import { useBrokerStore } from '@/modules/private/shared/stores/brokerStore'
import type { NewBrokerForm, Broker } from '@/modules/private/shared/types/broker'
import { handleError } from '@/modules/utils/errorHandling'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'

const maskText = (text: string, visiblePercent: number = 30) => {
  if (!text) return ''
  if (text.length <= 4) return '*'.repeat(text.length)

  // Calculate visible chars (minimum 2, maximum 4 on each end)
  const visibleChars = Math.min(
    4,
    Math.max(2, Math.floor((text.length * (visiblePercent / 100)) / 2)),
  )
  return (
    text.slice(0, visibleChars) +
    '*'.repeat(Math.max(4, text.length - visibleChars * 2)) +
    text.slice(-visibleChars)
  )
}

const selectedBroker = ref<Broker | null>(null)

export function useBroker() {
  const store = useBrokerStore()
  const { brokers } = storeToRefs(store)
  const isAddingBroker = ref(false)
  const error = ref<string | null>(null)

  const maskClientId = (clientId: string) => maskText(clientId, 30)
  const maskApiKey = (key: string) => maskText(key, 20)
  const maskApiToken = (token: string) => (token ? maskText(token, 20) : '')

  const getStatusClass = (status: string) => ({
    'badge rounded-pill text-bg-danger': status === BROKER_CONSTANTS.STATUS.INVALID,
    'badge rounded-pill text-bg-warning': status === BROKER_CONSTANTS.STATUS.MISSING,
    'badge rounded-pill text-bg-success': status === BROKER_CONSTANTS.STATUS.VALID,
  })

  const getLoginButtonClass = (broker: Broker) => ({
    'btn-outline': broker.status !== BROKER_CONSTANTS.STATUS.VALID,
    'btn-success': broker.status === BROKER_CONSTANTS.STATUS.VALID,
  })

  const addBroker = async (form: NewBrokerForm) => {
    try {
      isAddingBroker.value = true
      error.value = null
      return store.addBroker(form)
    } catch (e) {
      error.value = handleError(e, 'Failed to add broker')
      throw e
    } finally {
      isAddingBroker.value = false
    }
  }

  const removeBroker = (brokerId: string) => {
    try {
      store.removeBroker(brokerId)
    } catch (e) {
      error.value = 'Failed to remove broker'
      throw e
    }
  }

  const validateAllBrokers = async () => {
    try {
      await store.validateAllBrokers()
    } catch (e) {
      error.value = handleError(e, 'Failed to validate brokers')
      throw e
    }
  }

  const setSelectedBroker = (broker: Broker | null) => {
    selectedBroker.value = broker
  }

  return {
    brokers,
    isAddingBroker,
    error,
    addBroker,
    removeBroker,
    maskClientId,
    maskApiKey,
    maskApiToken,
    getStatusClass,
    getLoginButtonClass,
    validateAllBrokers,
    selectedBroker: readonly(selectedBroker),
    setSelectedBroker,
  }
}
