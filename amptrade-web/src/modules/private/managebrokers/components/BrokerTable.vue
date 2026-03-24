<template>
  <div class="table-responsive rounded p-2 m-0" style="height: unset">
    <table class="table">
      <thead>
        <tr>
          <th>Selection</th>
          <th>Broker</th>
          <th>Client ID</th>
          <th>API Key</th>
          <th class="d-none d-md-table-cell">API Token</th>
          <th class="d-none d-lg-table-cell">Validity</th>
          <th>Activation</th>
          <th class="d-none d-sm-table-cell">Status</th>
          <th>Primary</th>
          <th v-if="showSelect">Select</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!brokers.length">
          <td colspan="11" class="text-center py-4 text-muted">
            <FontAwesomeIcon icon="info-circle" class="me-2" />
            No brokers added, please add one to get started
          </td>
        </tr>
        <template v-for="(broker, index) in sortedBrokers" :key="broker.id">
          <!-- Group header row when API architecture changes -->
          <tr v-if="isFirstOfArchitecture(index)" class="table-secondary">
            <td :colspan="showSelect ? 11 : 10" class="py-2">
              <div class="d-flex align-items-center justify-content-between">
                <span class="fw-semibold">
                  <FontAwesomeIcon icon="building" class="me-2" />
                  {{ getArchitectureDisplayName(getBrokerApiArchitecture(broker)) }}
                  <span class="badge bg-secondary ms-2">{{
                    getBrokerCountByArchitecture(getBrokerApiArchitecture(broker)) }} account(s)</span>
                </span>
                <button class="btn btn-sm btn-outline-primary"
                  @click="handleSelectAllByArchitecture(getBrokerApiArchitecture(broker))"
                  :disabled="!primaryBrokerId || !isArchitectureCompatible(getBrokerApiArchitecture(broker))"
                  :title="!isArchitectureCompatible(getBrokerApiArchitecture(broker)) ? 'Incompatible API architecture' : `Select all ${getArchitectureDisplayName(getBrokerApiArchitecture(broker))} accounts`">
                  <FontAwesomeIcon icon="check-double" class="me-1" />
                  Select All
                </button>
              </div>
            </td>
          </tr>
          <tr :class="{ 'selected-broker': activeBrokers[broker.id] }">
            <td class="text-center">
              <input type="checkbox" class="form-check-input" :checked="isBrokerSelected(broker.id)"
                @change="handleToggleMulti(broker)" :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID ||
                  (!isBrokerSelected(broker.id) && !isBrokerCompatible(broker)) ||
                  !primaryBrokerId
                  " :title="!isBrokerCompatible(broker) && !isBrokerSelected(broker.id)
                    ? `Incompatible API architecture: ${getBrokerApiArchitecture(broker)}`
                    : !primaryBrokerId
                      ? 'Set a Primary Broker before selecting accounts'
                      : ''
                    " />
            </td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <span v-if="editingBrokerId !== broker.id">{{ broker.name }}</span>
                <div v-else class="input-group input-group-sm" style="max-width: 240px">
                  <input type="text" class="form-control" v-model="nameInput" :placeholder="broker.type" />
                  <button class="btn btn-outline-secondary" type="button" @click="cancelEdit">Cancel</button>
                  <button class="btn btn-outline-primary" type="button" @click="saveEdit(broker)">Save</button>
                </div>
                <button v-if="editingBrokerId !== broker.id" class="btn btn-sm btn-outline-secondary" type="button"
                  @click="startEdit(broker)" title="Edit Account Name">
                  Edit
                </button>
              </div>
            </td>
            <td>
              <div class="d-flex align-items-center gap-1">
                <span class="text-truncate" style="max-width: 100px">
                  {{
                    (showClientId[broker.id] ?? false)
                      ? broker.clientId
                      : maskClientId(broker.clientId)
                  }}
                </span>
                <button class="btn btn-sm btn-link text-primary p-0" @click="handleToggleClientId(broker.id)"
                  :title="showClientId[broker.id] ? 'Hide Client ID' : 'Show Client ID'">
                  <FontAwesomeIcon :icon="showClientId[broker.id] ? 'eye-slash' : 'eye'" />
                </button>
              </div>
            </td>
            <td>
              <div class="d-flex align-items-center gap-1">
                <span class="text-truncate" style="max-width: 100px">
                  {{ maskApiKey(broker.apiKey) }}
                </span>
              </div>
            </td>
            <td class="d-none d-md-table-cell">
              <div class="d-flex align-items-center gap-1">
                <span class="text-truncate" style="max-width: 100px">
                  {{ maskApiToken(broker.apiToken) }}
                </span>
              </div>
            </td>
            <td class="d-none d-lg-table-cell">{{ BROKER_CONSTANTS.TOKEN_VALIDITY }}</td>
            <td>
              <button class="btn btn-sm" :class="getLoginButtonClass(broker)" @click="handleLogin(broker)"
                :disabled="broker.isLoading">
                <span v-if="broker.isLoading">
                  <FontAwesomeIcon icon="spinner" spin />
                </span>
                <span v-else>
                  {{ getLoginButtonText(broker) }}
                </span>
              </button>
            </td>
            <td class="d-none d-sm-table-cell">
              <span :class="getStatusClass(broker.status)">{{ broker.status }}</span>
            </td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <span v-if="primaryBrokerId === broker.id" class="badge bg-primary">Primary</span>
                <button v-else class="btn btn-sm btn-outline-primary" @click="handleSetPrimary(broker)"
                  :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID" title="Set as Primary">
                  Set Primary
                </button>
              </div>
            </td>
            <td v-if="showSelect">
              <button class="btn btn-sm" :class="activeBrokers[broker.id] ? 'btn-success' : 'btn-outline-secondary'"
                @click="handleToggleActive(broker)" :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID"
                :title="activeBrokers[broker.id] ? 'Deselect Broker' : 'Select Broker'">
                <FontAwesomeIcon :icon="activeBrokers[broker.id] ? 'pause' : 'play'" class="me-1" />
                {{ activeBrokers[broker.id] ? 'Selected' : 'Select' }}
              </button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline-danger" @click="handleRemove(broker.id)" title="Delete">
                <FontAwesomeIcon icon="trash" />
              </button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Broker, BrokerEvents } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import { useBroker } from '@/modules/private/managebrokers/composables/useBroker'
