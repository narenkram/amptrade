<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  isOpen: boolean
  mtm: number
  highestMtm: number
  mtmTarget: number
  mtmStoploss: number
  trailingEnabled: boolean
  trailingStep: number
  triggerType: 'stoploss' | 'target'
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  save: [type: string, value: number, trailingStep?: number]
}>()

// Local reactive variables
const localMtmStoploss = ref<number>(0)
const localMtmTarget = ref<number>(0)
const localTrailingStep = ref<number>(1)

// Initialize values when modal opens
watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      if (props.triggerType === 'stoploss') {
        localMtmStoploss.value = props.mtmStoploss || -500
        localTrailingStep.value = props.trailingStep || 1
      } else if (props.triggerType === 'target') {
        localMtmTarget.value = props.mtmTarget || 1000
      }
    }
  },
  { immediate: true },
)

// Watch for prop changes to update local values
watch(
  () => props.mtmStoploss,
  (newValue) => {
    if (props.isOpen && props.triggerType === 'stoploss') {
      localMtmStoploss.value = newValue
    }
  },
)

watch(
  () => props.mtmTarget,
  (newValue) => {
    if (props.isOpen && props.triggerType === 'target') {
      localMtmTarget.value = newValue
    }
  },
)

watch(
  () => props.trailingStep,
  (newValue) => {
    if (props.isOpen && props.triggerType === 'stoploss') {
      localTrailingStep.value = newValue
    }
  },
)

const handleClose = () => {
  emit('update:isOpen', false)
}

const handleSave = () => {
  if (props.triggerType === 'stoploss') {
    emit('save', 'stoploss', localMtmStoploss.value, localTrailingStep.value)
  } else if (props.triggerType === 'target') {
    emit('save', 'target', localMtmTarget.value)
  }
  handleClose()
}

// Validate input based on trigger type - removed zero value restriction
const isValidInput = computed(() => {
  if (props.triggerType === 'stoploss') {
    return typeof localMtmStoploss.value === 'number'
  } else if (props.triggerType === 'target') {
    return typeof localMtmTarget.value === 'number'
  }
  return false
})

const modalTitle = computed(() => {
  return props.triggerType === 'stoploss' ? 'Set MTM Stop Loss' : 'Set MTM Target'
})
</script>

<template>
  <div v-if="isOpen" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ modalTitle }}</h5>
          <button type="button" class="btn-close" @click="handleClose"></button>
        </div>
        <div class="modal-body">
          <!-- Current MTM value -->
          <div class="mb-3">
            <label class="form-label h5">
              Current MTM:
              <span
                class="badge"
                :class="{
                  'bg-success': mtm > 0,
                  'bg-danger': mtm < 0,
                  'bg-secondary': mtm === 0,
                }"
              >
                {{ mtm.toFixed(0) }}
              </span>
            </label>
          </div>

          <!-- Conditionally show Stop Loss section -->
          <template v-if="triggerType === 'stoploss'">
            <div class="mb-3">
              <label for="mtmStoploss" class="form-label"
                >MTM Stop Loss
                <code class="text-danger"> [use minus (-) for negative value] </code>
              </label>
              <input
                type="number"
                class="form-control"
                id="mtmStoploss"
                v-model.number="localMtmStoploss"
                step="100"
              />
              <small class="text-muted">
                When MTM falls below this value, all positions will be closed
              </small>
            </div>

            <!-- Trailing settings -->
            <div class="form-group mb-3" v-if="trailingEnabled">
              <label class="form-label">
                Trailing Distance = MTM StopLoss (initial) × Multiplier
                <small class="text-muted d-block"
                  >Current highest MTM: {{ highestMtm.toFixed(0) }}</small
                >
              </label>
              <input
                type="number"
                class="form-control"
                placeholder="Trailing gap multiplier"
                v-model.number="localTrailingStep"
                min="0.1"
                step="0.1"
              />
            </div>
          </template>

          <!-- Conditionally show Target section -->
          <template v-else-if="triggerType === 'target'">
            <div class="mb-3">
              <label for="mtmTarget" class="form-label">MTM Target</label>
              <input
                type="number"
                class="form-control"
                id="mtmTarget"
                v-model.number="localMtmTarget"
                step="100"
              />
              <small class="text-muted">
                When MTM reaches this value, all positions will be closed
              </small>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="handleClose">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            @click="handleSave"
            :disabled="!isValidInput"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="isOpen" class="modal-backdrop fade show"></div>
</template>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
