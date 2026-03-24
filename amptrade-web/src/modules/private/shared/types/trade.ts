import type { Ref } from 'vue'
import type { BrokerType } from '@/modules/private/shared/types/broker'

/**
 * Instrument type constants mapping frontend types to backend values
 */
export const INSTRUMENT_TYPES = {
  CALL: 'CE', // Call European
  PUT: 'PE', // Put European
  FUT: 'FUT', // Futures
  EQ: 'EQ', // Equity
} as const

export type InstrumentType = keyof typeof INSTRUMENT_TYPES
export type InstrumentValue = (typeof INSTRUMENT_TYPES)[InstrumentType]

/**
 * Trade store state interface
 */
export interface TradeState {
  selectedExchange: string
  selectedSegment: string
  selectedSymbol: string
  selectedExpiry: string
  selectedStrikeCall: string
  selectedStrikePut: string
  quantity: number
  isLoading: boolean
  error: string | null
  selectedBrokerType: BrokerType | null
  ltp: number | null
  subscribedSymbols: Set<string>
}

/**
 * Lookup maps interface for filtering instruments
 */
export interface Lookups {
  exchangeMap: Map<string, Set<string>>
  segmentMap: Map<string, Set<string>>
  symbolMap: Map<string, Set<string>>
  expiryMap: Map<string, Set<string>>
  strikeMap: Map<string, Set<string>>
}

/**
 * Position interface
 */
export interface Position {
  symbol: string
  quantity: number
  side: 'BUY' | 'SELL'
  lastTradedPrice: number
  productType: ProductTypeDisplay
  buyAverage: number
  sellAverage: number
  realizedPnL: number
  unrealizedPnL: number
  exchange: string
  instrumentName: string
  displayName: string
  totalBuyQty: number
  totalSellQty: number
  totalBuyAmount: number
  totalSellAmount: number
  token: string
  target: number | null
  stopLoss: number | null
  trailingStopLoss: number | null
  lotSize?: number
  freezeQuantity?: number
  tickSize?: number // Minimum price increment for the instrument (ti)
  netAvgPrice?: number // Net position average price from broker (netavgprc)
}

/**
 * Position update interface
 */
export interface PositionUpdate {
  stopLoss?: number | null
  target?: number | null
  trailingStopLoss?: number | null
  [key: string]: unknown
}

export interface Order {
  orderId: string
  symbol: string
  quantity: number
  filledQuantity?: number
  price: number
  averagePrice: number | null
  status: string
  orderType: string
  side: 'BUY' | 'SELL'
  exchange: string
  productType: 'Intraday' | 'Carry Forward'
  brokerType: 'Flattrade' | 'Shoonya' | 'Zebu' | 'Tradesmart' | 'Zerodha' | 'Infinn' | 'Upstox'
  orderTimestamp: string
  recordType: 'order'
  rejectionReason?: string
}



export interface Trade {
  tradeId: string
  orderId: string
  symbol: string
  quantity: number
  price: number
  side: 'BUY' | 'SELL'
  exchange: string
  productType: string
  tradeTimestamp: string
  brokerType: BrokerType
  recordType: 'trade'
  orderType: string
}

export interface TradeFormData {
  selectedSymbol: Ref<string>
  selectedExpiry: Ref<string>
  strikeData: Ref<{
    CE: number[]
    PE: number[]
  }>
  selectedSegment: Ref<string>
  totalQuantity: Ref<number>
  quantity: Ref<number>
  productType?: Ref<string>
  orderType?: Ref<string>
}

// Add new interface for trading symbols
export interface TradingSymbols {
  callTradingSymbol: Ref<string>
  putTradingSymbol: Ref<string>
  futuresTradingSymbol: Ref<string>
  equityTradingSymbol: Ref<string>
}

// Add interface for trade action payload
export interface TradeActionPayload {
  action: 'BUY' | 'SELL'
  symbol: string
  expiry: string
  segment: string
  tradingSymbol: string
  instrumentType?: InstrumentType
  quantity: number
  productType: string
  orderType: string
  exchange: string
  price?: number
  ltp?: number
  rawQuantity?: number
  lotSize?: number
  tickSize?: number // Minimum price increment for the instrument
  token?: string // Instrument token (required for Upstox as instrumentKey)
}



// Keep these product type mappings
export const PRODUCT_TYPES = {
  INTRADAY: 'I',
  HOLDING: 'C',
  CARRY_FORWARD: 'M',
} as const

export type ProductTypeDisplay = 'Intraday' | 'Holding' | 'Carry Forward'
export type ProductTypeBroker = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES]

// Keep this function - it's used by position adapters to convert broker format to display format
export function mapProductType(brokerType: string): ProductTypeDisplay {
  switch (brokerType) {
    case PRODUCT_TYPES.CARRY_FORWARD:
      return 'Carry Forward'
    case PRODUCT_TYPES.HOLDING:
      return 'Holding'
    default:
      return 'Intraday'
  }
}

// Add new context interfaces for trading components
export interface InstrumentContext {
  selectedSymbol: Ref<string>
  selectedExpiry: Ref<string>
  selectedSegment: Ref<string>
  strikeData: Ref<{ CE: number[]; PE: number[] }>
  underlyingToken: Ref<string | null>
  selectedExchange: Ref<string>
  tradingSymbols: {
    call: Ref<string>
    put: Ref<string>
    futures: Ref<string>
    equity: Ref<string>
    commodityFutures: Ref<string>
    commodityOptionsCall: Ref<string>
    commodityOptionsPut: Ref<string>
  }
  ltpValues: {
    underlying: Ref<number | null>
    call: Ref<number | null>
    put: Ref<number | null>
    futures: Ref<number | null>
    equity: Ref<number | null>
  }
  underlyingPctChange: Ref<number | null>
}

export interface OrderContext {
  quantity: Ref<number>
  totalQuantity: Ref<number>
  productType: Ref<string>
  orderType: Ref<string>
  lotSize: Ref<number>
  defaultStopLoss: Ref<number>
  defaultTarget: Ref<number>
}
