/**
 * Utility functions for determining exchange codes based on input parameters
 */

/**
 * Determines exchange code based on exchange, segment, and instrument type
 *
 * @param exchange - The exchange (NSE, BSE, MCX)
 * @param segment - The segment (Index Options, Stocks Equity, etc.)
 * @param instrumentType - Optional instrument type (EQ, FUT, CALL, PUT)
 * @returns The exchange code
 */
export const getExchange = (
  exchange: string,
  segment?: string,
  instrumentType?: 'EQ' | 'FUT' | 'CALL' | 'PUT',
): string => {
  // Handle MCX first as it's consistent across all implementations
  if (exchange === 'MCX') return 'MCX'

  // If we have an instrument type but no segment
  if (!segment && instrumentType) {
    if (instrumentType === 'EQ') return exchange
    if (['FUT', 'CALL', 'PUT'].includes(instrumentType)) {
      return exchange === 'BSE' ? 'BFO' : 'NFO'
    }
    return exchange
  }

  // If we have a segment
  if (segment) {
    switch (exchange) {
      case 'NSE':
        switch (segment) {
          case 'Index Options':
          case 'Index Futures':
          case 'Stocks Options':
          case 'Stocks Futures':
            return 'NFO'
          case 'Stocks Equity':
            return 'NSE'
          default:
            return exchange
        }
      case 'BSE':
        switch (segment) {
          case 'Index Options':
          case 'Index Futures':
          case 'Stocks Options':
          case 'Stocks Futures':
            return 'BFO'
          case 'Stocks Equity':
            return 'BSE'
          default:
            return exchange
        }
      default:
        return exchange
    }
  }

  // Default case
  return exchange
}

/**
 * Simplified version that focuses on instrument type rather than segment
 * Useful for components that don't track segment information
 *
 * @param exchange - The exchange (NSE, BSE, MCX)
 * @param instrumentType - The instrument type (EQ, FUT, CALL, PUT)
 * @returns The exchange code
 */
export const getExchangeByInstrumentType = (
  exchange: string,
  instrumentType: 'EQ' | 'FUT' | 'CALL' | 'PUT',
): string => {
  if (exchange === 'MCX') return 'MCX'
  if (instrumentType === 'EQ') return exchange
  if (['FUT', 'CALL', 'PUT'].includes(instrumentType)) {
    return exchange === 'BSE' ? 'BFO' : 'NFO'
  }
  return exchange
}
