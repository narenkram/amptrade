<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBroker } from '@/modules/private/managebrokers/composables/useBroker'
import type { Broker } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import { useBrokerStore } from '@/modules/private/shared/stores/brokerStore'
import { fetchBrokerFundLimit } from '@/modules/private/shared/composables/useFundlimits'
import { calculateFunds, calculateTotalInvestment } from '@/modules/private/shared/adapters/fundAdapters'
import type { FundLimitResponse } from '@/modules/private/shared/adapters/fundAdapters'

import { getArchitectureDisplayName, getBrokerApiArchitecture } from '@/modules/utils/brokerUtils'


const { brokers, maskClientId } = useBroker()
const brokerStore = useBrokerStore()

const {
  primaryBrokerId,
  primaryBroker,
  selectedMultiBrokerIds,
  selectedArchitecture: currentApiArchitecture,
  selectedMultiBrokers: selectedBrokers,
} = storeToRefs(brokerStore)

const otherSelectedBrokers = computed<Broker[]>(() => {
  if (!primaryBrokerId.value) return selectedBrokers.value
  return selectedBrokers.value.filter((b) => b.id !== primaryBrokerId.value)
})

const otherSelectedBrokerTypes = computed<string[]>(() => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const b of otherSelectedBrokers.value) {
    const t = b.type || ''
    if (t && !seen.has(t)) {
      seen.add(t)
      result.push(t)
    }
  }
  return result
})

// Get active brokers that have been added
const availableBrokers = computed(() => brokers.value || [])

// Add error message for API architecture mismatch
const architectureError = ref<string | null>(null)
const primarySelectionError = ref<string | null>(null)
const brokerLimitError = ref<string | null>(null)

// Track fund limits for each broker
const brokerFunds = ref<Record<string, FundLimitResponse | null>>({})
const loadingFunds = ref<Record<string, boolean>>({})

// Get all unique architectures from available brokers
const availableArchitectures = computed(() => {
  const archs = new Set<string>()
  for (const broker of availableBrokers.value) {
    archs.add(getBrokerApiArchitecture(broker))
  }
  return Array.from(archs).sort()
})

// Get brokers grouped by architecture
const getBrokersByArchitecture = (arch: string): Broker[] => {
  return availableBrokers.value
    .filter(b => getBrokerApiArchitecture(b) === arch)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// Check if an architecture is compatible with current selection
const isArchitectureCompatible = (arch: string): boolean => {
  if (!currentApiArchitecture.value || selectedBrokers.value.length === 0) return true
  return arch === currentApiArchitecture.value
}

// Check if a broker is compatible with the current API architecture
const isBrokerCompatible = (broker: Broker): boolean => {
  if (selectedBrokers.value.length === 0) return true
  return getBrokerApiArchitecture(broker) === currentApiArchitecture.value
}

// Fetch fund limits for a specific broker
const fetchFundLimit = async (broker: Broker) => {
  if (!broker || broker.status !== BROKER_CONSTANTS.STATUS.VALID) return

  loadingFunds.value[broker.id] = true
  try {
    const response = await fetchBrokerFundLimit(broker)
    brokerFunds.value[broker.id] = response.data
  } catch (error) {
    console.error(`Error fetching fund limit for broker ${broker.id}:`, error)
    brokerFunds.value[broker.id] = null
  } finally {
    loadingFunds.value[broker.id] = false
  }
}

// Get formatted funds for a broker
const getBrokerFunds = (brokerId: string): string => {
  if (loadingFunds.value[brokerId]) return 'Loading...'

  const data = brokerFunds.value[brokerId]
  if (!data) return '₹0'

  const broker = availableBrokers.value.find((b) => b.id === brokerId)
  const calculatedFunds = calculateFunds(data, broker?.type)

  return `₹${calculatedFunds}`
}

// Handle broker selection change
const toggleBrokerSelection = (broker: Broker) => {
  try {
    brokerStore.toggleMultiBroker(broker.id)
    architectureError.value = null
    brokerLimitError.value = null
    primarySelectionError.value = null
    refreshAllFunds()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to select broker.'
    if (message.includes('incompatible')) {
      architectureError.value = message
      brokerLimitError.value = null
      return
    }
    primarySelectionError.value = message
  }
}

const handleSetPrimary = (broker: Broker) => {
  try {
    brokerStore.setPrimaryBroker(broker.id)
    architectureError.value = null
    brokerLimitError.value = null
    primarySelectionError.value = null
    refreshAllFunds()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to set primary broker.'
    primarySelectionError.value = message
  }
}

// Reset all selected brokers
const resetBrokerSelection = () => {
  brokerStore.resetMultiBrokerSelection()
  architectureError.value = null
  brokerLimitError.value = null
  primarySelectionError.value = null
  refreshAllFunds()
}

// Select all brokers by architecture
const selectAllByArchitecture = (architecture: string) => {
  try {
    brokerStore.selectAllMultiBrokersByArchitecture(architecture)
    architectureError.value = null
    brokerLimitError.value = null
    primarySelectionError.value = null
    refreshAllFunds()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to select brokers.'
    if (message.includes('incompatible')) {
      architectureError.value = message
      brokerLimitError.value = null
      return
    }
    primarySelectionError.value = message
  }
}

// Check if a broker is selected
const isBrokerSelected = (brokerId: string) => {
  return selectedMultiBrokerIds.value.includes(brokerId)
}

// Add current date/time functionality
const currentDateTime = ref('')

const updateDateTime = () => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }
  currentDateTime.value = now.toLocaleString('en-US', options)
}

