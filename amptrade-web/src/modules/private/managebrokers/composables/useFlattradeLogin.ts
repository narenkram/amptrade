import { ref } from 'vue'
import { generateHash } from '@/modules/utils/crypto'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import type { Broker } from '@/modules/private/shared/types/broker'
import type { BrokerStore } from '@/modules/private/shared/stores/brokerStore'
import api from '@/modules/common/api/axios'

interface FlattradeTokenResponse {
  stat: 'Ok' | 'Not_Ok'
  token?: string
  emsg?: string
}

export function useFlattradeLogin() {
  const error = ref<string | null>(null)

  const handleLogin = async (broker: Broker, brokerStore: BrokerStore): Promise<void> => {
    try {
      brokerStore.setLoading(broker.id, true)

      const authWindow = window.open(
        `${BROKER_CONSTANTS.AUTH_URLS.Flattrade}?app_key=${broker.apiKey}`,
        'FlattradeAuth',
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
          if (event.origin === window.location.origin && event.data.type === 'AUTH_CODE') {
            clearTimeout(timeout)
            window.removeEventListener('message', authHandler)
            resolve(event.data.code)
            authWindow.close()
          }
        })
      })

      const code = await authPromise
      const concatenatedValue = `${broker.apiKey}${code}${broker.apiSecret}`
      const hash = await generateHash(concatenatedValue)

      const response = await api.post(`${import.meta.env.VITE_API_URL}/flattrade/generateToken`, {
        api_key: broker.apiKey,
        request_code: code,
        api_secret: hash,
      })

      const data = response.data as FlattradeTokenResponse
      if (data.stat === 'Ok' && data.token) {
        await brokerStore.updateBrokerToken(broker.id, data.token)
      } else {
        throw new Error(data.emsg || 'Failed to generate token')
      }
    } catch (err) {
      console.error('Flattrade login failed:', err)
      error.value = err instanceof Error ? err.message : 'Failed to complete authentication'
      throw err
    } finally {
      brokerStore.setLoading(broker.id, false)
    }
  }

  return {
    error,
    handleLogin,
  }
}
