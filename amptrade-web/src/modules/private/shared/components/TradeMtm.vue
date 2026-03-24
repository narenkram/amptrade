<template>
  <section class="row mt-3 mx-0 rounded py-2 border border-2 align-items-center justify-content-start" :class="{
    'border-danger': mtm < 0,
    'border-success': mtm > 0,
    'border-secondary': mtm === 0,
  }">
    <!-- Return of Investment -->
    <div class="col-6 col-md-2 col-lg-2 d-flex align-items-center justify-content-start mb-2 mb-lg-0">
      <small class="text-muted">ROI</small>
      <span class="ms-1 fw-bold" :class="{
        'text-success': roi > 0,
        'text-danger': roi < 0,
        'text-muted': roi === 0,
      }">
        {{ roi.toFixed(0) }}%
      </span>
    </div>
    <!-- Total Net quantity of positions -->
    <div class="col-6 col-md-2 col-lg-2 d-flex align-items-center justify-content-start mb-2 mb-lg-0">
      <small class="text-muted">NetQty</small>
      <span class="ms-1 fw-bold" :class="{
        'text-success': netQuantity > 0,
        'text-danger': netQuantity < 0,
        'text-muted': netQuantity === 0,
      }">
        {{ netQuantity }}
      </span>
    </div>
    <!-- MTM -->
    <div class="col-12 col-md-10 col-lg-8 d-flex align-items-center justify-content-end mb-2 mb-lg-0 flex-wrap">
      <span class="text-muted">MTM</span>
      <div class="d-flex align-items-center ms-2 flex-wrap">
        <button class="btn btn-sm btn-outline">
          <span class="fw-bold" :class="{
            'text-success': mtm > 0,
            'text-danger': mtm < 0,
            'text-muted': mtm === 0,
          }">
            {{ mtm.toFixed(0) }}
          </span>
        </button>

        <!-- Average MTM per account -->
        <button class="btn btn-sm btn-outline ms-2" v-if="brokerCount > 1">
          <small class="text-muted">Avg</small>
          <span class="ms-1 fw-bold" :class="{
            'text-success': avgMtm > 0,
            'text-danger': avgMtm < 0,
            'text-muted': avgMtm === 0,
          }">
            {{ avgMtm.toFixed(0) }}
          </span>
        </button>

        <div class="d-flex ms-2">
          <div class="d-flex flex-wrap">
            <!-- Stoploss controls -->
            <div class="d-flex mt-2 mt-sm-0">
              <button v-if="!isStopLossSet" class="btn btn-sm btn-outline-danger" @click="openMtmModal('stoploss')"
                title="Add stoploss">
                <FontAwesomeIcon icon="plus" />
              </button>
              <template v-else>
                <!-- Decrement button -->
                <button class="btn btn-sm btn-outline-secondary me-1" @click="decrementMtmStopLoss"
                  title="Decrease stoploss">
                  <FontAwesomeIcon icon="minus" />
                </button>

                <!-- Multiplier button -->
                <button class="btn btn-sm btn-outline-secondary me-1" @click="openMultiplierModal('stoploss')"
                  title="Change increment/decrement multiplier">
                  ₹{{ incrementMultiplier }}
                </button>

                <button class="btn btn-sm" :class="mtmStoploss ? 'btn-danger' : 'btn-outline-danger'"
                  @click="openMtmModal('stoploss')">
                  <span class="d-none d-md-block">Stoploss: {{ Number(mtmStoploss).toFixed(0) }}</span>
                  <span class="d-block d-md-none">SL: {{ Number(mtmStoploss).toFixed(0) }}</span>
                </button>

                <!-- Increment button -->
                <button class="btn btn-sm btn-outline-secondary ms-1" @click="incrementMtmStopLoss"
                  title="Increase stoploss">
                  <FontAwesomeIcon icon="plus" />
                </button>

                <button class="btn btn-sm ms-1 btn-outline-secondary" @click="removeMtmStopLoss"
                  title="Remove stoploss">
                  <FontAwesomeIcon icon="xmark" />
                </button>
              </template>
              <button class="btn btn-sm ms-2" :class="mtmTrailing ? 'btn-secondary' : 'btn-outline'"
                @click="toggleMtmTrailing">
                {{ mtmTrailing ? 'S' : 'T' }}
              </button>
            </div>

            <!-- Target controls -->
            <div class="d-flex mt-2 mt-sm-0 ms-2">
              <button v-if="!isTargetSet" class="btn btn-sm btn-outline-success" @click="openMtmModal('target')"
                title="Add target">
                <FontAwesomeIcon icon="plus" />
              </button>
              <template v-else>
                <!-- Decrement button -->
                <button class="btn btn-sm btn-outline-secondary me-1" @click="decrementMtmTarget"
                  title="Decrease target">
                  <FontAwesomeIcon icon="minus" />
                </button>

                <!-- Multiplier button -->
                <button class="btn btn-sm btn-outline-secondary me-1" @click="openMultiplierModal('target')"
                  title="Change increment/decrement multiplier">
                  ₹{{ incrementMultiplier }}
                </button>

                <button class="btn btn-sm" :class="mtmTarget ? 'btn-success' : 'btn-outline-success'"
                  @click="openMtmModal('target')">
                  <span class="d-none d-md-block">Target: {{ Number(mtmTarget).toFixed(0) }}</span>
                  <span class="d-block d-md-none">TG: {{ Number(mtmTarget).toFixed(0) }}</span>
                </button>

                <!-- Increment button -->
                <button class="btn btn-sm btn-outline-secondary ms-1" @click="incrementMtmTarget"
                  title="Increase target">
                  <FontAwesomeIcon icon="plus" />
                </button>

                <button class="btn btn-sm ms-1 btn-outline-secondary" @click="removeMtmTarget" title="Remove target">
                  <FontAwesomeIcon icon="xmark" />
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Add MTM Trigger Modal -->
  <MtmTriggerModal v-model:isOpen="showMtmModal" :mtm="mtm" :highest-mtm="highestMtm" :mtm-target="mtmTarget"
    :mtm-stoploss="mtmStoploss" :trailing-enabled="mtmTrailing" :trailing-step="trailingStep"
    :trigger-type="selectedTriggerType" @save="handleMtmTriggerSave" />

  <!-- Add Multiplier Modal -->
  <MultiplierModal v-model:isOpen="showMultiplierModal" :trigger-type="selectedTriggerType"
    :current-multiplier="incrementMultiplier" @save="handleMultiplierSave" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, inject, type Ref } from 'vue'
