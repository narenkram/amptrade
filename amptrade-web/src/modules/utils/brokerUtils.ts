import type { Broker } from '@/modules/private/shared/types/broker'

// utils/brokerUtils.ts
export const getBrokerParams = (broker: Broker) => {
  return {
    [`${broker.type.toUpperCase()}_API_TOKEN`]: broker.apiToken,
    [`${broker.type.toUpperCase()}_CLIENT_ID`]: broker.clientId,
  }
}

export const getBrokerApiArchitectureFromType = (brokerType?: string | null): string => {
  const type = brokerType?.toLowerCase()
  if (type === 'zerodha') return 'kite-connect'
  if (type === 'upstox') return 'upstox-api'
  return 'noren-api'
}

export const getBrokerApiArchitecture = (broker: Broker): string => {
  return getBrokerApiArchitectureFromType(broker.type)
}

export const getArchitectureDisplayName = (arch: string): string => {
  switch (arch) {
    case 'noren-api': return 'Noren API'
    case 'kite-connect': return 'Kite API'
    case 'upstox-api': return 'Upstox API'
    default: return arch
  }
}
