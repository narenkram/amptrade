import { ref } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { BrokerStore } from '@/modules/private/shared/stores/brokerStore'
import api from '@/modules/common/api/axios'
import { generateHash } from '@/modules/utils/crypto'

interface ZerodhaTokenResponse {
  success: boolean
  message: string
  data?: {
    user_id: string
    access_token: string
  }
  error?: string
}

export function useZerodhaLogin() {
  const error = ref<string | null>(null)
  const isLoggingIn = ref(false)
  const showLoginModal = ref(false)

  const handleLogin = async (broker: Broker, brokerStore: BrokerStore): Promise<void> => {
    try {
      isLoggingIn.value = true
      brokerStore.setLoading(broker.id, true)

      // Zerodha uses OAuth flow
      const authWindow = window.open(
        `https://kite.zerodha.com/connect/login?api_key=${broker.apiKey}&v=3`,
        'ZerodhaAuth',
        'width=800,height=600',
      )

      if (!authWindow) {
        throw new Error('Popup window was blocked. Please allow popups and try again.')
      }

      const authPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timed out'))
          authWindow.close()
        }, 300000) // 5 minute timeout

        window.addEventListener('message', async function authHandler(event) {
          if (event.origin === window.location.origin && event.data.type === 'ZERODHA_AUTH_CODE') {
            clearTimeout(timeout)
            window.removeEventListener('message', authHandler)
            resolve(event.data.code)
            authWindow.close()
          }
        })
      })

      const code = await authPromise

      // Generate checksum (SHA-256 of api_key + request_token + api_secret)
      const concatenatedValue = `${broker.apiKey}${code}${broker.apiSecret}`
      const checksum = await generateHash(concatenatedValue)

      // Exchange the authorization code for a token
      const response = await api.post(`${import.meta.env.VITE_API_URL}/zerodha/generateToken`, {
        api_key: broker.apiKey,
        request_token: code,
        api_secret: checksum,
      })

      const data = response.data as ZerodhaTokenResponse
      if (data.success && data.data?.access_token) {
        await brokerStore.updateBrokerToken(broker.id, data.data.access_token)
      } else {
        throw new Error(data.error || data.message || 'Failed to generate token')
      }
    } catch (err) {
      console.error('Zerodha login failed:', err)
      error.value = err instanceof Error ? err.message : 'Failed to complete authentication'
      throw err
    } finally {
      isLoggingIn.value = false
      brokerStore.setLoading(broker.id, false)
    }
  }

  const resetForm = () => {
    error.value = null
  }

  return {
    error,
    handleLogin,
    isZerodhaLogginIn: isLoggingIn,
    showLoginModal,
    resetForm,
  }
}
