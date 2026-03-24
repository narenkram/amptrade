/**
 * Supported broker types in the application
 * @enum {string}
 */
export type BrokerType =
  | 'Flattrade'
  | 'Shoonya'
  | 'Zebu'
  | 'Tradesmart'
  | 'Zerodha'
  | 'Infinn'
  | 'Upstox'

/**
 * Flattrade Authentication Flow
 *
 * 1. Login Process:
 *    - User clicks "Login" button
 *    - Opens Flattrade auth window with API key
 *    - User authenticates on Flattrade's portal
 *    - Flattrade redirects back with auth code
 *    - Auth code is used to generate token
 *
 * 2. Token Generation:
 *    - Concatenate: apiKey + authCode + apiSecret
 *    - Generate SHA-256 hash of concatenated string
 *    - Send POST request to token endpoint with:
 *      - api_key
 *      - request_code (auth code)
 *      - api_secret (generated hash)
 *    - Store received token in broker object
 *
 * 3. Token Validation:
 *    - Performed on page load and manual refresh
 *    - Calls fundLimit API endpoint
 *    - Updates broker status:
 *      - VALID: API call successful
 *      - EXPIRED: API call failed
 *      - MISSING: No token present
 */

/**
 * Shoonya & Zebu & Tradesmart & Infinn Authentication Flow
 *
 * 1. Login Process:
 *    - User clicks "Login" button
 *    - Opens modal to collect password and TOTP
 *    - Credentials are processed locally
 *    - Direct API authentication with Shoonya / Zebu / Tradesmart / Infinn servers
 *
 * 2. Token Generation:
 *    - Hash password using SHA-256
 *    - Generate appkey: SHA-256 hash of (clientId + "|" + apiKey)
 *    - Create jData object with:
 *      - apkversion: "1.0.0"
 *      - uid: clientId
 *      - pwd: hashed password
 *      - factor2: TOTP code
 *      - vc: clientId + "_U"
 *      - appkey: hashed appkey
 *      - imei: "mac"
 *      - source: "API"
 *    - Send POST request to Shoonya's / Zebu's / Tradesmart's / Infinn's QuickAuth endpoint
 *    - Store received susertoken in broker object
 *
 * 3. Token Validation:
 *    - Performed on page load and manual refresh
 *    - Calls fundLimit API endpoint
 *    - Updates broker status:
 *      - VALID: API call successful
 *      - EXPIRED: API call failed
 *      - PENDING: No token present
 *
 * Security Notes:
 * - Password hashing is done client-side
 * - TOTP is never stored, only used during login
 * - Tokens are stored locally and validated regularly
 */

/**
 * Token Validity and Status Management
 *
 * 1. Token Validity:
 *    - All tokens are valid for until midnight (12 A.M.)
 *    - Validity is set when:
 *      a) New token is generated via login
 *      b) Token is manually updated
 *      c) Token is validated successfully
 *    - Validity format: "12 A.M."
 *    - Validity is cleared when:
 *      a) Token is cleared (status -> PENDING)
 *      b) Token validation fails (status -> EXPIRED)
 *
 * 2. Token Status Flow:
 *    PENDING -> VALID -> EXPIRED
 *    - PENDING: Initial state, no token present
 *    - VALID: Token present and validated
 *    - EXPIRED: Token present but validation failed
 *
 * 3. Status Updates:
 *    - Automatic updates via validateBrokerToken()
 *    - Manual updates via updateBrokerStatus()
 *    - Status changes trigger token and validity updates
 */

/**
 * Constants related to broker operations
 */
// Environment-aware web base URL for redirects
const WEB_BASE_URL = import.meta.env.PROD
  ? 'https://www.amptrade.in'
  : 'http://localhost:5178'

