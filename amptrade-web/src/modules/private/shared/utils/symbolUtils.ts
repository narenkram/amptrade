/**
 * Shared symbol detection utilities for identifying option types and index instruments.
 * This module centralizes all symbol parsing logic for consistent behavior across the app.
 */

// Index instrument types for SL/Target settings
export type IndexInstrument = 'NIFTY' | 'BANKNIFTY' | 'SENSEX' | null

/**
 * Detect option type (CE/PE) from symbol.
 * Handles multiple option symbol formats:
 * 1. NIFTY/BANKNIFTY format: NIFTY23DEC25C26050 (C/P before strike price)
 * 2. SENSEX format: SENSEX25DEC85100CE (CE/PE at the end)
 */
export const getOptionType = (symbol: string): 'CE' | 'PE' | null => {
    if (!symbol) return null

    // Check for CE/PE suffix first (SENSEX format)
    if (symbol.endsWith('CE')) return 'CE'
    if (symbol.endsWith('PE')) return 'PE'

    // Check for C/P before strike price (NIFTY/BANKNIFTY format)
    const ceMatch = symbol.match(/\d{2}[A-Z]{3}\d{2}C\d+$/)
    const peMatch = symbol.match(/\d{2}[A-Z]{3}\d{2}P\d+$/)

    if (ceMatch) return 'CE'
    if (peMatch) return 'PE'
    return null
}

/**
 * Detect the index instrument from a symbol name.
 * Returns the base index name (NIFTY, BANKNIFTY, SENSEX) or null if not an index option.
 */
export const getIndexInstrument = (symbol: string): IndexInstrument => {
    if (!symbol) return null

    const upperSymbol = symbol.toUpperCase()

    // Check BANKNIFTY first (because it contains 'NIFTY')
    if (upperSymbol.includes('BANKNIFTY')) return 'BANKNIFTY'

    // Check NIFTY (but exclude BANKNIFTY and FINNIFTY)
    if (
        upperSymbol.includes('NIFTY') &&
        !upperSymbol.includes('BANKNIFTY') &&
        !upperSymbol.includes('FINNIFTY')
    ) {
        return 'NIFTY'
    }

    // Check SENSEX
    if (upperSymbol.includes('SENSEX')) return 'SENSEX'

    return null
}

/**
 * Check if a symbol is an index option that has custom SL/Target settings.
 */
export const isIndexOptionWithCustomSettings = (symbol: string): boolean => {
    return getIndexInstrument(symbol) !== null
}

/**
 * Check if a symbol is an options contract (has CE or PE).
 */
export const isOptionsContract = (symbol: string): boolean => {
    return getOptionType(symbol) !== null
}

/**
 * Check if a symbol is a futures contract.
 * Futures typically end with 'FUT' or have 'FUT' in the symbol.
 */
export const isFuturesContract = (symbol: string): boolean => {
    if (!symbol) return false
    const upperSymbol = symbol.toUpperCase()
    return upperSymbol.includes('FUT') || upperSymbol.endsWith('FUT')
}

/**
 * Get a human-readable label for an index instrument.
 */
export const getIndexInstrumentLabel = (instrument: IndexInstrument): string => {
    switch (instrument) {
        case 'NIFTY':
            return 'Nifty'
        case 'BANKNIFTY':
            return 'BankNifty'
        case 'SENSEX':
            return 'Sensex'
        default:
            return ''
    }
}
