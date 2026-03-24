import type { Broker } from '@/modules/private/shared/types/broker'
import api from '@/modules/common/api/axios'
import { getBrokerParams } from '@/modules/utils/brokerUtils'

export const fetchBrokerFundLimit = async (broker: Broker) => {
  const params = getBrokerParams(broker)

  // Different HTTP methods based on broker type
  switch (broker.type.toLowerCase()) {
    case 'shoonya':
      return api.post(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, {}, { params })
    case 'flattrade':
      return api.post(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, {}, { params })
    case 'zebu':
      return api.post(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, {}, { params })
    case 'tradesmart':
      return api.post(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, {}, { params })
    case 'zerodha':
      return api.get(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, { params })
    case 'upstox':
      return api.get(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, { params })
    default:
      return api.post(`${import.meta.env.VITE_API_URL}/${broker.type}/fundLimit`, {}, { params })
  }
}
