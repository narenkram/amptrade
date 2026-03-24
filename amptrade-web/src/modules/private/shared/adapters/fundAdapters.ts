import type { Broker } from '@/modules/private/shared/types/broker'
import { fetchBrokerFundLimit } from '@/modules/private/shared/composables/useFundlimits'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'

// For Zerodha's nested response structure
export interface ZerodhaResponse {
  success?: boolean
  data?: {
    status?: string
    data?: {
      equity?: {
        enabled?: boolean
        net?: number
        available?: {
          adhoc_margin?: number
          cash?: number
          opening_balance?: number
          live_balance?: number
          collateral?: number
          intraday_payin?: number
        }
        utilised?: {
          debits?: number
          exposure?: number
          span?: number
          option_premium?: number
          payout?: number
          // other fields...
        }
      }
      commodity?: {
        enabled?: boolean
        net?: number
        available?: {
          adhoc_margin?: number
          cash?: number
          opening_balance?: number
          live_balance?: number
          collateral?: number
          intraday_payin?: number
        }
        utilised?: {
          debits?: number
          exposure?: number
          span?: number
          option_premium?: number
          payout?: number
          // other fields...
        }
      }
    }
  }
}

export interface NorenApiFundLimitResponse {
  stat?: string
  cash?: string
  brkcollamt?: string
  marginused?: string
  mr_der_a?: string
  mr_com_a?: string
  payin?: string
  payout?: string
  span?: string
  expo?: string
  brokerage?: string
}

export interface UpstoxFundsAndMarginInner {
  used_margin?: number
  payin_amount?: number
  span_margin?: number
  adhoc_margin?: number
  notional_cash?: number
  available_margin?: number
  exposure_margin?: number
}

export interface UpstoxFundsAndMarginResponse {
  success?: boolean
  data?: {
    status?: string
    data?: {
      equity?: UpstoxFundsAndMarginInner
      commodity?: UpstoxFundsAndMarginInner
    }
  }
}

export type FundLimitResponse = NorenApiFundLimitResponse | ZerodhaResponse | UpstoxFundsAndMarginResponse

const normalizeBrokerType = (brokerType?: string): string => (brokerType || '').trim().toLowerCase()

export const isZerodhaResponse = (
  response: FundLimitResponse | null,
): response is ZerodhaResponse => {
  if (!response || typeof response !== 'object') return false
  if (!('success' in response) || response.success !== true) return false
  if (!response.data || typeof response.data !== 'object') return false

  const outer = response.data as Record<string, unknown>
  const outerStatus = outer.status
  if (typeof outerStatus !== 'string' || outerStatus.length === 0) return false

  const nested = outer.data as Record<string, unknown> | undefined
  const equity = nested?.equity as Record<string, unknown> | undefined
  const commodity = nested?.commodity as Record<string, unknown> | undefined

  const equityNetOk = typeof equity?.net === 'number'
  const commodityNetOk = typeof commodity?.net === 'number'

  return equityNetOk || commodityNetOk
}

export const isUpstoxResponse = (
  response: FundLimitResponse | null,
): response is UpstoxFundsAndMarginResponse => {
  if (!response || typeof response !== 'object') return false
  if (!('success' in response) || response.success !== true) return false
  if (!response.data || typeof response.data !== 'object') return false

  const outer = response.data as Record<string, unknown>
  const outerStatus = outer.status
  if (typeof outerStatus !== 'string' || outerStatus.length === 0) return false

  const nested = outer.data as Record<string, unknown> | undefined
  const equity = nested?.equity as Record<string, unknown> | undefined
  const commodity = nested?.commodity as Record<string, unknown> | undefined

  const hasUpstoxFields =
    typeof equity?.available_margin === 'number' ||
    typeof equity?.used_margin === 'number' ||
    typeof commodity?.available_margin === 'number' ||
    typeof commodity?.used_margin === 'number'

  return hasUpstoxFields
}

export const isNorenApiFundLimitResponse = (
  response: FundLimitResponse | null,
): response is NorenApiFundLimitResponse => {
  if (!response || typeof response !== 'object') return false
  if ('success' in response) return false
  return 'stat' in response || 'cash' in response || 'marginused' in response
}

interface FundLimitAdapter {
  getFunds(fundLimit: FundLimitResponse | null): string
  getUsedAmount(fundLimit: FundLimitResponse | null): string
  getTotalInvestment(fundLimit: FundLimitResponse | null): number
  getSpanMargin(fundLimit: FundLimitResponse | null): string
  getExposureMargin(fundLimit: FundLimitResponse | null): string
  getPayinAmount(fundLimit: FundLimitResponse | null): string
  getPayoutAmount(fundLimit: FundLimitResponse | null): string
  getBrokerageAmount(fundLimit: FundLimitResponse | null): string
}

