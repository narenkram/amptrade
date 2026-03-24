/**
 * WebSocket Adapters
 *
 * This file contains adapters for standardizing WebSocket data from different brokers.
 * Each broker may send data in different formats, and these adapters convert that data
 * to a consistent format used throughout the application.
 */

import { logger } from '@/modules/utils/logger'

// Define the shape of the standardized quote data that all components will use
interface StandardizedQuoteData {
  token: string
  ltp: number
  open?: number
  close?: number
  averagePrice?: number
  low?: number
  high?: number
  exchange?: string
  pct_change?: number
  oi?: number
  poi?: number
  timestamp?: number
  volume?: number
  broker?: string // Add this property to support multi-broker tracking
}

// Define the shape of the Zerodha quote data
interface ZerodhaQuoteData {
  instrument_token?: number
  last_price?: number
  last_quantity?: number
  average_price?: number
  volume?: number
  buy_quantity?: number
  sell_quantity?: number
  open?: number
  high?: number
  low?: number
  close?: number
  oi?: number
  oi_day_high?: number
  oi_day_low?: number
  type?: string
  change?: number // Used for index data
}

// Define the shape of the FlatTrade/Shoonya quote data
interface FlatTradeQuoteData {
  tk?: string
  lp?: string | number
  o?: string | number
  c?: string | number
  ap?: string | number
  l?: string | number
  h?: string | number
  e?: string
  pc?: string | number
  oi?: string | number
  poi?: string | number
  ft?: string | number
  v?: string | number
}

/**
 * Adapts Zerodha WebSocket data to the standardized format
 */
export const adaptZerodhaQuoteData = (data: ZerodhaQuoteData): StandardizedQuoteData => {
  // Calculate percent change based on what's available
  let pctChange: number | undefined = undefined

  // Use a consistent formula for percentage change calculation for all instruments
  // including indices, by always using close and last_price
  if (data.close !== undefined && data.close !== 0 && data.last_price !== undefined) {
    pctChange = ((data.last_price - data.close) / data.close) * 100
  }

  // Check if we received an empty packet (just instrument_token)
  // This happens sometimes with indices when the mode isn't set properly
  if (Object.keys(data).length === 1 && data.instrument_token) {
    logger.warn(`Received empty data packet for instrument token ${data.instrument_token}`)
    // Return a special flag to signal UI to use last valid values
    return {
      token: data.instrument_token.toString(),
      ltp: 0, // UI will use last valid value when seeing 0
      pct_change: undefined,
    }
  }

  // Check if this is potentially a SENSEX or other BSE index token (small numbers)
  const isBseIndex = data.instrument_token !== undefined && data.instrument_token < 1000
  if (isBseIndex && data.type === 'index') {
    logger.log(
      `Processing BSE index data (likely SENSEX): ${data.instrument_token}, LTP: ${data.last_price}, Pct Change: ${pctChange?.toFixed(2)}%`,
    )
  }

  return {
    token: data.instrument_token?.toString() || '',
    ltp: data.last_price || 0,
    open: data.open,
    close: data.close,
    averagePrice: data.average_price,
    low: data.low,
    high: data.high,
    // Don't specify exchange so it falls back to the selectedExchange value
    // This allows exchange comparison to work for all exchanges including MCX
    pct_change: pctChange,
    oi: data.oi,
    poi: data.oi_day_high, // Using oi_day_high as previous OI
    volume: data.volume,
    timestamp: Date.now(), // Use current timestamp as Zerodha doesn't always provide it
  }
}

/**
 * Adapts FlatTrade/Shoonya WebSocket data to the standardized format
 */
export const adaptFlatTradeQuoteData = (data: FlatTradeQuoteData): StandardizedQuoteData => {
  return {
    token: data.tk || '',
    ltp: parseFloat(data.lp?.toString() || '0') || 0,
    open: parseFloat(data.o?.toString() || ''),
    close: parseFloat(data.c?.toString() || ''),
    averagePrice: parseFloat(data.ap?.toString() || ''),
    low: parseFloat(data.l?.toString() || ''),
    high: parseFloat(data.h?.toString() || ''),
    exchange: data.e,
    pct_change: parseFloat(data.pc?.toString() || ''),
    oi: parseFloat(data.oi?.toString() || ''),
    poi: parseFloat(data.poi?.toString() || ''),
    timestamp: Number(data.ft) * 1000 || Date.now(),
    volume: parseFloat(data.v?.toString() || ''),
  }
}

/**
 * Factory function to get the appropriate adapter based on broker type
 */
export const getWebSocketAdapter = (
  brokerType: string,
): ((data: ZerodhaQuoteData | FlatTradeQuoteData) => StandardizedQuoteData) => {
  const type = brokerType.toLowerCase()

  if (type === 'zerodha') {
    return adaptZerodhaQuoteData as (
      data: ZerodhaQuoteData | FlatTradeQuoteData,
    ) => StandardizedQuoteData
  }

  // Default to FlatTrade adapter for other brokers (which mostly follow the same format)
  return adaptFlatTradeQuoteData as (
    data: ZerodhaQuoteData | FlatTradeQuoteData,
  ) => StandardizedQuoteData
}