// Update time every second
let timeInterval: ReturnType<typeof setInterval>

// Function to refresh all fund limits
const refreshAllFunds = async () => {
  for (const broker of availableBrokers.value) {
    if (broker.status === BROKER_CONSTANTS.STATUS.VALID) {
      await fetchFundLimit(broker)
    }
  }

  // Calculate total investment from all selected brokers
  let totalInvestment = 0
  for (const broker of selectedBrokers.value) {
    if (broker.status === BROKER_CONSTANTS.STATUS.VALID) {
      const fundData = brokerFunds.value[broker.id]
      if (fundData) {
        totalInvestment += calculateTotalInvestment(fundData, broker.type)
      }
    }
  }

  // Save to localStorage and dispatch event
  localStorage.setItem('totalInvestment', totalInvestment.toString())
  window.dispatchEvent(
    new CustomEvent('total-investment-updated', {
      detail: { totalInvestment },
    })
  )
}

// Handle funds update event
const handleFundsUpdate = () => {
  refreshAllFunds()
}

onMounted(async () => {
  await brokerStore.loadBrokers()

  const toValidate = Array.from(
    new Set([
      ...selectedMultiBrokerIds.value,
      ...(primaryBrokerId.value ? [primaryBrokerId.value] : []),
    ]),
  )
  await Promise.allSettled(toValidate.map((id) => brokerStore.validateBrokerToken(id)))
  brokerStore.hydrateSelection()

  // Fetch fund limits for all valid brokers
  refreshAllFunds()

  // Set up event listener for funds update
  window.addEventListener('funds-update-needed', handleFundsUpdate)

  updateDateTime() // Initial update
  timeInterval = setInterval(updateDateTime, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }

  // Remove event listener
  window.removeEventListener('funds-update-needed', handleFundsUpdate)
})

// Watch for broker changes and update fund limits
watch(
  brokers,
  async () => {
    brokerStore.hydrateSelection()
    await refreshAllFunds()
  },
  { deep: true },
)

// Add a refresh button functionality
const refreshFunds = async () => {
  await refreshAllFunds()
}

// Architecture label for modal header
const architectureLabel = computed(() => {
  const arch =
    currentApiArchitecture.value ||
    (primaryBroker.value ? getBrokerApiArchitecture(primaryBroker.value) : null) ||
    (selectedBrokers.value[0] ? getBrokerApiArchitecture(selectedBrokers.value[0]) : null)
  if (!arch) return 'Not Selected'
  if (arch === 'kite-connect') return 'KiteConnect API'
  if (arch === 'upstox-api') return 'Upstox API'
  return 'NorenAPI'
})
</script>

