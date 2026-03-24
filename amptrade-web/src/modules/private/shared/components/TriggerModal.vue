<script setup lang="ts">
import { ref, computed, watch } from 'vue'
// Remove unused Position import
// import type { Position } from '@/modules/private/shared/types/trade'

// Create a generic position type that works with Position
interface GenericPosition {
  symbol?: string
  tradingSymbol?: string
  quantity: number
  lastTradedPrice?: number
  lastPrice?: number
  buyAverage?: number
  sellAverage?: number
  averagePrice?: number
  stopLoss?: number | null
  trailingStopLoss?: number | null
  target?: number | null
  exchange: string
  token: string
  // Use Record instead of any
  [key: string]: unknown
}

const props = defineProps<{
  isOpen: boolean
  position: GenericPosition | null
  defaultStopLoss: number
  defaultTarget: number
  triggerType: 'stoploss' | 'target'
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  save: [type: string, value: number | null]
}>()

// Local reactive variables for stop loss and target
const stopLossValue = ref<number | null>(null)
const targetValue = ref<number | null>(null)
// Flag for trailing mode status
const isTrailingMode = ref<boolean>(false)

// Initialize relevant values when modal opens
watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue && props.position) {
      // Use either lastTradedPrice or lastPrice depending on what's available
      const ltp = props.position.lastTradedPrice || props.position.lastPrice
      if (!ltp) return

      const isLong = props.position.quantity > 0

      if (props.triggerType === 'stoploss') {
        isTrailingMode.value =
          props.position.trailingStopLoss !== null && props.position.trailingStopLoss !== undefined
        if (isTrailingMode.value) {
          stopLossValue.value = props.position.trailingStopLoss as number
        } else if (props.position.stopLoss !== null && props.position.stopLoss !== undefined) {
          stopLossValue.value = props.position.stopLoss
        } else {
          stopLossValue.value = isLong ? ltp - props.defaultStopLoss : ltp + props.defaultStopLoss
        }
      } else if (props.triggerType === 'target') {
        if (props.position.target !== null && props.position.target !== undefined) {
          targetValue.value = props.position.target
        } else {
          targetValue.value = isLong ? ltp + props.defaultTarget : ltp - props.defaultTarget
        }
      }
    }
  },
)

const currentLtp = computed(() => {
  if (!props.position) return null

  // First try position's lastTradedPrice or lastPrice
  const positionLtp = props.position.lastTradedPrice || props.position.lastPrice
  if (positionLtp) return positionLtp

    // If no direct LTP, try to get from window LTP values (updated by WebSocket)
  // This works for all broker types including Zerodha and NorenAPI brokers
  if (props.position.token) {
    // Access window.ltpValues which is populated by WebSocket handlers
    const windowLtpValues = (window as Window & { ltpValues?: Record<string, number> }).ltpValues
    if (windowLtpValues && typeof windowLtpValues === 'object') {
      // Check for LTP in various formats

      // First try the standard exchange|token format
      const exchangeTokenKey = `${props.position.exchange}|${props.position.token}`
      const exchangeTokenLtp = windowLtpValues[exchangeTokenKey]
      if (exchangeTokenLtp !== undefined) {
        console.log(`Found LTP for ${props.position.symbol} using exchange|token: ${exchangeTokenLtp}`);
        return exchangeTokenLtp;
      }

      // Then try token-only for Zerodha
      const tokenKey = props.position.token
      const tokenOnlyLtp = windowLtpValues[tokenKey]
      if (tokenOnlyLtp !== undefined) {
        console.log(`Found LTP for ${props.position.symbol} using token-only: ${tokenOnlyLtp}`);
        return tokenOnlyLtp;
      }

      // Log if no LTP was found
      console.log(`No LTP found for ${props.position.symbol} (exchange: ${props.position.exchange}, token: ${props.position.token})`);
      console.log('Available LTP keys:', Object.keys(windowLtpValues).join(', '));

      return null;
    }
  }

  return null
})

const entryPrice = computed(() => {
  if (!props.position) return null
  if (props.position.quantity > 0) {
    return props.position.buyAverage || props.position.averagePrice
  }
  return props.position.sellAverage || props.position.averagePrice
})

