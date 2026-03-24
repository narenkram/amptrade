<template>
  <div v-if="isOpen" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            Set Increment/Decrement Multiplier
          </h5>
          <button
            type="button"
            class="btn-close"
            @click="handleClose"
          ></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="multiplierInput" class="form-label">Multiplier Value (₹)</label>
            <input
              type="number"
              class="form-control"
              id="multiplierInput"
              v-model="multiplierValue"
              min="1"
              step="1"
            />
            <div class="form-text">
              This value will be used for incrementing/decrementing {{ triggerTypeLabel }} values.
            </div>
          </div>
          
          <div class="d-flex justify-content-between mt-4">
            <div class="btn-group" role="group">
              <button 
                v-for="preset in presetValues" 
                :key="preset"
                type="button" 
                class="btn" 
                :class="multiplierValue === preset ? 'btn-primary' : 'btn-outline-primary'"
                @click="multiplierValue = preset"
              >
                ₹{{ preset }}
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div class="d-flex flex-row justify-content-between w-100">
            <button
              type="button"
              class="btn btn-sm fs-6 btn-outline-secondary w-50 me-1"
              @click="handleClose"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-sm fs-6 btn-primary w-50 ms-1"
              @click="saveMultiplier"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="isOpen" class="modal-backdrop fade show"></div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  isOpen: boolean
  triggerType: 'stoploss' | 'target'
  currentMultiplier: number
}>()

const emit = defineEmits(['update:isOpen', 'save'])

// Preset values for quick selection
const presetValues = [10, 50, 100, 500, 1000]

// Local state
const multiplierValue = ref(props.currentMultiplier || 100)

// Computed property for label text
const triggerTypeLabel = computed(() => {
  return props.triggerType === 'stoploss' ? 'stop-loss' : 'target'
})

// Watch for changes to isOpen prop
watch(() => props.isOpen, (newValue) => {
  if (newValue) {
    // Reset multiplier value when modal opens
    multiplierValue.value = props.currentMultiplier || 100
  }
})

// Watch for changes to currentMultiplier prop
watch(() => props.currentMultiplier, (newValue) => {
  if (props.isOpen) {
    multiplierValue.value = newValue
  }
})

// Handle close
const handleClose = () => {
  emit('update:isOpen', false)
}

// Save multiplier value
const saveMultiplier = () => {
  emit('save', props.triggerType, Number(multiplierValue.value))
  handleClose()
}
</script>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>