/**
 * Market Price Protection Utility
 *
 * Implements Zerodha-style market protection to prevent orders from executing
 * at prices significantly different from the intended price.
 *
 * The protection range is calculated based on the current market price.
 * For BUY orders: price = LTP × (1 + protection%)
 * For SELL orders: price = LTP × (1 - protection%)
 * 
 * Prices are rounded to the instrument's tick size to prevent order rejections.
 */

/** Default tick size for most instruments (NSE/BSE/NFO/BFO/MCX) */
const DEFAULT_TICK_SIZE = 0.05

/**
 * Round a price to the nearest valid tick size
 * 
 * @param price - The price to round
 * @param tickSize - The instrument's tick size (default: 0.05)
 * @returns Price rounded to valid tick increment
 */
export function roundToTickSize(price: number, tickSize: number = DEFAULT_TICK_SIZE): number {
    if (tickSize <= 0) {
        tickSize = DEFAULT_TICK_SIZE
    }
    return Math.round(price / tickSize) * tickSize
}

/**
 * Get the protection percentage based on the current price range
 *
 * | Price Range     | Protection % |
 * |-----------------|--------------|
 * | < ₹100          | 2%           |
 * | ₹100 - ₹500     | 1.5%         |
 * | ₹500 - ₹1000    | 1%           |
 * | > ₹1000         | 0.5%         |
 *
 * @param price - The current price (LTP)
 * @returns The protection percentage as a decimal (e.g., 0.02 for 2%)
 */
export function getProtectionPercentage(price: number): number {
    if (price < 100) {
        return 0.02 // 2%
    } else if (price < 500) {
        return 0.015 // 1.5%
    } else if (price < 1000) {
        return 0.01 // 1%
    } else {
        return 0.005 // 0.5%
    }
}

/**
 * Calculate the protected price for a BUY order
 * Adds protection percentage above LTP to ensure order fills
 *
 * @param ltp - The Last Traded Price
 * @param tickSize - The instrument's tick size (default: 0.05)
 * @returns The protected buy price (higher than LTP), rounded to tick size
 */
export function getProtectedBuyPrice(ltp: number, tickSize: number = DEFAULT_TICK_SIZE): number {
    const protection = getProtectionPercentage(ltp)
    const protectedPrice = ltp * (1 + protection)
    return roundToTickSize(protectedPrice, tickSize)
}

/**
 * Calculate the protected price for a SELL order
 * Subtracts protection percentage below LTP to ensure order fills
 *
 * @param ltp - The Last Traded Price
 * @param tickSize - The instrument's tick size (default: 0.05)
 * @returns The protected sell price (lower than LTP), rounded to tick size
 */
export function getProtectedSellPrice(ltp: number, tickSize: number = DEFAULT_TICK_SIZE): number {
    const protection = getProtectionPercentage(ltp)
    const protectedPrice = ltp * (1 - protection)
    // Ensure price doesn't go below minimum tick
    return Math.max(tickSize, roundToTickSize(protectedPrice, tickSize))
}

/**
 * Calculate the protected price based on the order action
 *
 * @param ltp - The Last Traded Price
 * @param action - The order action ('BUY' or 'SELL')
 * @param tickSize - The instrument's tick size (default: 0.05)
 * @returns The protected price based on action direction, rounded to tick size
 */
export function calculateProtectedPrice(
    ltp: number,
    action: 'BUY' | 'SELL',
    tickSize: number = DEFAULT_TICK_SIZE
): number {
    if (action === 'BUY') {
        return getProtectedBuyPrice(ltp, tickSize)
    } else {
        return getProtectedSellPrice(ltp, tickSize)
    }
}

/**
 * Get human-readable protection info for UI display
 *
 * @param ltp - The Last Traded Price
 * @param action - The order action ('BUY' or 'SELL')
 * @param tickSize - The instrument's tick size (default: 0.05)
 * @returns Object with protection details for display
 */
export function getProtectionInfo(
    ltp: number,
    action: 'BUY' | 'SELL',
    tickSize: number = DEFAULT_TICK_SIZE
): {
    percentage: number
    protectedPrice: number
    difference: number
} {
    const percentage = getProtectionPercentage(ltp) * 100
    const protectedPrice = calculateProtectedPrice(ltp, action, tickSize)
    const difference = Math.abs(protectedPrice - ltp)

    return {
        percentage,
        protectedPrice,
        difference,
    }
}
