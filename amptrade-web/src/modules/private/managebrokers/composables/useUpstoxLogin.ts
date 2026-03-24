import { ref } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { BrokerStore } from '@/modules/private/shared/stores/brokerStore'
import api from '@/modules/common/api/axios'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'

interface UpstoxTokenResponse {
  success: boolean
  message?: string
  data?: {
    access_token: string
    user_id?: string
  }
  error?: string
}

export function useUpstoxLogin() {
  const error = ref<string | null>(null)
  const isLoggingIn = ref(false)

  const handleLogin = async (broker: Broker, brokerStore: BrokerStore): Promise<void> => {
    try {
      isLoggingIn.value = true
      brokerStore.setLoading(broker.id, true)

      const redirectUri = BROKER_CONSTANTS.REDIRECT_URLS.Upstox
      const authUrl = `${BROKER_CONSTANTS.AUTH_URLS.Upstox}?client_id=${encodeURIComponent(
        broker.apiKey,
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`

      const authWindow = window.open(authUrl, 'UpstoxAuth', 'width=800,height=600')

      if (!authWindow) {
        throw new Error('Popup window was blocked. Please allow popups and try again.')
      }

      const authPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timed out'))
          authWindow.close()
        }, 300000) // 5 minute timeout

        window.addEventListener('message', async function authHandler(event) {
          if (event.origin === window.location.origin && event.data.type === 'UPSTOX_AUTH_CODE') {
            clearTimeout(timeout)
            window.removeEventListener('message', authHandler)
            resolve(event.data.code as string)
            authWindow.close()
          }
        })
      })

      const code = await authPromise

      // Exchange authorization code for access token via API server
      const response = await api.post(`${import.meta.env.VITE_API_URL}/upstox/generateToken`, {
        client_id: broker.apiKey,
        client_secret: broker.apiSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })

      const data = response.data as UpstoxTokenResponse
      if (data.success && data.data?.access_token) {
        await brokerStore.updateBrokerToken(broker.id, data.data.access_token)
      } else {
        throw new Error(data.error || data.message || 'Failed to generate token')
      }
    } catch (err) {
      console.error('Upstox login failed:', err)
      error.value = err instanceof Error ? err.message : 'Failed to complete authentication'
      throw err
    } finally {
      isLoggingIn.value = false
      brokerStore.setLoading(broker.id, false)
    }
  }

  return {
    error,
    isUpstoxLoggingIn: isLoggingIn,
    handleLogin,
  }
}