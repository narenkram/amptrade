import { defineStore } from 'pinia'
import type { Broker, NewBrokerForm } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS, updateBrokerStatus } from '@/modules/private/shared/types/broker'
import { fetchBrokerFundLimit } from '@/modules/private/shared/composables/useFundlimits'
import { logger } from '@/modules/utils/logger'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import { getBrokerApiArchitecture } from '@/modules/utils/brokerUtils'

/**
 * Interface defining the structure and methods of the broker store
 */
export interface BrokerStore {
  brokers: Broker[]
  isInitialized: boolean
  storeError: string | null
  selectedBrokerId: string | null
  primaryBrokerId: string | null
  selectedMultiBrokerIds: string[]
  selectedArchitecture: string | null
  setLoading: (brokerId: string, loading: boolean) => void
  updateBrokerToken: (brokerId: string, token: string) => Promise<Broker>
  validateBrokerToken: (brokerId: string) => Promise<void>
  saveBrokers: () => void
  loadBrokers: () => void
  addBroker: (form: NewBrokerForm) => Promise<Broker>
  removeBroker: (brokerId: string) => void
  validateAllBrokers: () => Promise<void>
  updateBrokerName: (brokerId: string, name: string) => Promise<Broker>
  hydrateSelection: () => void
  toggleSelectedBroker: (brokerId: string) => void
  setPrimaryBroker: (brokerId: string | null) => void
  toggleMultiBroker: (brokerId: string) => void
  resetMultiBrokerSelection: () => void
  selectAllCompatibleMultiBrokers: () => void
  selectAllMultiBrokersByArchitecture: (architecture: string) => void
}

/**
 * Pinia store for managing broker connections and their authentication tokens.
 * Handles broker CRUD operations, token validation, and persistence.
 */
