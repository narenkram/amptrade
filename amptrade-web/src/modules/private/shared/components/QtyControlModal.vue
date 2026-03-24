<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface GenericPosition {
    symbol?: string
    tradingSymbol?: string
    quantity: number
    lastTradedPrice?: number
    lastPrice?: number
    lotSize?: number
    exchange: string
    token: string
    productType?: string
    instrumentName?: string
    broker?: { id: string; name?: string }
    [key: string]: unknown
}

const props = defineProps<{
    isOpen: boolean
    position: GenericPosition | null
}>()

const emit = defineEmits<{
    'update:isOpen': [value: boolean]
    add: [lots: number]
    remove: [lots: number]
}>()

// Local state
const lotsToChange = ref<number>(1)
const isProcessing = ref<boolean>(false)

// Reset lots when modal opens
watch(
    () => props.isOpen,
    (newValue) => {
        if (newValue) {
            lotsToChange.value = 1
            isProcessing.value = false
        }
    },
)

const currentLtp = computed(() => {
    if (!props.position) return null
    const positionLtp = props.position.lastTradedPrice || props.position.lastPrice
    if (positionLtp) return positionLtp

    // Try to get from window LTP values
    if (props.position.token) {
        const windowLtpValues = (window as Window & { ltpValues?: Record<string, number> }).ltpValues
        if (windowLtpValues && typeof windowLtpValues === 'object') {
            const exchangeTokenKey = `${props.position.exchange}|${props.position.token}`
            const exchangeTokenLtp = windowLtpValues[exchangeTokenKey]
            if (exchangeTokenLtp !== undefined) return exchangeTokenLtp

            const tokenOnlyLtp = windowLtpValues[props.position.token]
            if (tokenOnlyLtp !== undefined) return tokenOnlyLtp
        }
    }
    return null
})

const lotSize = computed(() => props.position?.lotSize || 1)

const currentLots = computed(() => {
    if (!props.position) return 0
    return Math.abs(props.position.quantity) / lotSize.value
})

const isLong = computed(() => (props.position?.quantity || 0) > 0)

const maxRemovableLots = computed(() => {
    // Can remove all but 1 lot (use exit for full close)
    return Math.max(0, currentLots.value - 1)
})

const canAdd = computed(() => lotsToChange.value > 0 && !isProcessing.value)

const canRemove = computed(() => {
    return lotsToChange.value > 0 && lotsToChange.value <= maxRemovableLots.value && !isProcessing.value
})

const handleClose = () => {
    emit('update:isOpen', false)
}

const handleAdd = async () => {
    if (!canAdd.value) return
    isProcessing.value = true
    emit('add', lotsToChange.value)
}

const handleRemove = async () => {
    if (!canRemove.value) return
    isProcessing.value = true
    emit('remove', lotsToChange.value)
}
</script>

<template>
    <div v-if="isOpen" class="modal fade show d-block" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Quantity Control</h5>
                    <button type="button" class="btn-close" @click="handleClose"></button>
                </div>
                <div class="modal-body">
                    <!-- Symbol -->
                    <div class="mb-3">
                        <h5>{{ props.position?.symbol || props.position?.tradingSymbol }}</h5>
                    </div>

                    <!-- LTP -->
                    <div class="mb-3">
                        <label class="form-label h5">
                            LTP:
                            <span class="badge bg-primary">{{ currentLtp ?? 'Loading...' }}</span>
                        </label>
                    </div>

                    <!-- Current Position -->
                    <div class="mb-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="text-muted">Current Position:</span>
                            <span class="fw-bold" :class="{ 'text-success': isLong, 'text-danger': !isLong }">
                                {{ position?.quantity }} ({{ currentLots }} lots)
                            </span>
                            <span class="badge" :class="isLong ? 'bg-success' : 'bg-danger'">
                                {{ isLong ? 'LONG' : 'SHORT' }}
                            </span>
                        </div>
                    </div>

                    <!-- Lot Size Info -->
                    <div class="mb-3">
                        <small class="text-muted">Lot Size: {{ lotSize }}</small>
                    </div>

                    <!-- Lots to Change -->
                    <div class="mb-3">
                        <label for="lotsInput" class="form-label">Number of Lots</label>
                        <input type="number" class="form-control" id="lotsInput" v-model.number="lotsToChange" :min="1"
                            :max="maxRemovableLots || 100" step="1" :disabled="isProcessing" />
                        <small v-if="maxRemovableLots > 0" class="text-muted">
                            Max removable: {{ maxRemovableLots }} lots (use Exit for full close)
                        </small>
                        <small v-else class="text-muted">
                            Only 1 lot remaining - use Exit buttons to close position
                        </small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="handleClose" :disabled="isProcessing">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-danger" @click="handleRemove" :disabled="!canRemove">
                        <span v-if="isProcessing" class="spinner-border spinner-border-sm me-1"></span>
                        Remove {{ lotsToChange }} Lot{{ lotsToChange > 1 ? 's' : '' }}
                    </button>
                    <button type="button" class="btn btn-success" @click="handleAdd" :disabled="!canAdd">
                        <span v-if="isProcessing" class="spinner-border spinner-border-sm me-1"></span>
                        Add {{ lotsToChange }} Lot{{ lotsToChange > 1 ? 's' : '' }}
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