export const BROKER_CONSTANTS = {
  TOKEN_VALIDITY: '12 A.M.',
  STATUS: {
    MISSING: 'pending',
    INVALID: 'expired',
    VALID: 'valid',
  } as const,
  DASHBOARD_URLS: {
    Shoonya: 'https://prism.shoonya.com/',
    Flattrade: 'https://wall.flattrade.in/',
    Zebu: 'https://go.mynt.in/',
    Tradesmart: 'https://web.tradesmartonline.in/',
    Zerodha: 'https://developers.kite.trade/',
    Infinn: 'https://api.infinn.in/',
    Upstox: 'https://console.upstox.com/developer',
  } as const,
  REDIRECT_URLS: {
    Shoonya: `${WEB_BASE_URL}/broker-redirect/shoonya`,
    Flattrade: `${WEB_BASE_URL}/broker-redirect/flattrade`,
    Zebu: `${WEB_BASE_URL}/broker-redirect/zebu`,
    Tradesmart: `${WEB_BASE_URL}/broker-redirect/tradesmart`,
    Zerodha: `${WEB_BASE_URL}/broker-redirect/zerodha`,
    Infinn: `${WEB_BASE_URL}/broker-redirect/infinn`,
    Upstox: `${WEB_BASE_URL}/broker-redirect/upstox`,
  } as const,
  AUTH_URLS: {
    Flattrade: 'https://auth.flattrade.in/',
    Upstox: 'https://api.upstox.com/v2/login/authorization/dialog',
  } as const,
} as const

/**
 * Broker status type derived from constants
 */
export type BrokerStatus = (typeof BROKER_CONSTANTS.STATUS)[keyof typeof BROKER_CONSTANTS.STATUS]

/**
 * Interface representing a broker in the system
 * @interface
 */
export interface Broker {
  /** Unique identifier for the broker */
  id: string
  /** Type of the broker */
  type: BrokerType
  /** Display name of the broker */
  name: string
  /** Client ID provided by the broker */
  clientId: string
  /** API key for broker authentication */
  apiKey: string
  /** Optional API secret (required for some brokers) */
  apiSecret?: string
  /** API token for active sessions */
  apiToken: string
  /** Token validity period */
  validity: string
  /** Current status of the broker */
  status: BrokerStatus
  /** Timestamp of broker creation */
  createdAt: string
  /** Timestamp of last update */
  lastUpdated: string
  /** Whether the broker is currently loading */
  isLoading?: boolean
  userId: string
}

/**
 * Interface for creating a new broker
 * @interface
 */
export interface NewBrokerForm {
  /** Type of the broker to create */
  type: BrokerType
  /** Client ID for the new broker */
  clientId: string
  /** API key for the new broker */
  apiKey: string
  /** Optional API secret */
  apiSecret?: string
  /** Account name for identifying multiple accounts */
  accountName?: string
}

/**
 * Validation errors for broker form
 */
export interface BrokerValidationError {
  field: keyof NewBrokerForm | 'general'
  message: string
}

/**
 * Validates a new broker form
 * @param form - Form data to validate
 * @returns Array of validation errors, empty if valid
 */
export function validateBrokerForm(form: NewBrokerForm): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = []

  if (!form.clientId?.trim()) {
    errors.push({ field: 'clientId', message: 'Client ID is required' })
  }

  if (!form.apiKey?.trim()) {
    errors.push({ field: 'apiKey', message: 'API Key is required' })
  }

  // Validate API Secret for brokers that require it
  if ((form.type === 'Flattrade' || form.type === 'Zerodha' || form.type === 'Upstox') && !form.apiSecret?.trim()) {
    errors.push({ field: 'apiSecret', message: 'API Secret is required for this broker' })
  }

  if (!form.accountName?.trim()) {
    errors.push({ field: 'accountName', message: 'Account Name is required' })
  }

  return errors
}

/**
 * Interface for broker operations
 * @interface
 */
export interface BrokerOperations {
  /** Activate a broker */
  activate(brokerId: string): Promise<void>
  /** Deactivate a broker */
  deactivate(brokerId: string): Promise<void>
  /** Generate new token for broker */
  generateToken(brokerId: string): Promise<string>
  /** Validate broker credentials */
  validateCredentials(broker: NewBrokerForm): Promise<boolean>
}

/**
 * Interface for broker authentication results
 * @interface
 */
export interface BrokerAuthResult {
  success: boolean
  token?: string
  error?: string
  validity?: string
}

/**
 * Type guard to check if a value is a valid BrokerType
 * @param value - Value to check
 */
export function isBrokerType(value: string): value is BrokerType {
  return ['Shoonya', 'Flattrade', 'Zebu', 'Tradesmart', 'Zerodha', 'Infinn', 'Upstox'].includes(value)
}

/**
 * Type guard to check if a value is a valid BrokerStatus
 * @param value - Value to check
 */
