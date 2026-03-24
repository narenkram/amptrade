<template>
  <div v-if="show" class="modal d-block" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Add New Broker</h5>
          <button type="button" class="btn-close" @click="handleClose"></button>
        </div>
        <div class="modal-body">
          <!-- Add error alert -->
          <div v-if="error" class="alert alert-danger alert-dismissible fade show" role="alert">
            {{ error }}
            <button type="button" class="btn-close" @click="error = null"></button>
          </div>

          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label class="form-label">Broker Type</label>
              <select v-model="form.type" class="form-select" required>
                <option value="Shoonya">Shoonya</option>
                <option value="Flattrade">Flattrade</option>
                <option value="Zebu">Zebu</option>
                <option value="Tradesmart">Tradesmart</option>
                <option value="Infinn">Infinn</option>
                <option value="Zerodha">Zerodha</option>
                <option value="Upstox">Upstox</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Account Name</label>
              <input v-model="form.accountName" type="text" class="form-control" required />
            </div>
            <div class="mb-3">
              <div class="input-group mt-2 d-flex">
                <label for="brokerDashboardUrl" class="form-label">
                  Get your API credentials from:
                </label>
                <a :href="getBrokerDashboardUrl" target="_blank" rel="noopener noreferrer"
                  class="text-decoration-none input-group">
                  <span class="input-group-text text-danger flex-grow-1">
                    {{ getBrokerDashboardUrl }}
                  </span>
                  <button type="button" class="btn btn-sm btn-outline">
                    <FontAwesomeIcon icon="external-link-alt" />
                  </button>
                </a>
              </div>
              <div class="form-text mt-3">
                <label for="redirectUrl" class="form-label">
                  If your broker requires a Redirect URL, use:
                </label>
                <div class="input-group">
                  <code class="form-control rounded text-danger">
                    {{ getRedirectUrl }}
                  </code>
                  <button type="button" class="btn btn-sm btn-outline" @click="handleCopy(getRedirectUrl)"
                    title="Copy Redirect URL">
                    <FontAwesomeIcon icon="copy" />
                  </button>
                </div>
                <div v-if="copyMessage" class="text-success small mt-1">
                  {{ copyMessage }}
                </div>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Client ID</label>
              <input v-model="form.clientId" type="text" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label">API Key</label>
              <input v-model="form.apiKey" type="text" class="form-control" required />
            </div>
            <div v-if="form.type === 'Flattrade' || form.type === 'Zerodha' || form.type === 'Upstox'" class="mb-3">
              <label class="form-label">API Secret</label>
              <input v-model="form.apiSecret" type="text" class="form-control" required />
            </div>
            <div class="text-end">
              <button type="button" class="btn btn-outline-secondary me-2" @click="handleClose">
                Cancel
              </button>
              <button type="submit" class="btn btn-outline" :disabled="isLoading">
                {{ isLoading ? 'Adding...' : 'Add Broker' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

import type { NewBrokerForm, BrokerType } from '@/modules/private/shared/types/broker'
import { BROKER_CONSTANTS } from '@/modules/private/shared/types/broker'
import { validateBrokerForm } from '@/modules/private/shared/types/broker'
import { useClipboard } from '@/modules/private/shared/composables/useClipboard'

interface Props {
  show: boolean
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'submit', form: NewBrokerForm): void
  (e: 'copy', text: string): void
}

const { show, isLoading } = defineProps<Props>()
const emit = defineEmits<Emits>()

const error = ref<string | null>(null)
const { copyMessage, copyToClipboard } = useClipboard()

const form = ref<NewBrokerForm>({
  type: 'Zebu',
  clientId: '',
  apiKey: '',
  apiSecret: '',
  accountName: '',
})

const getBrokerDashboardUrl = computed(() => {
  return BROKER_CONSTANTS.DASHBOARD_URLS[
    form.value.type as keyof typeof BROKER_CONSTANTS.DASHBOARD_URLS
  ]
})

const getRedirectUrl = computed(() => {
  return BROKER_CONSTANTS.REDIRECT_URLS[
    form.value.type as keyof typeof BROKER_CONSTANTS.REDIRECT_URLS
  ]
})

const resetForm = () => {
  const defaultTypes: BrokerType[] = ['Shoonya', 'Zebu', 'Tradesmart', 'Zerodha', 'Infinn', 'Upstox']
  const randomType = defaultTypes[Math.floor(Math.random() * defaultTypes.length)]

  form.value = {
    type: randomType,
    clientId: '',
    apiKey: '',
    apiSecret: '',
    accountName: '',
  }
  error.value = null
}

const handleClose = () => {
  resetForm()
  emit('close')
}

const handleCopy = async (text: string) => {
  const result = await copyToClipboard(text)
  if (result.success) {
    emit('copy', text)
  }
}

const handleSubmit = async () => {
  try {
    error.value = null

    const validationErrors = validateBrokerForm(form.value)

    if (validationErrors.length > 0) {
      error.value = validationErrors[0].message
      return
    }

    emit('submit', form.value)
    resetForm()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add broker'
    console.error('Failed to add broker:', e)
  }
}
</script>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
