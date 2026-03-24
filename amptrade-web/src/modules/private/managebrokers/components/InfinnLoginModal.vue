<template>
  <div v-if="show" class="modal d-block" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <div class="d-flex align-items-center">
            <!-- Replace with Infinn logo when available -->
            <h5 class="modal-title mb-0">Infinn Login</h5>
          </div>
          <button type="button" class="btn-close" @click="handleClose"></button>
        </div>
        <div class="modal-body">
          <div
            v-if="localError"
            class="alert alert-danger alert-dismissible fade show"
            role="alert"
          >
            {{ localError }}
            <button type="button" class="btn-close" @click="$emit('error-dismiss')"></button>
          </div>

          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label class="form-label">Client ID</label>
              <input
                :value="broker?.clientId ? maskClientId(broker.clientId) : ''"
                type="text"
                class="form-control"
                readonly
              />
            </div>
            <div class="mb-3">
              <label class="form-label">Password</label>
              <input
                v-model="form.password"
                type="password"
                class="form-control"
                required
                :disabled="isLoading"
              />
            </div>
            <div class="mb-3">
              <label class="form-label">TOTP (Time-based One-Time Password)</label>
              <input
                v-model="form.totp"
                type="text"
                class="form-control"
                required
                pattern="[0-9]{6}"
                maxlength="6"
                :disabled="isLoading"
              />
            </div>
            <div class="d-flex gap-2">
              <button
                type="button"
                class="btn btn-outline-secondary w-25"
                @click="handleClose"
                :disabled="isLoading"
              >
                Cancel
              </button>
              <button type="submit" class="btn btn-outline w-75" :disabled="isLoading">
                <template v-if="isLoading">
                  <FontAwesomeIcon icon="spinner" spin class="me-1" />
                  Logging in...
                </template>
                <template v-else> Login </template>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Broker } from '@/modules/private/shared/types/broker'
import { useBroker } from '@/modules/private/managebrokers/composables/useBroker'

interface Props {
  show: boolean
  broker: Broker | null
  isLoading?: boolean
  error?: string | null
}

interface Emits {
  (e: 'close'): void
  (e: 'submit', password: string, totp: string): void
  (e: 'error', error: string): void
  (e: 'error-dismiss'): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const emit = defineEmits<Emits>()

const form = ref({
  password: '',
  totp: '',
})

const localError = ref<string | null>(null)

const { maskClientId } = useBroker()

const resetForm = () => {
  form.value = {
    password: '',
    totp: '',
  }
  localError.value = null
}

watch(
  () => props.show,
  (newValue) => {
    if (!newValue) {
      resetForm()
    }
  },
)

watch(
  () => props.error,
  (newError) => {
    if (newError) {
      localError.value = newError
    }
  },
)

const handleClose = () => {
  if (!props.isLoading) {
    emit('close')
  }
}

const handleSubmit = () => {
  if (!form.value.password || !form.value.totp) {
    localError.value = 'Please fill in all fields'
    return
  }

  if (!/^\d{6}$/.test(form.value.totp)) {
    localError.value = 'TOTP must be 6 digits'
    return
  }

  emit('submit', form.value.password, form.value.totp)
}
</script>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