export function isBrokerStatus(value: string): value is BrokerStatus {
  return Object.values(BROKER_CONSTANTS.STATUS).includes(value as BrokerStatus)
}

/**
 * Helper function to create a new broker instance
 * @param form - New broker form data
 */
export function createBroker(form: NewBrokerForm): Omit<Broker, 'id'> {
  return {
    type: form.type,
    name: form.accountName?.trim() || form.type,
    clientId: form.clientId.trim(),
    apiKey: form.apiKey.trim(),
    apiSecret: form.apiSecret?.trim(),
    apiToken: '',
    validity: BROKER_CONSTANTS.TOKEN_VALIDITY,
    status: BROKER_CONSTANTS.STATUS.MISSING,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    isLoading: false,
    userId: '',
  }
}

/**
 * Interface for token generation results
 * @interface
 */
export interface TokenGenerationResult {
  success: boolean
  token?: string
  error?: string
}

/**
 * Flattrade specific interfaces
 */
export interface FlattradeAuthResponse {
  /** Response status from Flattrade */
  stat: 'Ok' | 'Not_Ok'
  /** Generated token on successful auth */
  token?: string
  /** Error message if auth fails */
  emsg?: string
}

/**
 * Flattrade specific constants
 */
export const FLATTRADE_CONSTANTS = {
  /** Auth window timeout in milliseconds */
  AUTH_TIMEOUT: 300000, // 5 minutes
  /** Token validity duration */
  TOKEN_EXPIRY: '12 A.M.',
  /** Minimum length for API key */
  MIN_API_KEY_LENGTH: 8,
  /** Minimum length for client ID */
  MIN_CLIENT_ID_LENGTH: 6,
} as const

// Create shared event types
export type BrokerEvents = {
  (e: 'toggleClientId', id: string): void
  (e: 'copy', text: string, brokerId?: string): void
  (e: 'remove', id: string): void
  (e: 'login', broker: Broker): void
  (e: 'toggleActive', broker: Broker): void
  (e: 'toggleMultiSelect', broker: Broker): void
  (e: 'clearMultiSelect'): void
  (e: 'selectAllMulti'): void
  (e: 'selectAllByType', brokerType: string): void
  (e: 'setPrimary', broker: Broker): void
  (e: 'updateName', brokerId: string, name: string): void
}

// Create type for copy messages
export interface CopyMessages {
  apiKey?: string
}

export interface BrokerCopyMessages {
  [brokerId: string]: {
    apiKey?: string
  }
}

// Add this new comprehensive validation function
export function validateBrokerData(broker: NewBrokerForm | Broker): string | null {
  if (!broker.clientId?.trim()) {
    return 'Client ID is required'
  }
  if (!broker.apiKey?.trim()) {
    return 'API Key is required'
  }
  if (broker.type === 'Flattrade') {
    if (!broker.apiSecret?.trim()) {
      return `API Secret is required for ${broker.type}`
    }
    if (broker.apiKey.length < FLATTRADE_CONSTANTS.MIN_API_KEY_LENGTH) {
      return `API Key must be at least ${FLATTRADE_CONSTANTS.MIN_API_KEY_LENGTH} characters`
    }
    if (broker.clientId.length < FLATTRADE_CONSTANTS.MIN_CLIENT_ID_LENGTH) {
      return `Client ID must be at least ${FLATTRADE_CONSTANTS.MIN_CLIENT_ID_LENGTH} characters`
    }
  }
  return null
}

/**
 * Update broker status and manage token validity
 * @param broker - Broker to update
 * @param newStatus - New status to set
 * @param clearToken - Whether to clear the token (default: false)
 */
export function updateBrokerStatus(broker: Broker, newStatus: BrokerStatus, clearToken = false) {
  broker.status = newStatus
  broker.lastUpdated = new Date().toISOString()

  // Only clear token if explicitly requested
  if (clearToken) {
    // console.log(`Clearing token for broker ${broker.id} (${broker.type}) - Status: ${newStatus}`)
    broker.apiToken = ''
    broker.validity = '' // Clear validity when token is cleared
  } else if (newStatus === BROKER_CONSTANTS.STATUS.VALID && !broker.validity) {
    // Set validity for valid tokens that don't have it set
    broker.validity = BROKER_CONSTANTS.TOKEN_VALIDITY
  }
}
