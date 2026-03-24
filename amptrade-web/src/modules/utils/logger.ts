/**
 * Environment-aware logging utility
 *
 * Logs only appear in development mode to keep production console clean.
 * Errors are always logged regardless of environment.
 */

const isDev = import.meta.env.DEV

export const logger = {
    /**
     * General purpose logging - only in development
     */
    log: (...args: unknown[]): void => {
        if (isDev) console.log(...args)
    },

    /**
     * Warning messages - only in development
     */
    warn: (...args: unknown[]): void => {
        if (isDev) console.warn(...args)
    },

    /**
     * Error messages - always logged (important for debugging production issues)
     */
    error: (...args: unknown[]): void => {
        console.error(...args)
    },

    /**
     * Debug messages with [DEBUG] prefix - only in development
     */
    debug: (...args: unknown[]): void => {
        if (isDev) console.log('[DEBUG]', ...args)
    },

    /**
     * Info messages with [INFO] prefix - only in development
     */
    info: (...args: unknown[]): void => {
        if (isDev) console.info('[INFO]', ...args)
    },
}
