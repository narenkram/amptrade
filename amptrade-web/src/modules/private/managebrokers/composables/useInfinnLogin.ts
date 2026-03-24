import { ref } from 'vue'
import { generateHash } from '@/modules/utils/crypto'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { BrokerStore } from '@/modules/private/shared/stores/brokerStore'
import api from '@/modules/common/api/axios'

interface InfinnLoginForm {
  password: string
  totp: string
}

interface LoginResponse {
  stat: 'Ok' | 'Not_Ok'
  susertoken?: string
  emsg?: string
}

export function useInfinnLogin() {
  const error = ref<string | null>(null)
  const isInfinnLoggingIn = ref<boolean>(false)
  const showLoginModal = ref<boolean>(false)
  const loginForm = ref<InfinnLoginForm>({
    password: '',
    totp: '',
  })

  const resetForm = () => {
    loginForm.value = { password: '', totp: '' }
    error.value = null
    showLoginModal.value = false
  }

  const handleLogin = async (
    broker: Broker,
    brokerStore: BrokerStore,
    password: string,
    totp: string,
  ): Promise<void> => {
    const brokerId = broker.id

    try {
      isInfinnLoggingIn.value = true
      error.value = null
      brokerStore.setLoading(brokerId, true)

      const pwd = await generateHash(password)
      const appkey = await generateHash(`${broker.clientId}|${broker.apiKey}`)

      const jData = {
        apkversion: '1.0.0',
        uid: broker.clientId,
        pwd: pwd,
        factor2: totp,
        vc: `${broker.clientId}_U`,
        appkey: appkey,
        imei: 'mac',
        source: 'API',
      }

      const response = await api.post(`${import.meta.env.VITE_API_URL}/infinn/login`, {
        jKey: broker.apiKey,
        jData: JSON.stringify(jData),
      })
      const data = response.data as LoginResponse
      if (data.stat === 'Ok' && data.susertoken) {
        const updatedBroker = await brokerStore.updateBrokerToken(brokerId, data.susertoken)
        console.log('Broker updated:', updatedBroker.status)
        resetForm()
      } else {
        throw new Error(data.emsg || 'Failed to login')
      }
    } catch (err) {
      console.error('Infinn login failed:', err)
      error.value = err instanceof Error ? err.message : 'Failed to complete authentication'
      throw err
    } finally {
      isInfinnLoggingIn.value = false
      brokerStore.setLoading(brokerId, false)
    }
  }

  return {
    error,
    isInfinnLoggingIn,
    showLoginModal,
    loginForm,
    handleLogin,
    resetForm,
  }
}