import { useTriggerCoordination } from '@/modules/private/shared/composables/useTriggerCoordination'
import MtmTriggerModal from '@/modules/private/shared/components/MtmTriggerModal.vue'
import MultiplierModal from '@/modules/private/shared/components/MultiplierModal.vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

// Props
const props = defineProps<{
  isMultiBroker?: boolean
}>()

// Inject totalInvestment
const totalInvestment = inject('totalInvestment') as Ref<number>

const netQuantity = ref(0)
const mtm = ref(0)
const avgMtm = ref(0)
const brokerCount = ref(1)

// Compute ROI as percentage
const roi = computed(() => {
  if (!totalInvestment?.value) return 0
  return (mtm.value / totalInvestment.value) * 100
})

// Methods to update net quantity and MTM
const updateNetQuantity = (qty: number) => {
  netQuantity.value = qty
}
const updateMtm = (pnl: number) => {
  mtm.value = pnl
}

// Method to update average MTM and broker count
const updateAvgMtm = (count: number) => {
  brokerCount.value = count
  avgMtm.value = count > 0 ? mtm.value / count : 0
}



// Initialize trigger coordination
const { executeWithCoordination } = useTriggerCoordination()

// New refs for risk management
const isStopLossSet = ref(false)
const isTargetSet = ref(false)

const mtmTarget = ref(Number(localStorage.getItem('mtmTarget')) || 0)
const mtmStoploss = ref(Number(localStorage.getItem('mtmStoploss')) || 0)
const mtmAction = ref(localStorage.getItem('mtmAction') || 'close')
const trailingStep = ref(Number(localStorage.getItem('trailingStep')) || 1)

