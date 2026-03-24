<template>
  <div class="card mb-3 broker-card" :class="{ 'border-success': activeBrokers[broker.id] }">
    <div class="card-header bg-color-2 d-flex justify-content-between align-items-center py-3">
      <div class="d-flex align-items-center gap-2">
        <h5 class="card-title mb-0 fw-bold" v-if="!isEditing">{{ broker.name }}</h5>
        <div v-else class="input-group input-group-sm" style="max-width: 260px">
          <input type="text" class="form-control" v-model="nameInput" :placeholder="broker.type" />
          <button class="btn btn-outline-secondary" type="button" @click="cancelEdit">Cancel</button>
          <button class="btn btn-outline-primary" type="button" @click="saveEdit">Save</button>
        </div>
        <button
          v-if="!isEditing"
          class="btn btn-sm btn-outline-secondary"
          type="button"
          @click="startEdit"
          title="Edit Account Name"
        >
          Edit
        </button>
        <span v-if="primaryBrokerId === broker.id" class="badge bg-primary">Primary</span>
      </div>
      <span :class="getStatusClass(broker.status)">{{ broker.status }}</span>
    </div>

    <div class="card-body bg-color">
      <div class="row g-3">
        <!-- Left Column -->
        <div class="col-6">
          <div class="info-row">
            <div class="info-label">Client ID</div>
            <div class="info-value">
              <div class="d-flex align-items-center gap-2">
                <span class="text-truncate">
                  {{ isClientIdVisible ? broker.clientId : maskClientId(broker.clientId) }}
                </span>
                <button
                  class="btn btn-icon btn-link"
                  @click="handleToggleClientId(broker.id)"
                  :title="isClientIdVisible ? 'Hide Client ID' : 'Show Client ID'"
                >
                  <FontAwesomeIcon :icon="isClientIdVisible ? 'eye-slash' : 'eye'" />
                </button>
              </div>
            </div>
          </div>

          <div class="info-row mt-3">
            <div class="info-label">API Key</div>
            <div class="info-value">
              <div class="d-flex align-items-center gap-2">
                <span class="text-truncate">{{ maskApiKey(broker.apiKey) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="col-6">
          <div class="info-row">
            <div class="info-label">API Token</div>
            <div class="info-value">
              <div class="d-flex align-items-center gap-2">
                <span class="text-truncate">{{ maskApiToken(broker.apiToken) }}</span>
              </div>
            </div>
          </div>

          <div class="info-row mt-3">
            <div class="info-label">Validity</div>
            <div class="info-value">{{ BROKER_CONSTANTS.TOKEN_VALIDITY }}</div>
          </div>
        </div>
      </div>

      <!-- Action Buttons - Full Width -->
      <div class="d-flex justify-content-between align-items-center mt-4">
        <div class="d-flex gap-1">
          <button
            v-if="showSelect"
            class="btn btn-sm"
            :class="activeBrokers[broker.id] ? 'btn-success' : 'btn-secondary'"
            :title="activeBrokers[broker.id] ? 'Deselect Broker' : 'Select Broker'"
            @click="handleToggleActive(broker)"
            :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID"
          >
            <FontAwesomeIcon :icon="activeBrokers[broker.id] ? 'pause' : 'play'" class="me-1" />
            {{ activeBrokers[broker.id] ? 'Selected' : 'Select' }}
          </button>
          <button class="btn btn-sm btn-outline-danger ms-2" @click="handleRemove(broker.id)">
            <FontAwesomeIcon icon="trash" class="me-1" />
            Remove
          </button>
          <button
            v-if="primaryBrokerId !== broker.id"
            class="btn btn-sm btn-outline-primary ms-2"
            @click="handleSetPrimary(broker)"
            :disabled="broker.status !== BROKER_CONSTANTS.STATUS.VALID"
            title="Set as Primary"
          >
            <FontAwesomeIcon icon="star" class="me-1" />
            Set Primary
          </button>
        </div>
        <button
          class="btn btn-sm"
          :class="getLoginButtonClass(broker)"
          @click="handleLogin(broker)"
          :disabled="broker.isLoading"
        >
          <span v-if="broker.isLoading">
            <FontAwesomeIcon icon="spinner" spin class="me-1" />
            Loading...
          </span>
          <span v-else>
            <FontAwesomeIcon icon="sign-in-alt" class="me-1" />
            {{ getLoginButtonText }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Broker, CopyMessages, BrokerEvents } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import { useBroker } from '@/modules/private/managebrokers/composables/useBroker'

interface Props {
  broker: Broker
  isClientIdVisible: boolean
  activeBrokers: Record<string, boolean>
  copyMessages?: CopyMessages
  showSelect?: boolean
  primaryBrokerId?: string
}

const props = withDefaults(defineProps<Props>(), {
  isClientIdVisible: false,
  showSelect: true,
  primaryBrokerId: '',
})

const emit: BrokerEvents = defineEmits<BrokerEvents>()

const { maskClientId, maskApiKey, maskApiToken, getStatusClass, getLoginButtonClass } = useBroker()

const getLoginButtonText = computed(() => (props.broker.isLoading ? 'Loading...' : 'Login'))

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

const handleSetPrimary = (broker: Broker) => {
  emit('setPrimary', broker)
}

// Inline edit name state and handlers
const isEditing = ref(false)
const nameInput = ref('')
const startEdit = () => {
  isEditing.value = true
  nameInput.value = props.broker.name || ''
}
const cancelEdit = () => {
  isEditing.value = false
  nameInput.value = ''
}
const saveEdit = () => {
  const newName = nameInput.value.trim()
  if (!newName) return
  emit('updateName', props.broker.id, newName)
  cancelEdit()
}
</script>
