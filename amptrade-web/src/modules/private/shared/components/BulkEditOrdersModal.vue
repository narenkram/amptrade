<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Order } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'
import { useOrderManagement } from '@/modules/private/shared/composables/useOrderManagement'

interface OrderWithBroker extends Order {
    broker?: Broker
}

const props = defineProps<{
    isOpen: boolean
    orders: OrderWithBroker[]
}>()

const emit = defineEmits<{
    'update:isOpen': [value: boolean]
    'orders-modified': []
}>()

const { modifyMultipleOrders, loadingStates } = useOrderManagement()

// Order type: 'LMT' or 'MKT'
const orderType = ref<'LMT' | 'MKT'>('LMT')

// Track edited values for each order
const editedOrders = ref<
    Map<
        string,
        {
            price: number
            quantity: number
        }
    >
>(new Map())

// Initialize edited orders when modal opens or orders change
watch(
    () => [props.isOpen, props.orders],
    () => {
        if (props.isOpen && props.orders.length > 0) {
            editedOrders.value = new Map()
            props.orders.forEach((order) => {
                editedOrders.value.set(order.orderId, {
                    price: order.price || 0,
                    quantity: order.quantity || 0,
                })
            })
            // Default to current order type of first order
            orderType.value = props.orders[0].orderType === 'MARKET' ? 'MKT' : 'LMT'
        }
    },
    { immediate: true },
)

// Get edited price for an order
const getEditedPrice = (orderId: string): number => {
    return editedOrders.value.get(orderId)?.price || 0
}

// Set edited price for an order
const setEditedPrice = (orderId: string, price: number) => {
    const current = editedOrders.value.get(orderId) || { price: 0, quantity: 0 }
    editedOrders.value.set(orderId, { ...current, price })
}

// Get edited quantity for an order
const getEditedQuantity = (orderId: string): number => {
    return editedOrders.value.get(orderId)?.quantity || 0
}

// Set edited quantity for an order
const setEditedQuantity = (orderId: string, quantity: number) => {
    const current = editedOrders.value.get(orderId) || { price: 0, quantity: 0 }
    editedOrders.value.set(orderId, { ...current, quantity })
}

// Check if any order can be submitted
const canSubmit = computed(() => {
    if (orderType.value === 'MKT') return true

    // For limit orders, all prices must be > 0
    return Array.from(editedOrders.value.values()).every((order) => order.price > 0)
})

const handleClose = () => {
    emit('update:isOpen', false)
}

const handleConfirm = async () => {
    if (!canSubmit.value) return

    const modifications = props.orders
        .filter((order) => order.broker)
        .map((order) => {
            const edited = editedOrders.value.get(order.orderId)
            return {
                orderId: order.orderId,
                broker: order.broker!,
                params: {
                    prctyp: orderType.value,
                    prc: orderType.value === 'MKT' ? 0 : edited?.price || 0,
                    exch: order.exchange,
                    tsym: order.symbol,
                    qty: edited?.quantity || order.quantity,
                },
            }
        })

    try {
        await modifyMultipleOrders(modifications)
        emit('orders-modified')
        handleClose()
    } catch (error) {
        console.error('Failed to modify orders:', error)
    }
}
</script>

<template>
    <div v-if="isOpen" class="modal fade show d-block" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="bi bi-pencil-square me-2"></i>
                        Edit {{ orders.length }} Pending Order{{ orders.length > 1 ? 's' : '' }}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" @click="handleClose"></button>
                </div>
                <div class="modal-body">
                    <!-- Order Type Toggle -->
                    <div class="mb-3">
                        <label class="form-label fw-bold">Order Type</label>
                        <div class="btn-group w-100" role="group">
                            <input type="radio" class="btn-check" name="orderType" id="orderTypeLMT" value="LMT"
                                v-model="orderType" />
                            <label class="btn btn-outline" for="orderTypeLMT">Limit</label>

                            <input type="radio" class="btn-check" name="orderType" id="orderTypeMKT" value="MKT"
                                v-model="orderType" />
                            <label class="btn btn-outline" for="orderTypeMKT">Market</label>
                        </div>
                    </div>



                    <!-- Orders Table -->
                    <div class="table-responsive" style="max-height: 300px; overflow-y: auto">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th>Symbol</th>
                                    <th>Side</th>
                                    <th>Qty</th>
                                    <th v-if="orderType === 'LMT'">Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="order in orders" :key="order.orderId">
                                    <td class="small">
                                        {{ order.symbol }}
                                        <small class="text-muted d-block">{{ order.broker?.name }}</small>
                                    </td>
                                    <td>
                                        <span class="badge" :class="order.side === 'BUY' ? 'bg-success' : 'bg-danger'">
                                            {{ order.side }}
                                        </span>
                                    </td>

                                    <td>
                                        <input type="number" class="form-control form-control-sm" style="width: 80px"
                                            :value="getEditedQuantity(order.orderId)" @input="
                                                setEditedQuantity(order.orderId, Number(($event.target as HTMLInputElement).value))
                                                " min="1" />
                                    </td>
                                    <td v-if="orderType === 'LMT'">
                                        <input type="number" class="form-control form-control-sm" style="width: 100px"
                                            :value="getEditedPrice(order.orderId)" @input="
                                                setEditedPrice(order.orderId, Number(($event.target as HTMLInputElement).value))
                                                " step="0.05" min="0.05" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Info Alert -->
                    <div v-if="orderType === 'MKT'" class="alert alert-warning mt-3 mb-0 small">
                        <i class="bi bi-exclamation-triangle me-1"></i>
                        Converting to Market will execute orders at current market price.
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="handleClose"
                        :disabled="loadingStates.modifyOrders">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary" @click="handleConfirm"
                        :disabled="!canSubmit || loadingStates.modifyOrders">
                        <span v-if="loadingStates.modifyOrders" class="spinner-border spinner-border-sm me-1"></span>
                        {{ loadingStates.modifyOrders ? 'Modifying...' : 'Confirm Changes' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
    <div v-if="isOpen" class="modal-backdrop fade show"></div>
</template>