import { getArchitectureDisplayName, getBrokerApiArchitecture } from '@/modules/utils/brokerUtils'

interface Props {
  brokers: Broker[]
  showClientId: Record<string, boolean>
  activeBrokers: Record<string, boolean>
  showSelect?: boolean
  selectedMultiBrokerIds?: string[]
  currentArchitecture?: string | null
  primaryBrokerId?: string
}

const props = withDefaults(defineProps<Props>(), {
  showSelect: true,
  selectedMultiBrokerIds: () => [],
  currentArchitecture: null,
  primaryBrokerId: '',
})

// Add type annotation to make TypeScript happy
const emit: BrokerEvents = defineEmits<BrokerEvents>()

// Sort brokers by API architecture for grouping
const sortedBrokers = computed(() => {
  return [...props.brokers].sort((a, b) => {
    // Sort by API architecture first
    const archA = getBrokerApiArchitecture(a)
    const archB = getBrokerApiArchitecture(b)
    const archCompare = archA.localeCompare(archB)
    if (archCompare !== 0) return archCompare
    // Then by broker type within same architecture
    const typeCompare = (a.type || '').localeCompare(b.type || '')
    if (typeCompare !== 0) return typeCompare
    // Then by name within same type
    return (a.name || '').localeCompare(b.name || '')
  })
})

// Check if broker is the first of its architecture (for group headers)
const isFirstOfArchitecture = (index: number): boolean => {
  if (index === 0) return true
  const currentArch = getBrokerApiArchitecture(sortedBrokers.value[index])
  const previousArch = getBrokerApiArchitecture(sortedBrokers.value[index - 1])
  return currentArch !== previousArch
}

// Get count of brokers by architecture
const getBrokerCountByArchitecture = (arch: string): number => {
  return props.brokers.filter(b => getBrokerApiArchitecture(b) === arch).length
}

// Check if an architecture is compatible with current selection
const isArchitectureCompatible = (arch: string): boolean => {
  if (!props.currentArchitecture || (props.selectedMultiBrokerIds || []).length === 0) return true
  return arch === props.currentArchitecture
}

// Create methods that use emit directly
const handleToggleClientId = (id: string) => {
  emit('toggleClientId', id)
}

const handleRemove = (id: string) => {
  emit('remove', id)
}

const handleLogin = (broker: Broker) => {
  emit('login', broker)
}

const handleToggleActive = (broker: Broker) => {
  emit('toggleActive', broker)
}

const { maskClientId, maskApiKey, maskApiToken, getStatusClass, getLoginButtonClass } = useBroker()

const getLoginButtonText = (broker: Broker) => {
  if (broker.isLoading) return 'Loading...'
  return 'Login'
}

// Multi-select helpers
const isBrokerSelected = (id: string) => {
  return (props.selectedMultiBrokerIds || []).includes(id)
}

const isBrokerCompatible = (broker: Broker): boolean => {
  if (!props.currentArchitecture || (props.selectedMultiBrokerIds || []).length === 0) return true
  return getBrokerApiArchitecture(broker) === props.currentArchitecture
}

const handleToggleMulti = (broker: Broker) => {
  emit('toggleMultiSelect', broker)
}

const handleSelectAllByArchitecture = (architecture: string) => {
  emit('selectAllByType', architecture)
}

const handleSetPrimary = (broker: Broker) => {
  emit('setPrimary', broker)
}

// Inline edit state
const editingBrokerId = ref<string | null>(null)
const nameInput = ref<string>('')

const startEdit = (broker: Broker) => {
  editingBrokerId.value = broker.id
  nameInput.value = broker.name || ''
}

const cancelEdit = () => {
  editingBrokerId.value = null
  nameInput.value = ''
}

const saveEdit = (broker: Broker) => {
  const newName = nameInput.value.trim()
  if (!newName) return
  emit('updateName', broker.id, newName)
  cancelEdit()
}
</script>

<style scoped>
.selected-broker {
  background-color: rgba(var(--bs-primary-rgb), 0.1);
}
</style>
