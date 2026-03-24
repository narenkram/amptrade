<template>
  <button :class="btnClass" @click="$emit('click')" :id="uniqueId">
    {{ formattedValue }}
  </button>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMouseScroll } from '@/modules/private/shared/composables/useMouseScroll'

interface Props {
  value: number | null
  type: 'stoploss' | 'target'
  btnClass?: string
  step?: number
  min?: number
  max?: number
}

const props = defineProps<Props>()
const emit = defineEmits(['update', 'click'])

// Initialize localValue (if null, default to 0)
const localValue = ref<number>(props.value !== null ? props.value : 0)

// Keep the local value in sync if the parent updates the value.
watch(
  () => props.value,
  (newVal) => {
    if (newVal !== null) {
      localValue.value = newVal
    }
  },
)

// Generate a unique id for this button so we can target it with useMouseScroll.
const uniqueId = `trigger-btn-${Math.random().toString(36).substr(2, 9)}`

// Use mouse scroll on this button – when the user scrolls the value is updated.
// (Pass isNumber: true and a step (defaulted to 0.05) so that on scrolling the value is added/subtracted.)
useMouseScroll<number>({
  targetSelector: `#${uniqueId}`,
  currentValue: localValue,
  values: [], // not needed for number adjustments
  isNumber: true,
  min: props.min ?? 0,
  max: props.max,
  step: props.step ?? 0.05,
  onChange: (newVal) => {
    emit('update', newVal)
  },
})

const formattedValue = computed(() => {
  return localValue.value.toFixed(2)
})

const btnClass = computed(() => {
  return props.btnClass ? props.btnClass : 'btn btn-sm'
})
</script>
