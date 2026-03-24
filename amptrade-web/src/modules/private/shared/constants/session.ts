export const SESSION_CONFIG = {
  UPDATE_INTERVAL: 30000,
  RETRY_ATTEMPTS: 3 as number,
  RETRY_DELAY: 1000,
  DEBOUNCE_DELAY: 1000,
  EXPIRY_TIME: 300000,
} as const

export const SESSION_ERRORS = {
  network: 'Network connection error. Please check your internet connection.',
  permission: 'Permission denied. Please try logging in again.',
  unknown: 'An unexpected error occurred. Please try again.',
} as const