export const useBrokerStore = defineStore('broker', {
  state: () => ({
    brokers: [] as Broker[],
    isInitialized: false,
    storeError: null as string | null,
    selectedBrokerId: null as string | null,
    primaryBrokerId: null as string | null,
    selectedMultiBrokerIds: [] as string[],
    selectedArchitecture: null as string | null,
  }),

  getters: {
    selectedBroker: (state): Broker | null => {
      if (!state.selectedBrokerId) return null
      return state.brokers.find((b) => b.id === state.selectedBrokerId) || null
    },
    primaryBroker: (state): Broker | null => {
      if (!state.primaryBrokerId) return null
      return state.brokers.find((b) => b.id === state.primaryBrokerId) || null
    },
    selectedMultiBrokers: (state): Broker[] => {
      const byId = new Map(state.brokers.map((b) => [b.id, b]))
      return state.selectedMultiBrokerIds
        .map((id) => byId.get(id))
        .filter((b): b is Broker => Boolean(b))
    },
  },

  actions: {
    hydrateSelection(): void {
      let selectedBrokerId: string | null = null
      let primaryBrokerId: string | null = null
      let selectedMultiBrokerIds: string[] = []

      try {
        selectedBrokerId = localStorage.getItem(STORAGE_KEYS.SELECTED_BROKER)
      } catch {
        selectedBrokerId = null
      }

      try {
        primaryBrokerId = localStorage.getItem(STORAGE_KEYS.PRIMARY_BROKER_ID)
      } catch {
        primaryBrokerId = null
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SELECTED_MULTI_BROKERS)
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          if (Array.isArray(parsed)) {
            selectedMultiBrokerIds = parsed.filter((v): v is string => typeof v === 'string')
          }
        }
      } catch {
        selectedMultiBrokerIds = []
      }

      const validBrokerIds = new Set(this.brokers.map((b) => b.id))
      if (!selectedBrokerId || !validBrokerIds.has(selectedBrokerId)) {
        selectedBrokerId = null
      }

      if (!primaryBrokerId || !validBrokerIds.has(primaryBrokerId)) {
        primaryBrokerId = null
      }

      selectedMultiBrokerIds = selectedMultiBrokerIds.filter((id) => validBrokerIds.has(id))

      const uniqueMultiIds = Array.from(new Set(selectedMultiBrokerIds))
      selectedMultiBrokerIds = uniqueMultiIds

      selectedMultiBrokerIds = selectedMultiBrokerIds.filter((id) => {
        const broker = this.brokers.find((b) => b.id === id)
        return broker?.status === BROKER_CONSTANTS.STATUS.VALID
      })

      this.selectedBrokerId = selectedBrokerId
      this.primaryBrokerId = primaryBrokerId
      this.selectedMultiBrokerIds = selectedMultiBrokerIds

      const firstSelected = this.selectedMultiBrokers[0] || null
      const primary = this.primaryBroker
      this.selectedArchitecture = firstSelected
        ? getBrokerApiArchitecture(firstSelected)
        : primary
          ? getBrokerApiArchitecture(primary)
          : null

      try {
        if (this.selectedBrokerId) {
          localStorage.setItem(STORAGE_KEYS.SELECTED_BROKER, this.selectedBrokerId)
        } else {
          localStorage.removeItem(STORAGE_KEYS.SELECTED_BROKER)
        }

        if (this.primaryBrokerId) {
          localStorage.setItem(STORAGE_KEYS.PRIMARY_BROKER_ID, this.primaryBrokerId)
          const primaryType = this.primaryBroker?.type
          if (primaryType) {
            localStorage.setItem(STORAGE_KEYS.PRIMARY_BROKER_TYPE, primaryType)
          }
        } else {
          localStorage.removeItem(STORAGE_KEYS.PRIMARY_BROKER_ID)
          localStorage.removeItem(STORAGE_KEYS.PRIMARY_BROKER_TYPE)
        }

        localStorage.setItem(
          STORAGE_KEYS.SELECTED_MULTI_BROKERS,
          JSON.stringify(this.selectedMultiBrokerIds),
        )

        if (this.selectedArchitecture) {
          localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, this.selectedArchitecture)
        } else {
          localStorage.removeItem(STORAGE_KEYS.BROKER_ARCHITECTURE)
        }
      } catch {
      }
    },

    toggleSelectedBroker(brokerId: string): void {
      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) throw new Error('Broker not found')
      if (broker.status !== BROKER_CONSTANTS.STATUS.VALID) {
        throw new Error('Cannot select broker: Invalid or expired token')
      }

      const next = this.selectedBrokerId === brokerId ? null : brokerId
      this.selectedBrokerId = next

      try {
        if (next) {
          localStorage.setItem(STORAGE_KEYS.SELECTED_BROKER, next)
          localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, getBrokerApiArchitecture(broker))
        } else {
          localStorage.removeItem(STORAGE_KEYS.SELECTED_BROKER)
        }
      } catch {
      }
    },

    setPrimaryBroker(brokerId: string | null): void {
      if (!brokerId) {
        this.primaryBrokerId = null
        try {
          localStorage.removeItem(STORAGE_KEYS.PRIMARY_BROKER_ID)
          localStorage.removeItem(STORAGE_KEYS.PRIMARY_BROKER_TYPE)
        } catch {
        }
        return
      }

      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) throw new Error('Primary broker not found')
      if (broker.status !== BROKER_CONSTANTS.STATUS.VALID) {
        throw new Error('Primary broker token is invalid or expired. Please login again or set a different primary.')
      }

      const newArch = getBrokerApiArchitecture(broker)

      if (this.selectedMultiBrokers.length > 0 && this.selectedArchitecture && this.selectedArchitecture !== newArch) {
        this.selectedMultiBrokerIds = []
      }

      this.primaryBrokerId = brokerId
      this.selectedArchitecture = newArch

      if (!this.selectedMultiBrokerIds.includes(brokerId)) {
        this.selectedMultiBrokerIds = [brokerId, ...this.selectedMultiBrokerIds]
      }

      try {
        localStorage.setItem(STORAGE_KEYS.PRIMARY_BROKER_ID, brokerId)
        localStorage.setItem(STORAGE_KEYS.PRIMARY_BROKER_TYPE, broker.type)
        localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, newArch)
        localStorage.setItem(
          STORAGE_KEYS.SELECTED_MULTI_BROKERS,
          JSON.stringify(this.selectedMultiBrokerIds),
        )
      } catch {
      }
    },

    toggleMultiBroker(brokerId: string): void {
      if (!this.primaryBrokerId) {
        throw new Error('Set a Primary Broker before selecting accounts.')
      }

      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) throw new Error('Broker not found')
      if (broker.status !== BROKER_CONSTANTS.STATUS.VALID) {
        throw new Error('Cannot select broker: Expired or missing token')
      }

      const arch = getBrokerApiArchitecture(broker)
      const currentArch = this.selectedArchitecture
      if (this.selectedMultiBrokerIds.length > 0 && currentArch && arch !== currentArch) {
        throw new Error(
          `Cannot select ${broker.name}: incompatible API (${arch}) with current selection (${currentArch}).`,
        )
      }

      const exists = this.selectedMultiBrokerIds.includes(brokerId)
      if (!exists) {
        if (!this.selectedArchitecture) {
          this.selectedArchitecture = arch
          try {
            localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, arch)
          } catch {
          }
        }

        this.selectedMultiBrokerIds = [...this.selectedMultiBrokerIds, brokerId]
      } else {
        const next = this.selectedMultiBrokerIds.filter((id) => id !== brokerId)
        this.selectedMultiBrokerIds = next

        if (this.selectedMultiBrokerIds.length === 0) {
          const primary = this.primaryBroker
          this.selectedArchitecture = primary ? getBrokerApiArchitecture(primary) : null
        }
      }

      try {
        localStorage.setItem(
          STORAGE_KEYS.SELECTED_MULTI_BROKERS,
          JSON.stringify(this.selectedMultiBrokerIds),
        )
        if (this.selectedArchitecture) {
          localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, this.selectedArchitecture)
        } else {
          localStorage.removeItem(STORAGE_KEYS.BROKER_ARCHITECTURE)
        }
      } catch {
      }
    },

    resetMultiBrokerSelection(): void {
      this.selectedMultiBrokerIds = []
      const primary = this.primaryBroker
      this.selectedArchitecture = primary ? getBrokerApiArchitecture(primary) : null
      try {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_MULTI_BROKERS)
        if (this.selectedArchitecture) {
          localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, this.selectedArchitecture)
        } else {
          localStorage.removeItem(STORAGE_KEYS.BROKER_ARCHITECTURE)
        }
      } catch {
      }
    },

    selectAllCompatibleMultiBrokers(): void {
      if (!this.primaryBrokerId) {
        throw new Error('Set a Primary Broker before selecting accounts.')
      }

      const primary = this.primaryBroker
      if (!primary) throw new Error('Primary broker not found.')
      if (primary.status !== BROKER_CONSTANTS.STATUS.VALID) {
        throw new Error('Primary broker token is invalid or expired. Please login again or set a different primary.')
      }

      const targetArch = getBrokerApiArchitecture(primary)
      const compatible = this.brokers.filter((b) => {
        if (b.status !== BROKER_CONSTANTS.STATUS.VALID) return false
        return getBrokerApiArchitecture(b) === targetArch
      })

      const ids = compatible.map((b) => b.id)
      this.selectedMultiBrokerIds = ids
      this.selectedArchitecture = targetArch

      if (!ids.includes(primary.id)) {
        this.selectedMultiBrokerIds = [primary.id, ...ids]
      }

      try {
        localStorage.setItem(
          STORAGE_KEYS.SELECTED_MULTI_BROKERS,
          JSON.stringify(this.selectedMultiBrokerIds),
        )
        localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, targetArch)
      } catch {
      }
    },

    selectAllMultiBrokersByArchitecture(architecture: string): void {
      if (!this.primaryBrokerId) {
        throw new Error('Set a Primary Broker before selecting accounts.')
      }

      const primary = this.primaryBroker
      if (!primary) throw new Error('Primary broker not found.')

      const currentArch = this.selectedArchitecture
      if (this.selectedMultiBrokerIds.length > 0 && currentArch && architecture !== currentArch) {
        throw new Error(
          `Cannot select brokers: incompatible API (${architecture}) with current selection (${currentArch}).`,
        )
      }

      const brokersOfArch = this.brokers.filter((b) => {
        if (getBrokerApiArchitecture(b) !== architecture) return false
        if (b.status !== BROKER_CONSTANTS.STATUS.VALID) return false
        return true
      })

      const existing = new Set(this.selectedMultiBrokerIds)
      const newIds = brokersOfArch.map((b) => b.id).filter((id) => !existing.has(id))

      if (this.selectedMultiBrokerIds.length === 0) {
        this.selectedArchitecture = architecture
      }

      this.selectedMultiBrokerIds = [...this.selectedMultiBrokerIds, ...newIds]

      if (!this.selectedMultiBrokerIds.includes(primary.id)) {
        this.selectedMultiBrokerIds = [primary.id, ...this.selectedMultiBrokerIds]
      }

      try {
        localStorage.setItem(
          STORAGE_KEYS.SELECTED_MULTI_BROKERS,
          JSON.stringify(this.selectedMultiBrokerIds),
        )
        if (this.selectedArchitecture) {
          localStorage.setItem(STORAGE_KEYS.BROKER_ARCHITECTURE, this.selectedArchitecture)
        }
      } catch {
      }
    },

    /**
     * Updates the loading state for a specific broker
     * @param {string} brokerId - The unique identifier of the broker
     * @param {boolean} loading - The loading state to set
     */
    setLoading(brokerId: string, loading: boolean) {
      const broker = this.brokers.find((b) => b.id === brokerId)
      if (broker) {
        broker.isLoading = loading
        this.saveBrokers()
      }
    },

    /**
     * Updates a broker's API token and validates it
     * @param {string} brokerId - The unique identifier of the broker
     * @param {string} token - The new API token to set
     * @returns {Promise<Broker>} The updated broker object
     * @throws {Error} If token is empty or broker not found
     */
    async updateBrokerToken(brokerId: string, token: string): Promise<Broker> {
      if (!token?.trim()) {
        throw new Error('API Token is required')
      }

      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) {
        throw new Error('Broker not found')
      }

      broker.apiToken = token.trim()
      broker.validity = BROKER_CONSTANTS.TOKEN_VALIDITY
      broker.lastUpdated = new Date().toISOString()

      await this.validateBrokerToken(brokerId)

      this.saveBrokers()
      return broker
    },

    /**
     * Validates a broker's API token by making a test API call
     * @param {string} brokerId - The unique identifier of the broker
     * @throws {Error} If broker not found or validation fails
     */
    async validateBrokerToken(brokerId: string): Promise<void> {
      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) {
        logger.error(`Broker not found with ID: ${brokerId}`)
        throw new Error('Broker not found')
      }

      try {
        this.setLoading(brokerId, true)
        logger.log(`Validating token for broker: ${broker.name} (${broker.id})`)

        if (!broker.apiToken) {
          logger.warn(`Token pending for broker: ${broker.name}`)
          updateBrokerStatus(broker, BROKER_CONSTANTS.STATUS.MISSING, true)
          return
        }

        const response = await fetchBrokerFundLimit(broker)
        logger.log(`Broker validation response for ${broker.name}:`, response.status)

        if (response.status === 200) {
          updateBrokerStatus(broker, BROKER_CONSTANTS.STATUS.VALID)
          logger.log(`Broker ${broker.name} validated successfully`)
        } else {
          logger.warn(`Broker ${broker.name} validation failed: expired token`)
          updateBrokerStatus(broker, BROKER_CONSTANTS.STATUS.INVALID, true)
        }

        this.saveBrokers()
      } catch (error) {
        logger.error(`Failed to validate token for broker ${broker.name} (${brokerId}):`, error)
        // Set broker status to expired but don't throw the error to prevent selection issues
        updateBrokerStatus(broker, BROKER_CONSTANTS.STATUS.INVALID, true)
        // Save changes even if validation fails
        this.saveBrokers()
      } finally {
        this.setLoading(brokerId, false)
      }
    },

    /**
     * Updates a broker's display name (account name) and persists the change
     * @param {string} brokerId - The unique identifier of the broker
     * @param {string} name - The new display name to set
     * @returns {Promise<Broker>} The updated broker object
     * @throws {Error} If broker not found or name invalid
     */
    async updateBrokerName(brokerId: string, name: string): Promise<Broker> {
      const trimmed = name?.trim()
      if (!trimmed) {
        throw new Error('Account Name is required')
      }
      const broker = this.brokers.find((b) => b.id === brokerId)
      if (!broker) {
        throw new Error('Broker not found')
      }
      broker.name = trimmed
      broker.lastUpdated = new Date().toISOString()
      await this.saveBrokers()
      return broker
    },

    /**
     * Adds a new broker to the store
     * @param {NewBrokerForm} form - The form data for creating a new broker
     * @returns {Promise<Broker>} The newly created broker object
     * @throws {Error} If required fields are missing
     */
    async addBroker(form: NewBrokerForm): Promise<Broker> {
      try {
        if (!form.apiKey?.trim()) {
          throw new Error('Missing required fields')
        }
        if (!form.clientId?.trim()) {
          throw new Error('Missing required fields')
        }

        const newBroker: Broker = {
          id: crypto.randomUUID(),
          type: form.type,
          name: form.accountName?.trim() || form.type,
          clientId: form.clientId.trim(),
          apiKey: form.apiKey.trim(),
          apiSecret: form.apiSecret?.trim(),
          apiToken: '',
          validity: '',
          status: BROKER_CONSTANTS.STATUS.MISSING,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          userId: 'local',
        }

        this.brokers.push(newBroker)
        await this.saveBrokers()
        return newBroker
      } catch (error) {
        logger.error('Failed to add broker:', error)
        throw error
      }
    },

    /**
     * Removes a broker from the store
     * @param {string} brokerId - The unique identifier of the broker to remove
     * @throws {Error} If broker not found
     */
    async removeBroker(brokerId: string): Promise<void> {
      try {
        // Remove from local state
        const index = this.brokers.findIndex((b) => b.id === brokerId)
        if (index !== -1) {
          this.brokers.splice(index, 1)
        }
        await this.saveBrokers()
      } catch (error) {
        logger.error('Failed to remove broker:', error)
        throw error
      }
    },

    /**
     * Persists the current brokers array to localStorage
     * Updates storeError if save fails
     */
    async saveBrokers(): Promise<void> {
      try {
        const payload = JSON.stringify(this.brokers)
        localStorage.setItem(STORAGE_KEYS.BROKERS, payload)
      } catch (error) {
        logger.error('Failed to save brokers:', error)
        this.storeError = 'Failed to save brokers to local storage'
        throw error
      }
    },

    /**
     * Loads brokers from localStorage into the store
     * Updates isInitialized and storeError states
     */
    async loadBrokers(): Promise<void> {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.BROKERS)
        this.brokers = raw ? (JSON.parse(raw) as Broker[]) : []
        this.hydrateSelection()
        this.isInitialized = true
      } catch (error) {
        logger.error('Failed to load brokers:', error)
        this.storeError = 'Failed to load brokers from local storage'
        throw error
      }
    },

    /**
     * Validates all brokers in the store concurrently
     * Errors for individual brokers are logged but don't stop other validations
     */
    async validateAllBrokers(): Promise<void> {
      const promises = this.brokers.map(async (broker) => {
        try {
          await this.validateBrokerToken(broker.id)
        } catch (error) {
          logger.error(`Failed to validate broker ${broker.id}:`, error)
        }
      })

      await Promise.all(promises)
    },
  },
})