<template>
  <div class="row align-items-center gap-2">
    <div class="col">
      <div class="d-flex flex-wrap align-items-center">
        <button type="button" class="btn btn-outline-secondary btn-sm me-2" data-bs-toggle="modal"
          data-bs-target="#multiBrokerSelectorModal">
          Select Brokers
        </button>
        <span class="text-muted small" v-if="selectedBrokers.length === 0">
          No brokers selected
        </span>
        <span v-else class="small">
          <span class="badge bg-success text-white me-2">{{ selectedBrokers.length }}</span>
          accounts selected • {{ architectureLabel }}
        </span>
      </div>
    </div>
    <div class="col-auto d-flex align-items-center">
      <span class="text-muted small me-2">{{ currentDateTime }}</span>
    </div>
  </div>
  <div class="alert alert-danger mt-2 mb-0" v-if="architectureError">
    <FontAwesomeIcon icon="exclamation-triangle" class="me-2" />
    {{ architectureError }}
  </div>
  <div class="alert alert-danger mt-2 mb-0" v-if="primarySelectionError">
    <FontAwesomeIcon icon="times-circle" class="me-2" />
    {{ primarySelectionError }}
  </div>
  <div class="alert alert-warning mt-2 mb-0" v-if="brokerLimitError">
    <FontAwesomeIcon icon="exclamation-circle" class="me-2" />
    {{ brokerLimitError }}
  </div>

  <div class="modal fade" id="multiBrokerSelectorModal" tabindex="-1" aria-labelledby="multiBrokerSelectorLabel"
    aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="multiBrokerSelectorLabel">Multi Broker Selection</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-3">
            <span class="badge bg-primary me-2">API: {{ architectureLabel }}</span>
            <span class="badge bg-secondary">{{
              selectedBrokers.length }} brokers</span>
          </div>

          <div class="text-center mb-2">
            <FontAwesomeIcon icon="arrow-down" class="text-muted" />
          </div>

          <div class="card mb-2">
            <div class="card-body py-2">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <strong>Primary Broker</strong>
                  <div class="small text-muted">
                    {{
                      primaryBroker
                        ? `${primaryBroker.name} (${maskClientId(primaryBroker.clientId)})`
                        : 'Not set'
                    }}
                  </div>
                </div>
                <span v-if="primaryBroker && primaryBroker.status === BROKER_CONSTANTS.STATUS.VALID"
                  class="badge bg-light text-dark">
                  <FontAwesomeIcon v-if="primaryBroker && loadingFunds[primaryBroker.id]" icon="spinner" spin />
                  {{ primaryBroker ? getBrokerFunds(primaryBroker.id) : '₹0' }}
                </span>
              </div>
            </div>
          </div>

          <div class="text-center mb-2">
            <FontAwesomeIcon icon="arrow-down" class="text-muted" />
          </div>

          <div class="d-flex flex-wrap justify-content-start gap-2 mb-3">
            <div v-for="type in otherSelectedBrokerTypes" :key="type" class="badge bg-success">
              {{ type }}
            </div>
            <div v-if="otherSelectedBrokers.length === 0" class="text-muted small">
              No other selected brokers
            </div>
          </div>

          <div class="border rounded p-2">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="mb-0">Select Brokers</h6>
              <div class="text-muted small">Select brokers that use the same API architecture.</div>
            </div>

            <!-- Grouped by Architecture -->
            <div v-for="arch in availableArchitectures" :key="arch" class="mb-3">
              <!-- Architecture Group Header -->
              <div class="d-flex justify-content-between align-items-center bg-light rounded p-2 mb-2">
                <span class="fw-semibold">
                  <FontAwesomeIcon icon="building" class="me-2" />
                  {{ getArchitectureDisplayName(arch) }}
                  <span class="badge bg-secondary ms-2">{{ getBrokersByArchitecture(arch).length }} account(s)</span>
                </span>
                <button class="btn btn-sm btn-outline-primary" @click="selectAllByArchitecture(arch)"
                  :disabled="!primaryBrokerId || !isArchitectureCompatible(arch)"
                  :title="!isArchitectureCompatible(arch) ? 'Incompatible API architecture' : `Select all ${getArchitectureDisplayName(arch)} accounts`">
                  <FontAwesomeIcon icon="check-double" class="me-1" />
                  Select All
                </button>
              </div>

              <!-- Brokers in this architecture -->
              <ul class="list-group list-group-flush">
                <li v-for="broker in getBrokersByArchitecture(arch)" :key="broker.id" class="list-group-item px-0 py-2">
                  <div class="d-flex justify-content-between align-items-center mx-2">
                    <div class="form-check">
                      <input type="checkbox" class="form-check-input" :id="`modal-broker-${broker.id}`"
                        :checked="isBrokerSelected(broker.id)" @change="toggleBrokerSelection(broker)" :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID ||
                          (!isBrokerSelected(broker.id) && !isBrokerCompatible(broker)) ||
                          !primaryBrokerId
                          " :title="!isBrokerCompatible(broker) && !isBrokerSelected(broker.id)
                            ? `Incompatible API architecture: ${getBrokerApiArchitecture(broker)}`
                            : !primaryBrokerId
                              ? 'Set a Primary Broker before selecting accounts'
                              : ''
                            " />
                      <label class="form-check-label" :for="`modal-broker-${broker.id}`">
                        {{ broker.name }} ({{ maskClientId(broker.clientId) }})
                        <span v-if="broker.status !== BROKER_CONSTANTS.STATUS.VALID" class="text-danger ms-1">
                          - Expired Token
                        </span>
                      </label>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                      <span v-if="broker.status === BROKER_CONSTANTS.STATUS.VALID" class="badge bg-light text-dark">
                        <FontAwesomeIcon v-if="loadingFunds[broker.id]" icon="spinner" spin />
                        {{ getBrokerFunds(broker.id) }}
                      </span>
                      <span v-if="primaryBrokerId === broker.id" class="badge bg-primary">Primary</span>
                      <button v-else class="btn btn-sm btn-outline-primary" @click="handleSetPrimary(broker)"
                        :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID" title="Set as Primary">
                        Set Primary
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <div v-if="availableBrokers.length === 0" class="text-muted text-center py-3">
              <FontAwesomeIcon icon="info-circle" class="me-1" />
              No brokers available. Please add brokers in the Manage Brokers section.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-danger btn-sm" @click="resetBrokerSelection"
            :disabled="selectedBrokers.length === 0">
            Reset Selection
          </button>
          <button class="btn btn-outline-secondary btn-sm" @click="refreshFunds">
            Refresh Funds
          </button>
          <button type="button" class="btn btn-primary btn-sm" data-bs-dismiss="modal">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* No custom CSS classes needed - using only Bootstrap classes */
</style>