const highestMtm = ref(0)
const mtmTrailing = ref(false)

// Increment/decrement multiplier
const incrementMultiplier = ref(Number(localStorage.getItem('incrementMultiplier')) || 100)

// Modal control
const showMtmModal = ref(false)
const showMultiplierModal = ref(false)
const selectedTriggerType = ref<'stoploss' | 'target'>('stoploss')

// Open modal for setting MTM triggers
const openMtmModal = (triggerType: 'stoploss' | 'target') => {
  selectedTriggerType.value = triggerType
  showMtmModal.value = true
}

// Open modal for setting multiplier value
const openMultiplierModal = (triggerType: 'stoploss' | 'target') => {
  selectedTriggerType.value = triggerType
  showMultiplierModal.value = true
}

// Handle saving multiplier value
const handleMultiplierSave = (_triggerType: string, value: number) => {
  incrementMultiplier.value = value
  localStorage.setItem('incrementMultiplier', value.toString())
}

// Handle saving MTM trigger values
const handleMtmTriggerSave = (type: string, value: number, newTrailingStep?: number) => {
  if (type === 'stoploss') {
    mtmStoploss.value = value
    isStopLossSet.value = value !== 0 // Update isStopLossSet based on value
    if (newTrailingStep !== undefined) {
      trailingStep.value = newTrailingStep
    }
  } else if (type === 'target') {
    mtmTarget.value = value
    isTargetSet.value = value !== 0 // Update isTargetSet based on value
  }

  // Save to localStorage and update state
  setMtmLevels()
}

// Update setMtmLevels to always persist the user-entered values
const setMtmLevels = () => {
  // Always store values when they're explicitly set, even if zero or negative
  localStorage.setItem('mtmTarget', Number(mtmTarget.value).toString())
  localStorage.setItem('mtmStoploss', Number(mtmStoploss.value).toString())
  localStorage.setItem('mtmAction', mtmAction.value)
  localStorage.setItem('trailingStep', Number(trailingStep.value).toString())
  localStorage.setItem('mtmTrailing', mtmTrailing.value.toString())
}

onMounted(() => {
  // Initialize risk management and trailing states from localStorage
  mtmTrailing.value = localStorage.getItem('mtmTrailing') === 'true'
  mtmTarget.value = Number(localStorage.getItem('mtmTarget')) || 0
  mtmStoploss.value = Number(localStorage.getItem('mtmStoploss')) || 0
  mtmAction.value = localStorage.getItem('mtmAction') || 'close'
  trailingStep.value = Number(localStorage.getItem('trailingStep')) || 1
  highestMtm.value = mtm.value

  // Initialize the trigger flags based on stored values
  isStopLossSet.value = mtmStoploss.value !== 0
  isTargetSet.value = mtmTarget.value !== 0
})



// Watch for changes to mtmTrailing
watch(mtmTrailing, () => {
  setMtmLevels()
})