class ZerodhaFundLimitAdapter implements FundLimitAdapter {
  getFunds(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equityNet = fundLimit.data?.data?.equity?.net || 0
    const commodityNet = fundLimit.data?.data?.commodity?.net || 0
    return (equityNet + commodityNet).toFixed(2)
  }

  getUsedAmount(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equityDebits = fundLimit.data?.data?.equity?.utilised?.debits || 0
    const commodityDebits = fundLimit.data?.data?.commodity?.utilised?.debits || 0
    return (equityDebits + commodityDebits).toFixed(2)
  }

  getTotalInvestment(fundLimit: FundLimitResponse | null): number {
    if (!isZerodhaResponse(fundLimit)) return 0
    const equityLiveBalance = fundLimit.data?.data?.equity?.available?.live_balance || 0
    const commodityLiveBalance = fundLimit.data?.data?.commodity?.available?.live_balance || 0
    const equityPayin = fundLimit.data?.data?.equity?.available?.intraday_payin || 0
    const commodityPayin = fundLimit.data?.data?.commodity?.available?.intraday_payin || 0

    return equityLiveBalance + commodityLiveBalance === 0 && equityPayin + commodityPayin !== 0
      ? equityPayin + commodityPayin
      : equityLiveBalance + commodityLiveBalance
  }

  getSpanMargin(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equitySpan = fundLimit.data?.data?.equity?.utilised?.span || 0
    const commoditySpan = fundLimit.data?.data?.commodity?.utilised?.span || 0
    return (equitySpan + commoditySpan).toFixed(2)
  }

  getExposureMargin(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equityExposure = fundLimit.data?.data?.equity?.utilised?.exposure || 0
    const commodityExposure = fundLimit.data?.data?.commodity?.utilised?.exposure || 0
    return (equityExposure + commodityExposure).toFixed(2)
  }

  getPayinAmount(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equityPayin = fundLimit.data?.data?.equity?.available?.intraday_payin || 0
    const commodityPayin = fundLimit.data?.data?.commodity?.available?.intraday_payin || 0
    return (equityPayin + commodityPayin).toFixed(2)
  }

  getPayoutAmount(fundLimit: FundLimitResponse | null): string {
    if (!isZerodhaResponse(fundLimit)) return '0'
    const equityPayout = fundLimit.data?.data?.equity?.utilised?.payout || 0
    const commodityPayout = fundLimit.data?.data?.commodity?.utilised?.payout || 0
    return (equityPayout + commodityPayout).toFixed(2)
  }

  getBrokerageAmount(): string {
    return '0'
  }
}

class UpstoxFundLimitAdapter implements FundLimitAdapter {
  getFunds(fundLimit: FundLimitResponse | null): string {
    if (!isUpstoxResponse(fundLimit)) return '0'
    const equityAvailable = fundLimit.data?.data?.equity?.available_margin || 0
    const commodityAvailable = fundLimit.data?.data?.commodity?.available_margin || 0
    return (equityAvailable + commodityAvailable).toFixed(2)
  }

  getUsedAmount(fundLimit: FundLimitResponse | null): string {
    if (!isUpstoxResponse(fundLimit)) return '0'
    const equityUsed = fundLimit.data?.data?.equity?.used_margin || 0
    const commodityUsed = fundLimit.data?.data?.commodity?.used_margin || 0
    return (equityUsed + commodityUsed).toFixed(2)
  }

  getTotalInvestment(fundLimit: FundLimitResponse | null): number {
    if (!isUpstoxResponse(fundLimit)) return 0
    const equityAvailable = fundLimit.data?.data?.equity?.available_margin || 0
    const commodityAvailable = fundLimit.data?.data?.commodity?.available_margin || 0
    const equityUsed = fundLimit.data?.data?.equity?.used_margin || 0
    const commodityUsed = fundLimit.data?.data?.commodity?.used_margin || 0
    return equityAvailable + commodityAvailable + equityUsed + commodityUsed
  }

  getSpanMargin(fundLimit: FundLimitResponse | null): string {
    if (!isUpstoxResponse(fundLimit)) return '0'
    const equitySpan = fundLimit.data?.data?.equity?.span_margin || 0
    const commoditySpan = fundLimit.data?.data?.commodity?.span_margin || 0
    return (equitySpan + commoditySpan).toFixed(2)
  }

  getExposureMargin(fundLimit: FundLimitResponse | null): string {
    if (!isUpstoxResponse(fundLimit)) return '0'
    const equityExposure = fundLimit.data?.data?.equity?.exposure_margin || 0
    const commodityExposure = fundLimit.data?.data?.commodity?.exposure_margin || 0
    return (equityExposure + commodityExposure).toFixed(2)
  }

