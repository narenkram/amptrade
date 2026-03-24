<script setup lang="ts">
import { computed } from 'vue'
import TriggerButton from '@/modules/private/shared/components/TriggerButton.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { getTriggerStatus, type UnifiedPosition } from '@/modules/private/shared/utils/triggerUtils'

const props = defineProps<{
  position: UnifiedPosition
  triggerValues: Record<string, { lastTrigger?: string }>
  stopLossEnabled: boolean
  targetEnabled: boolean
}>()

const emit = defineEmits<{
  openTriggerModal: [position: UnifiedPosition, triggerType: 'stoploss' | 'target']
  removeStopLoss: [position: UnifiedPosition]
  removeTarget: [position: UnifiedPosition]
  toggleTrailing: [position: UnifiedPosition]
  updatePositionLocal: [position: UnifiedPosition, type: string, value: number]
  incrementStopLoss: [position: UnifiedPosition]
  decrementStopLoss: [position: UnifiedPosition]
  incrementTarget: [position: UnifiedPosition]
  decrementTarget: [position: UnifiedPosition]
}>()

// Get trigger status for this position
const triggerStatus = computed(() => {
  return getTriggerStatus(props.position, props.triggerValues)
})

// Methods to emit events
const openModal = (triggerType: 'stoploss' | 'target') => {
  emit('openTriggerModal', props.position, triggerType)
}

const removeStopLoss = () => {
  emit('removeStopLoss', props.position)
}

const removeTarget = () => {
  emit('removeTarget', props.position)
}

const toggleTrailing = () => {
  emit('toggleTrailing', props.position)
}

const updateLocal = (type: string, value: number) => {
  emit('updatePositionLocal', props.position, type, value)
}

// New methods for increment/decrement
const incrementStopLoss = () => {
  emit('incrementStopLoss', props.position)
}

const decrementStopLoss = () => {
  emit('decrementStopLoss', props.position)
}

const incrementTarget = () => {
  emit('incrementTarget', props.position)
}

const decrementTarget = () => {
  emit('decrementTarget', props.position)
}
</script>

<template>
  <!-- Stop Loss Column -->
  <td>
    <template v-if="position.quantity === 0">
      <span v-if="triggerStatus === 'stopLoss'" class="badge bg-danger"> SL Hit </span>
      <span v-else>-</span>
    </template>
    <template v-else>
      <div class="d-flex align-items-center" v-if="stopLossEnabled">
        <button
          v-if="!position.stopLoss && !position.trailingStopLoss"
          class="btn btn-sm btn-outline-danger"
          @click="openModal('stoploss')"
          title="Add stoploss"
        >
          <FontAwesomeIcon icon="plus" />
        </button>
        <template v-else>
          <!-- Decrement button -->
          <button
            class="btn btn-sm btn-outline-secondary me-1"
            @click="decrementStopLoss"
            title="Decrease stoploss"
          >
            <FontAwesomeIcon icon="minus" />
          </button>

          <TriggerButton
            class="btn btn-sm"
            :value="position.stopLoss || position.trailingStopLoss || null"
            type="stoploss"
            :btnClass="position.stopLoss ? 'btn-danger' : 'btn-outline-danger'"
            @click="openModal('stoploss')"
            @update="(newVal: number) => updateLocal('stoploss', newVal)"
          />

          <!-- Increment button -->
          <button
            class="btn btn-sm btn-outline-secondary ms-1"
            @click="incrementStopLoss"
            title="Increase stoploss"
          >
            <FontAwesomeIcon icon="plus" />
          </button>

          <button
            class="btn btn-sm ms-1 btn-outline-secondary"
            @click="removeStopLoss"
            title="Remove stoploss"
          >
            <FontAwesomeIcon icon="xmark" />
          </button>
        </template>
        <button
          class="btn btn-sm ms-1"
          :class="position.trailingStopLoss === null ? 'btn-outline' : 'btn-secondary'"
          @click="toggleTrailing"
        >
          {{ position.trailingStopLoss === null ? 'T' : 'S' }}
        </button>
      </div>
      <span v-else>-</span>
    </template>
  </td>

  <!-- Target Column -->
  <td>
    <template v-if="position.quantity === 0">
      <span v-if="triggerStatus === 'target'" class="badge bg-success"> TG Hit </span>
      <span v-else>-</span>
    </template>
    <template v-else>
      <div class="d-flex align-items-center" v-if="targetEnabled">
        <button
          v-if="!position.target"
          class="btn btn-sm btn-outline-success"
          @click="openModal('target')"
          title="Add target"
        >
          <FontAwesomeIcon icon="plus" />
        </button>
        <template v-else>
          <!-- Decrement button -->
          <button
            class="btn btn-sm btn-outline-secondary me-1"
            @click="decrementTarget"
            title="Decrease target"
          >
            <FontAwesomeIcon icon="minus" />
          </button>

          <TriggerButton
            class="btn btn-sm"
            :value="position.target"
            type="target"
            :btnClass="position.target ? 'btn-success' : 'btn-outline-success'"
            @click="openModal('target')"
            @update="(newVal: number) => updateLocal('target', newVal)"
          />

          <!-- Increment button -->
          <button
            class="btn btn-sm btn-outline-secondary ms-1"
            @click="incrementTarget"
            title="Increase target"
          >
            <FontAwesomeIcon icon="plus" />
          </button>

          <button
            class="btn btn-sm ms-1 btn-outline-secondary"
            @click="removeTarget"
            title="Remove target"
          >
            <FontAwesomeIcon icon="xmark" />
          </button>
        </template>
      </div>
      <span v-else>-</span>
    </template>
  </td>
</template>

<style scoped>
.position-trigger-column {
  display: inline-block;
}
</style>