watch(mtm, async (newMtm) => {
  const roundedNewMtm = Number(newMtm.toFixed(0))

  if (mtmAction.value === 'close') {
    // Check stop-loss trigger
    if (isStopLossSet.value && mtmStoploss.value !== 0 && roundedNewMtm <= mtmStoploss.value) {
      await executeWithCoordination('MTM-StopLoss', async () => {
        console.log('MTM Stop-loss triggered:', { mtm: roundedNewMtm, stopLoss: mtmStoploss.value })

        // Reset MTM triggers
        mtmStoploss.value = 0
        mtmTarget.value = 0
        mtmTrailing.value = false
        isStopLossSet.value = false
        isTargetSet.value = false
        localStorage.setItem('mtmStoploss', '0')
        localStorage.setItem('mtmTarget', '0')
        localStorage.setItem('mtmTrailing', 'false')

        window.dispatchEvent(
          new CustomEvent('shortcut-close-all', {
            detail: { hitType: 'MTM-StopLoss', mode: props.isMultiBroker ? 'multi' : 'single', target: 'center' },
          })
        )
      })
      return
    }

    // Check target trigger
    if (isTargetSet.value && mtmTarget.value !== 0 && roundedNewMtm >= mtmTarget.value) {
      await executeWithCoordination('MTM-Target', async () => {
        console.log('MTM Target triggered:', { mtm: roundedNewMtm, target: mtmTarget.value })

        // Reset MTM triggers
        mtmStoploss.value = 0
        mtmTarget.value = 0
        mtmTrailing.value = false
        isStopLossSet.value = false
        isTargetSet.value = false
        localStorage.setItem('mtmStoploss', '0')
        localStorage.setItem('mtmTarget', '0')
        localStorage.setItem('mtmTrailing', 'false')

        window.dispatchEvent(
          new CustomEvent('shortcut-close-all', {
            detail: { hitType: 'MTM-Target', mode: props.isMultiBroker ? 'multi' : 'single', target: 'center' },
          })
        )
      })
      return
    }
  }

  // Handle trailing stop-loss
  if (mtmTrailing.value && mtmStoploss.value !== 0) {
    if (roundedNewMtm > highestMtm.value) {
      highestMtm.value = roundedNewMtm
      const newStopLoss = Math.max(0, roundedNewMtm - trailingStep.value)
      if (newStopLoss > mtmStoploss.value) {
        mtmStoploss.value = newStopLoss
        localStorage.setItem('mtmStoploss', newStopLoss.toString())
        console.log('Trailing stop-loss updated:', newStopLoss)
      }
    }
  }
})

// Add this new method to toggle trailing mode
const toggleMtmTrailing = () => {
  mtmTrailing.value = !mtmTrailing.value
  setMtmLevels()
}

// Add these methods for removing stoploss and target
const removeMtmStopLoss = () => {
  mtmStoploss.value = 0
  mtmTrailing.value = false
  isStopLossSet.value = false // Update flag when removing
  localStorage.setItem('mtmStoploss', '0')
  localStorage.setItem('mtmTrailing', 'false')
  setMtmLevels()
}

const removeMtmTarget = () => {
  mtmTarget.value = 0
  isTargetSet.value = false // Update flag when removing
  localStorage.setItem('mtmTarget', '0')
  setMtmLevels()
}

// New methods for increment/decrement stoploss and target
const incrementMtmStopLoss = () => {
  // If value is zero, start with the multiplier value
  if (mtmStoploss.value === 0) {
    mtmStoploss.value = incrementMultiplier.value;
  } else {
    mtmStoploss.value = mtmStoploss.value + incrementMultiplier.value
  }
  isStopLossSet.value = true // Ensure flag is set
  localStorage.setItem('mtmStoploss', mtmStoploss.value.toString())
  setMtmLevels()
}

const decrementMtmStopLoss = () => {
  // If value is zero, start with a negative multiplier value
  if (mtmStoploss.value === 0) {
    mtmStoploss.value = -incrementMultiplier.value;
  } else {
    mtmStoploss.value = mtmStoploss.value - incrementMultiplier.value // Allow negative values
  }
  isStopLossSet.value = true // Ensure flag is set
  localStorage.setItem('mtmStoploss', mtmStoploss.value.toString())
  setMtmLevels()
}

const incrementMtmTarget = () => {
  // If value is zero, start with the multiplier value
  if (mtmTarget.value === 0) {
    mtmTarget.value = incrementMultiplier.value;
  } else {
    mtmTarget.value = mtmTarget.value + incrementMultiplier.value
  }
  isTargetSet.value = true // Ensure flag is set
  localStorage.setItem('mtmTarget', mtmTarget.value.toString())
  setMtmLevels()
}

const decrementMtmTarget = () => {
  // If value is zero, start with a negative multiplier value
  if (mtmTarget.value === 0) {
    mtmTarget.value = -incrementMultiplier.value;
  } else {
    mtmTarget.value = mtmTarget.value - incrementMultiplier.value // Allow negative values
  }
  isTargetSet.value = true // Ensure flag is set
  localStorage.setItem('mtmTarget', mtmTarget.value.toString())
  setMtmLevels()
}



defineExpose({
  updateNetQuantity,
  updateMtm,
  updateAvgMtm,
})
</script>