const handleClose = () => {
  stopLossValue.value = null
  targetValue.value = null
  emit('update:isOpen', false)
}

// Toggle the trailing mode and recalc the default stoploss on toggle.
const toggleTrailing = () => {
  isTrailingMode.value = !isTrailingMode.value
  if (props.position) {
    const ltp = props.position.lastTradedPrice || props.position.lastPrice
    if (!ltp) return
    const isLong = props.position.quantity > 0
    stopLossValue.value = isLong ? ltp - props.defaultStopLoss : ltp + props.defaultStopLoss
  }
}

const handleSave = () => {
  if (props.triggerType === 'stoploss') {
    if (isTrailingMode.value) {
      emit('save', 'trailingStopLoss', stopLossValue.value)
    } else {
      emit('save', 'stopLoss', stopLossValue.value)
    }
  } else if (props.triggerType === 'target') {
    emit('save', 'target', targetValue.value)
  }
  handleClose()
}

// Validate only the input for the active field.
const isValidInput = computed(() => {
  if (!props.position || !entryPrice.value || !currentLtp.value) return false
  const isLong = props.position.quantity > 0
  if (props.triggerType === 'stoploss') {
    if (stopLossValue.value === null) return false
    if (stopLossValue.value <= 0) return false
    if (isLong && stopLossValue.value >= currentLtp.value) return false
    if (!isLong && stopLossValue.value <= currentLtp.value) return false
  } else if (props.triggerType === 'target') {
    if (targetValue.value === null) return false
    if (targetValue.value <= 0) return false
    if (isLong && targetValue.value <= currentLtp.value) return false
    if (!isLong && targetValue.value >= currentLtp.value) return false
  }
  return true
})
</script>

<template>
  <div v-if="isOpen" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            Set {{ props.triggerType === 'stoploss' ? 'Stop Loss' : 'Target' }}
          </h5>
          <button type="button" class="btn-close" @click="handleClose"></button>
        </div>
        <div class="modal-body">
          <!-- Symbol and LTP are displayed in both cases -->
          <div class="mb-3">
            <h5>{{ props.position?.symbol || props.position?.tradingSymbol }}</h5>
          </div>
          <div class="mb-3">
            <label class="form-label h5">
              LTP:
              <span class="badge bg-primary">{{ currentLtp ?? 'Loading...' }}</span>
            </label>
          </div>
          <!-- Conditionally show Stop Loss section -->
          <template v-if="props.triggerType === 'stoploss'">
            <div class="mb-3">
              <label for="stoploss" class="form-label">Stop Loss (₹)</label>
              <div class="input-group">
                <input
                  type="number"
                  class="form-control"
                  id="stoploss"
                  :value="stopLossValue"
                  @input="
                    (e: Event) => (stopLossValue = Number((e.target as HTMLInputElement).value))
                  "
                  step="0.05"
                  min="0"
                />
                <button class="btn btn-outline-secondary" type="button" @click="toggleTrailing">
                  {{ isTrailingMode ? 'S' : 'T' }}
                </button>
              </div>
              <small class="text-muted">
                {{
                  (props.position?.quantity ?? 0) > 0
                    ? `Must be below current LTP (${currentLtp ?? 'Loading...'})`
                    : `Must be above current LTP (${currentLtp ?? 'Loading...'})`
                }}
              </small>
            </div>
          </template>
          <!-- Conditionally show Target section -->
          <template v-else-if="props.triggerType === 'target'">
            <div class="mb-3">
              <label for="target" class="form-label">Target (₹)</label>
              <input
                type="number"
                class="form-control"
                id="target"
                :value="targetValue"
                @input="(e: Event) => (targetValue = Number((e.target as HTMLInputElement).value))"
                step="0.05"
                min="0"
              />

              <small class="text-muted">
                {{
                  (props.position?.quantity ?? 0) > 0
                    ? `Must be above current LTP (${currentLtp ?? 'Loading...'})`
                    : `Must be below current LTP (${currentLtp ?? 'Loading...'})`
                }}
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
