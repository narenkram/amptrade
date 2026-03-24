<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { STORAGE_KEYS } from '@/modules/private/shared/constants/storage'
import {
  DEFAULT_NIFTY_SL,
  DEFAULT_NIFTY_TARGET,
  DEFAULT_BANKNIFTY_SL,
  DEFAULT_BANKNIFTY_TARGET,
  DEFAULT_SENSEX_SL,
  DEFAULT_SENSEX_TARGET,
} from '@/modules/private/shared/composables/useStoplossTarget'

const callStrikeOffset = ref('ATM 0')
const putStrikeOffset = ref('ATM 0')
const expiryOffset = ref('Current Expiry')

// Index Options SL/Target settings - local refs for responsiveness
const niftySL = ref(DEFAULT_NIFTY_SL)
const niftyTarget = ref(DEFAULT_NIFTY_TARGET)
const bankNiftySL = ref(DEFAULT_BANKNIFTY_SL)
const bankNiftyTarget = ref(DEFAULT_BANKNIFTY_TARGET)
const sensexSL = ref(DEFAULT_SENSEX_SL)
const sensexTarget = ref(DEFAULT_SENSEX_TARGET)

// Save handlers for each instrument
const saveNiftySettings = () => {
}
const saveBankNiftySettings = () => {
}
const saveSensexSettings = () => {
}

// Initialize from localStorage
onMounted(() => {
  callStrikeOffset.value = localStorage.getItem(STORAGE_KEYS.CALL_STRIKE_OFFSET) || 'ATM 0'
  putStrikeOffset.value = localStorage.getItem(STORAGE_KEYS.PUT_STRIKE_OFFSET) || 'ATM 0'
  expiryOffset.value = localStorage.getItem(STORAGE_KEYS.EXPIRY_OFFSET) || 'Current Expiry'
})

// Persist to localStorage
watch(callStrikeOffset, (val) => {
  localStorage.setItem(STORAGE_KEYS.CALL_STRIKE_OFFSET, val)
})
watch(putStrikeOffset, (val) => {
  localStorage.setItem(STORAGE_KEYS.PUT_STRIKE_OFFSET, val)
})
watch(expiryOffset, (val) => {
  localStorage.setItem(STORAGE_KEYS.EXPIRY_OFFSET, val)
})
</script>

<template>
  <div class="row py-3 justify-content-center">
    <div class="col-12">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h4 class="mb-0">Settings</h4>
        <RouterLink to="/app/terminal" class="btn btn-outline btn-sm">
          Open Terminal
        </RouterLink>
      </div>


      <!-- Offset Settings -->
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="mb-3">Offset Settings</h5>
          <div class="row g-3">
            <div class="col-md-4">
              <label for="callStrikeOffset" class="form-label">Call Strike Offset</label>
              <select class="form-select" id="callStrikeOffset" v-model="callStrikeOffset">
                <!-- Add ITM options -->
                <option>ATM -6 (ITM)</option>
                <option>ATM -5 (ITM)</option>
                <option>ATM -4 (ITM)</option>
                <option>ATM -3 (ITM)</option>
                <option>ATM -2 (ITM)</option>
                <option>ATM -1 (ITM)</option>
                <option>ATM 0</option>
                <!-- Add OTM options -->
                <option>ATM +1 (OTM)</option>
                <option>ATM +2 (OTM)</option>
                <option>ATM +3 (OTM)</option>
                <option>ATM +4 (OTM)</option>
                <option>ATM +5 (OTM)</option>
                <option>ATM +6 (OTM)</option>
              </select>
            </div>
            <div class="col-md-4">
              <label for="putStrikeOffset" class="form-label">Put Strike Offset</label>
              <select class="form-select" id="putStrikeOffset" v-model="putStrikeOffset">
                <!-- Add ITM options for PUT -->
                <option>ATM +6 (ITM)</option>
                <option>ATM +5 (ITM)</option>
                <option>ATM +4 (ITM)</option>
                <option>ATM +3 (ITM)</option>
                <option>ATM +2 (ITM)</option>
                <option>ATM +1 (ITM)</option>
                <option>ATM 0</option>
                <!-- Add OTM options for PUT -->
                <option>ATM -1 (OTM)</option>
                <option>ATM -2 (OTM)</option>
                <option>ATM -3 (OTM)</option>
                <option>ATM -4 (OTM)</option>
                <option>ATM -5 (OTM)</option>
                <option>ATM -6 (OTM)</option>
              </select>
            </div>
            <div class="col-md-4">
              <label for="expiryOffset" class="form-label">Expiry Offset</label>
              <select class="form-select" id="expiryOffset" v-model="expiryOffset">
                <option>Current Expiry</option>
                <option>+1 Expiry</option>
                <option>+2 Expiry</option>
                <option>+3 Expiry</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Index Options SL/Target Settings -->
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="mb-3">Index Options SL/Target Settings</h5>
          <p class="text-muted small mb-3">
            Configure instrument-specific stoploss and target values for index options. These will override the default
            settings when trading these instruments.
          </p>
          <div class="row g-3">
            <!-- Nifty Options -->
            <div class="col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <h6 class="card-title">Nifty Options</h6>
                  <div class="mb-2">
                    <label for="niftySL" class="form-label small">Stoploss (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="niftySL" v-model.number="niftySL"
                      min="0" step="1" @change="saveNiftySettings" />
                  </div>
                  <div>
                    <label for="niftyTarget" class="form-label small">Target (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="niftyTarget"
                      v-model.number="niftyTarget" min="0" step="1" @change="saveNiftySettings" />
                  </div>
                </div>
              </div>
            </div>
            <!-- BankNifty Options -->
            <div class="col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <h6 class="card-title">BankNifty Options</h6>
                  <div class="mb-2">
                    <label for="bankNiftySL" class="form-label small">Stoploss (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="bankNiftySL"
                      v-model.number="bankNiftySL" min="0" step="1" @change="saveBankNiftySettings" />
                  </div>
                  <div>
                    <label for="bankNiftyTarget" class="form-label small">Target (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="bankNiftyTarget"
                      v-model.number="bankNiftyTarget" min="0" step="1" @change="saveBankNiftySettings" />
                  </div>
                </div>
              </div>
            </div>
            <!-- Sensex Options -->
            <div class="col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <h6 class="card-title">Sensex Options</h6>
                  <div class="mb-2">
                    <label for="sensexSL" class="form-label small">Stoploss (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="sensexSL" v-model.number="sensexSL"
                      min="0" step="1" @change="saveSensexSettings" />
                  </div>
                  <div>
                    <label for="sensexTarget" class="form-label small">Target (pts)</label>
                    <input type="number" class="form-control form-control-sm" id="sensexTarget"
                      v-model.number="sensexTarget" min="0" step="1" @change="saveSensexSettings" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