  getPayinAmount(fundLimit: FundLimitResponse | null): string {
    if (!isUpstoxResponse(fundLimit)) return '0'
    const equityPayin = fundLimit.data?.data?.equity?.payin_amount || 0
    const commodityPayin = fundLimit.data?.data?.commodity?.payin_amount || 0
    return (equityPayin + commodityPayin).toFixed(2)
  }

  getPayoutAmount(): string {
    return '0'
  }

  getBrokerageAmount(): string {
    return '0'
  }
}

class NorenApiFundLimitAdapter implements FundLimitAdapter {
  getFunds(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    const cash = parseFloat(fundLimit.cash || '0')
    const marginUsed = parseFloat(fundLimit.marginused || '0')
    return (cash - marginUsed).toFixed(2)
  }

  getUsedAmount(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.marginused || '0'
  }

  getTotalInvestment(fundLimit: FundLimitResponse | null): number {
    if (!isNorenApiFundLimitResponse(fundLimit)) return 0
    const cash = parseFloat(fundLimit.cash || '0')
    const payin = parseFloat(fundLimit.payin || '0')
    return cash === 0 && payin !== 0 ? payin : cash
  }

  getSpanMargin(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.span || '0'
  }

  getExposureMargin(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.expo || '0'
  }

  getPayinAmount(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.payin || '0'
  }

  getPayoutAmount(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.payout || '0'
  }

  getBrokerageAmount(fundLimit: FundLimitResponse | null): string {
    if (!isNorenApiFundLimitResponse(fundLimit)) return '0'
    return fundLimit.brokerage || '0'
  }
}

const zerodhaAdapter = new ZerodhaFundLimitAdapter()
const upstoxAdapter = new UpstoxFundLimitAdapter()
const norenApiAdapter = new NorenApiFundLimitAdapter()

const getFundLimitAdapter = (brokerType?: string): FundLimitAdapter => {
  const normalized = normalizeBrokerType(brokerType)
  if (normalized === 'zerodha') return zerodhaAdapter
  if (normalized === 'upstox') return upstoxAdapter
  return norenApiAdapter
}

export const fetchFundLimit = async (broker: Broker): Promise<FundLimitResponse | null> => {
  try {
    const response = await fetchBrokerFundLimit(broker)
    return response.data
  } catch (error) {
    console.error('Error fetching fund limit:', error)
    return null
  }
}

export const calculateFunds = (
  fundLimit: FundLimitResponse | null,
  brokerType?: string,
): string => {
  if (!fundLimit) return localStorage.getItem(STORAGE_KEYS.LAST_FUNDS) || '0'

  const calculatedFunds = getFundLimitAdapter(brokerType).getFunds(fundLimit)

  localStorage.setItem(STORAGE_KEYS.LAST_FUNDS, calculatedFunds)
  return calculatedFunds
}

export const calculateUsedAmount = (
  fundLimit: FundLimitResponse | null,
  brokerType: string,
): string => {
  if (!fundLimit) return localStorage.getItem(STORAGE_KEYS.LAST_USED_AMOUNT) || '0'

  const usedMargin = getFundLimitAdapter(brokerType).getUsedAmount(fundLimit)

  localStorage.setItem(STORAGE_KEYS.LAST_USED_AMOUNT, usedMargin)
  return usedMargin
}

export const calculateTotalInvestment = (
  fundLimit: FundLimitResponse | null,
  brokerType?: string,
): number => {
  return getFundLimitAdapter(brokerType).getTotalInvestment(fundLimit)
}

export const getSpanMargin = (fundLimit: FundLimitResponse | null, brokerType: string): string => {
  return getFundLimitAdapter(brokerType).getSpanMargin(fundLimit)
}

export const getExposureMargin = (
  fundLimit: FundLimitResponse | null,
  brokerType: string,
): string => {
  return getFundLimitAdapter(brokerType).getExposureMargin(fundLimit)
}

export const getPayinAmount = (fundLimit: FundLimitResponse | null, brokerType: string): string => {
  return getFundLimitAdapter(brokerType).getPayinAmount(fundLimit)
}

export const getPayoutAmount = (
  fundLimit: FundLimitResponse | null,
  brokerType: string,
): string => {
  return getFundLimitAdapter(brokerType).getPayoutAmount(fundLimit)
}

export const getBrokerageAmount = (
  fundLimit: FundLimitResponse | null,
  brokerType: string,
): string => {
  return getFundLimitAdapter(brokerType).getBrokerageAmount(fundLimit)
}
