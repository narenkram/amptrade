<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TradeActionPayload } from '@/modules/private/shared/types/trade'
import { useLtp } from '@/modules/private/shared/composables/useLtp'
import { useMouseScroll } from '@/modules/private/shared/composables/useMouseScroll'

const props = withDefaults(
  defineProps<{
    show: boolean
    orderDetails?: TradeActionPayload | null
  }>(),
  {
    orderDetails: null,
  },
)

const emit = defineEmits<{
  close: []
  confirm: [price: number, quantity: number]
}>()

const price = ref<number>(props.orderDetails?.price || 0)
const quantityMultiplier = ref<number>(props.orderDetails?.rawQuantity ?? 1)

// Use the LTP composable with reactive instrumentType
const { getCurrentLtp } = useLtp(computed(() => props.orderDetails?.instrumentType))

// Compute current LTP using the composable
const currentLtp = computed(() => getCurrentLtp())

// Compute total quantity based on multiplier and lot size
const totalQuantity = computed(() => {
  if (!props.orderDetails) return 0
  const isEquitySegment = props.orderDetails.segment === 'Stocks Equity'
  return isEquitySegment
    ? quantityMultiplier.value
    : quantityMultiplier.value * (props.orderDetails.lotSize ?? 1)
})

// Add mouse scroll for quantity multiplier
useMouseScroll({
  targetSelector: '#limitQuantity',
  currentValue: quantityMultiplier,
  isNumber: true,
  min: 1,
  step: 1,
  values: [], // Not needed for number inputs
})

// Fix the mouse scroll configuration for limit price
useMouseScroll({
  targetSelector: '#limitPrice',
  currentValue: price,
  isNumber: true,
  min: 1,
  step: 1,
  values: [],
})

const handleClose = () => {
  price.value = 0
  quantityMultiplier.value = 1
  emit('close')
}

const handleConfirm = () => {
  if (price.value !== 0) {
    emit('confirm', price.value, totalQuantity.value)
    handleClose()
  }
}

// Add computed for displaying instrument details
const instrumentDetails = computed(() => {
  if (!props.orderDetails) return ''

  const { tradingSymbol, instrumentType } = props.orderDetails
  return `${tradingSymbol} ${instrumentType || ''}`
})

// Add this watch function to set initial price
watch(
  () => props.orderDetails,
  (newOrderDetails) => {
    if (newOrderDetails) {
      price.value = Math.max(1, currentLtp.value || 1)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="show" class="modal fade show d-block" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div
          class="modal-header text-white"
          :class="orderDetails?.action === 'BUY' ? 'bg-success' : 'bg-danger'"
        >
          <h5 class="modal-title">{{ orderDetails?.action }} Limit Order</h5>
          <button type="button" class="btn-close" @click="handleClose"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <h5>{{ instrumentDetails }}</h5>
          </div>
          <div class="mb-3">
            <label class="form-label h5">
              LTP:
              <span class="badge bg-primary">
                {{ currentLtp ?? 'Loading...' }}
              </span>
            </label>
          </div>
          <div class="mb-3">
            <label for="limitPrice" class="form-label">Limit Price</label>
            <input
              type="number"
              class="form-control"
              id="limitPrice"
              v-model="price"
              step="1"
              :min="1"
            />
          </div>
          <div class="mb-3">
            <label class="form-label">
              {{ orderDetails?.segment === 'Stocks Equity' ? 'Quantity' : 'Lot / Quantity' }}
            </label>
            <div class="input-group">
              <input
                id="limitQuantity"
                type="number"
                class="form-control"
                v-model="quantityMultiplier"
                min="1"
                step="1"
              />
              <span class="input-group-text" v-if="orderDetails?.segment !== 'Stocks Equity'">
                {{ totalQuantity }}
              </span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="handleClose">Cancel</button>
          <button
            type="button"
            class="btn"
            :class="orderDetails?.action === 'BUY' ? 'btn-success' : 'btn-danger'"
            @click="handleConfirm"
            :disabled="price === 0"
          >
            Confirm {{ orderDetails?.action || '' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="show" class="modal-backdrop fade show"></div>
</template>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
