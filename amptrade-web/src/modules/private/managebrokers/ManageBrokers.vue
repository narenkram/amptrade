<template>
  <section class="py-3">
    <div class="row">
      <div class="col-12 d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <button class="btn btn-outline btn-sm" @click="showAddBrokerModal = true">
            Add New Broker
          </button>
          <button class="btn btn-outline-success btn-sm ms-2" @click="handleRefreshAll" :disabled="isRefreshing">
            <span v-if="isRefreshing">
              <FontAwesomeIcon icon="spinner" spin class="me-1" />
              Refreshing...
            </span>
            <span v-else>
              <FontAwesomeIcon icon="sync" class="me-1" />
              Refresh All
            </span>
          </button>
          <button class="btn btn-outline-secondary btn-sm ms-2" @click="resetMultiSelection"
            :disabled="!selectedMultiBrokers.length">
            <FontAwesomeIcon icon="times" class="me-1" />
            Reset Broker Selection
          </button>
        </div>

        <RouterLink to="/app/terminal" class="btn btn-outline btn-sm">
          Open Terminal
        </RouterLink>
      </div>



      <!-- Integrated multi-broker selection now handled inside BrokerTable -->

      <!-- Add loading state -->
      <div v-if="isLoading" class="d-flex justify-content-center py-5">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <!-- Show content when loaded -->
      <div v-else>
        <div v-if="primarySelectionError" class="alert alert-danger mb-2">
          <FontAwesomeIcon icon="times-circle" class="me-2" />
          {{ primarySelectionError }}
        </div>
        <div v-if="brokerLimitError" class="alert alert-warning mb-2">
          <FontAwesomeIcon icon="exclamation-circle" class="me-2" />
          {{ brokerLimitError }}
        </div>
        <div class="col-12 d-block d-lg-none">
          <BrokerCard v-for="broker in brokers" :key="broker.id" :broker="broker"
            :isClientIdVisible="showClientId[broker.id]" :activeBrokers="activeBrokers" :showSelect="false"
            :primaryBrokerId="primaryBrokerIdString" @toggleClientId="toggleClientIdVisibility" @copy="handleCopy"
            @remove="handleRemoveBroker" @login="handleBrokerLogin" @toggleActive="toggleBrokerActive"
            @setPrimary="handleSetPrimary" @updateName="handleUpdateName" />
        </div>

        <!-- Brokers Table View -->
        <div class="col-12 d-none d-lg-block">
          <BrokerTable :brokers="brokers" :showClientId="showClientId" :activeBrokers="activeBrokers"
            :showSelect="false" :selectedMultiBrokerIds="selectedMultiBrokerIds"
            :currentArchitecture="selectedArchitecture" :primaryBrokerId="primaryBrokerIdString"
            @toggleClientId="toggleClientIdVisibility" @copy="handleCopy" @remove="handleRemoveBroker"
            @login="handleBrokerLogin" @toggleActive="toggleBrokerActive"
            @toggleMultiSelect="toggleMultiBrokerSelection" @clearMultiSelect="resetMultiSelection"
            @selectAllMulti="selectAllMultiBrokerSelection" @selectAllByType="selectAllByBrokerType"
            @setPrimary="handleSetPrimary" @updateName="handleUpdateName" />
        </div>

        <!-- Add Broker Modal -->
        <AddBrokerModal :show="showAddBrokerModal" :isLoading="isAddingBroker" @close="handleCloseModal"
          @submit="handleAddBroker" @copy="handleCopy" />

        <ShoonyaLoginModal :show="showShoonyaLoginModal" :broker="selectedBroker" :isLoading="isShoonyaLogginIn"
          :error="shoonyaError" @close="closeShoonyaLoginModal" @submit="handleShoonyaLogin"
          @error-dismiss="shoonyaError = null" />
        <ZebuLoginModal :show="showZebuLoginModal" :broker="selectedBroker" :isLoading="isZebuLoggingIn"
          :error="zebuError" @close="closeZebuLoginModal" @submit="handleZebuLogin" @error-dismiss="zebuError = null" />
        <TradesmartLoginModal :show="showTradesmartLoginModal" :broker="selectedBroker"
          :isLoading="isTradesmartLoggingIn" :error="tradesmartError" @close="closeTradesmartLoginModal"
          @submit="handleTradesmartLogin" @error-dismiss="tradesmartError = null" />
        <InfinnLoginModal :show="showInfinnLoginModal" :broker="selectedBroker" :isLoading="isInfinnLoggingIn"
          :error="infinnError" @close="closeInfinnLoginModal" @submit="handleInfinnLogin"
          @error-dismiss="infinnError = null" />
      </div>
    </div>

    <div class="row mt-3">
      <!-- Status Legend -->
      <div class="col-12">
        <div class="card p-3 border-0">
          <div class="d-flex flex-wrap gap-3 gap-lg-4">
            <div class="d-flex align-items-center">
              <span class="badge rounded-pill text-bg-success me-2">valid</span>
              <p class="m-0">Broker login is valid and ready to connect</p>
            </div>
            <div class="d-flex align-items-center">
              <span class="badge rounded-pill text-bg-danger me-2">expired</span>
              <p class="m-0">Broker login is expired</p>
            </div>
            <div class="d-flex align-items-center">
              <span class="badge rounded-pill text-bg-warning me-2">pending</span>
              <p class="m-0">Broker login is pending</p>
            </div>
          </div>
          <hr class="my-3" />
          <div class="d-flex flex-column gap-2">
            <p class="m-0">
              <FontAwesomeIcon icon="info-circle" class="me-2" />Broker Login is required everyday.
            </p>
            <p class="m-0">
              <FontAwesomeIcon icon="info-circle" class="me-2" />Brokers often conduct maintenance
              during off market hours, so the app may not work as expected during these hours.
            </p>
          </div>
        </div>
      </div>
      <!-- List of supported brokers -->
      <div class="col-12 mt-4">
        <div class="d-flex gap-2 justify-content-center align-items-center mb-3 flex-wrap">
          <img src="@/assets/zerodha_logo.png" alt="Zerodha" class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/upstox_logo.png" alt="Upstox" class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/flattrade_logo.png" alt="FlatTrade"
            class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/infinn_logo.png" alt="Infinn" class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/shoonya_logo.png" alt="Shoonya" class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/tradesmart_logo.png" alt="TradeSmart"
            class="img-fluid Broker_logo border rounded bg-color-2" />
          <img src="@/assets/zebu_logo.png" alt="Zebu" class="img-fluid Broker_logo border rounded bg-color-2" />
        </div>
      </div>
    </div>
    <ContactSupport />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBroker } from '@/modules/private/managebrokers/composables/useBroker'
import type { NewBrokerForm, Broker } from '@/modules/private/shared/types/broker'

import { useBrokerStore } from '@/modules/private/shared/stores/brokerStore'
import BrokerTable from '@/modules/private/managebrokers/components/BrokerTable.vue'
import BrokerCard from '@/modules/private/managebrokers/components/BrokerCard.vue'
import AddBrokerModal from '@/modules/private/managebrokers/components/AddBroker.vue'
import { useClipboard } from '@/modules/private/shared/composables/useClipboard'
import { useBrokerLogin } from '@/modules/private/managebrokers/composables/useBrokerLogin'
import ShoonyaLoginModal from '@/modules/private/managebrokers/components/ShoonyaLoginModal.vue'
import ZebuLoginModal from '@/modules/private/managebrokers/components/ZebuLoginModal.vue'
import TradesmartLoginModal from '@/modules/private/managebrokers/components/TradesmartLoginModal.vue'
import InfinnLoginModal from '@/modules/private/managebrokers/components/InfinnLoginModal.vue'
import { useShoonyaLogin } from '@/modules/private/managebrokers/composables/useShoonyaLogin'
import { useZebuLogin } from '@/modules/private/managebrokers/composables/useZebuLogin'
import { useTradesmartLogin } from '@/modules/private/managebrokers/composables/useTradesmartLogin'
import { useInfinnLogin } from '@/modules/private/managebrokers/composables/useInfinnLogin'
import ContactSupport from '@/modules/private/shared/components/ContactSupport.vue'


// Type the refs
const showAddBrokerModal = ref<boolean>(false)
const error = ref<string | null>(null)
const brokerStore = useBrokerStore()
const { brokers, isAddingBroker, addBroker, removeBroker, validateAllBrokers } = useBroker()

const {
  selectedBrokerId,
  primaryBrokerId,
  selectedMultiBrokerIds,
  selectedArchitecture,
  selectedMultiBrokers,
} = storeToRefs(brokerStore)

const primaryBrokerIdString = computed(() => primaryBrokerId.value || '')



// Client ID visibility
const showClientId = ref<Record<string, boolean>>({})

const brokerLimitError = ref<string | null>(null)
const primarySelectionError = ref<string | null>(null)

const activeBrokers = computed<Record<string, boolean>>(() => {
  const id = selectedBrokerId.value
  if (!id) return {}
  return { [id]: true }
})

const toggleClientIdVisibility = (brokerId: string) => {
  showClientId.value[brokerId] = !showClientId.value[brokerId]
}

const toggleBrokerActive = (broker: Broker) => {
  try {
    brokerStore.toggleSelectedBroker(broker.id)
  } catch (e) {
    console.error(e)
  }
}

const clearSelectionErrors = () => {
  brokerLimitError.value = null
  primarySelectionError.value = null
}

const setSelectionError = (message: string) => {
  if (message.includes('broker limit')) {
    brokerLimitError.value = message
    primarySelectionError.value = null
    return
  }
  primarySelectionError.value = message
}

const handleSetPrimary = (broker: Broker) => {
  try {
    brokerStore.setPrimaryBroker(broker.id)
    clearSelectionErrors()
  } catch (e) {
    setSelectionError(e instanceof Error ? e.message : 'Failed to set primary broker.')
  }
}

const toggleMultiBrokerSelection = (broker: Broker) => {
  try {
    brokerStore.toggleMultiBroker(broker.id)
    clearSelectionErrors()
  } catch (e) {
    setSelectionError(e instanceof Error ? e.message : 'Failed to select broker.')
  }
}

const resetMultiSelection = () => {
  brokerStore.resetMultiBrokerSelection()
  clearSelectionErrors()
}

const selectAllMultiBrokerSelection = () => {
  try {
    brokerStore.selectAllCompatibleMultiBrokers()
    clearSelectionErrors()
  } catch (e) {
    setSelectionError(e instanceof Error ? e.message : 'Failed to select brokers.')
  }
}

const selectAllByBrokerType = (architecture: string) => {
  try {
    brokerStore.selectAllMultiBrokersByArchitecture(architecture)
    clearSelectionErrors()
  } catch (e) {
    setSelectionError(e instanceof Error ? e.message : 'Failed to select brokers.')
  }
}

// Broker actions
const handleAddBroker = async (formData: NewBrokerForm) => {
  try {
    await addBroker(formData)
    showAddBrokerModal.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add broker'
    console.error('Failed to add broker:', e)
  }
}

const handleRemoveBroker = (brokerId: string) => {
  if (confirm('Are you sure you want to remove this broker?')) {
    removeBroker(brokerId)
  }
}

const { handleLogin } = useBrokerLogin()

// Refresh functionality
const isRefreshing = ref<boolean>(false)
const handleRefreshAll = async () => {
  isRefreshing.value = true
  try {
    await validateAllBrokers()
  } finally {
    isRefreshing.value = false
  }
}

// Login handling
const selectedBroker = ref<Broker | null>(null)

const {
  handleLogin: shoonyaLoginHandler,
  isShoonyaLogginIn,
  showLoginModal: showShoonyaLoginModal,
  resetForm: resetShoonyaLogin,
  error: shoonyaError,
} = useShoonyaLogin()

const {
  handleLogin: zebuLoginHandler,
  isZebuLoggingIn,
  showLoginModal: showZebuLoginModal,
  resetForm: resetZebuLogin,
  error: zebuError,
} = useZebuLogin()

const {
  handleLogin: tradesmartLoginHandler,
  isTradesmartLoggingIn,
  showLoginModal: showTradesmartLoginModal,
  resetForm: resetTradesmartLogin,
  error: tradesmartError,
} = useTradesmartLogin()

const {
  handleLogin: infinnLoginHandler,
  isInfinnLoggingIn,
  showLoginModal: showInfinnLoginModal,
  resetForm: resetInfinnLogin,
  error: infinnError,
} = useInfinnLogin()

const handleShoonyaLogin = async (password: string, totp: string) => {
  if (!selectedBroker.value) return
  try {
    await shoonyaLoginHandler(selectedBroker.value, brokerStore, password, totp)
    closeShoonyaLoginModal()
  } catch (err) {
    handleLoginError(err instanceof Error ? err.message : 'Login failed')
  }
}

const handleZebuLogin = async (password: string, totp: string) => {
  if (!selectedBroker.value) return
  try {
    await zebuLoginHandler(selectedBroker.value, brokerStore, password, totp)
    closeZebuLoginModal()
  } catch (err) {
    handleLoginError(err instanceof Error ? err.message : 'Login failed')
  }
}

const handleTradesmartLogin = async (password: string, totp: string) => {
  if (!selectedBroker.value) return
  try {
    await tradesmartLoginHandler(selectedBroker.value, brokerStore, password, totp)
    closeTradesmartLoginModal()
  } catch (err) {
    handleLoginError(err instanceof Error ? err.message : 'Login failed')
  }
}

const handleInfinnLogin = async (password: string, totp: string) => {
  if (!selectedBroker.value) return
  try {
    await infinnLoginHandler(selectedBroker.value, brokerStore, password, totp)
    closeInfinnLoginModal()
  } catch (err) {
    handleLoginError(err instanceof Error ? err.message : 'Login failed')
  }
}


const handleLoginError = (errorMsg: string) => {
  shoonyaError.value = errorMsg
  zebuError.value = errorMsg
  tradesmartError.value = errorMsg
  infinnError.value = errorMsg
  console.error('Login error:', errorMsg)
}

const closeShoonyaLoginModal = () => {
  showShoonyaLoginModal.value = false
  selectedBroker.value = null
  resetShoonyaLogin()
}

const closeZebuLoginModal = () => {
  showZebuLoginModal.value = false
  selectedBroker.value = null
  resetZebuLogin()
}

const closeTradesmartLoginModal = () => {
  showTradesmartLoginModal.value = false
  selectedBroker.value = null
  resetTradesmartLogin()
}

const closeInfinnLoginModal = () => {
  showInfinnLoginModal.value = false
  selectedBroker.value = null
  resetInfinnLogin()
}

// Update broker account name
const handleUpdateName = async (brokerId: string, name: string) => {
  try {
    await brokerStore.updateBrokerName(brokerId, name)
  } catch (e) {
    console.error('Failed to update broker name:', e)
  }
}

// Updated broker login handler,
const handleBrokerLogin = async (broker: Broker) => {
  try {
    if (broker.type === 'Shoonya') {
      selectedBroker.value = broker
      showShoonyaLoginModal.value = true
    } else if (broker.type === 'Infinn') {
      selectedBroker.value = broker
      showInfinnLoginModal.value = true
    } else if (broker.type === 'Zebu') {
      selectedBroker.value = broker
      showZebuLoginModal.value = true
    } else if (broker.type === 'Tradesmart') {
      selectedBroker.value = broker
      showTradesmartLoginModal.value = true
    } else {
      await handleLogin(broker, brokerStore)
    }
  } catch (err) {
    handleLoginError(err instanceof Error ? err.message : 'Failed to login')
  }
}

const handleCloseModal = () => {
  showAddBrokerModal.value = false
}

// Copy functionality
const { copyMessage, copyToClipboard } = useClipboard()
const copyMessages = ref<Record<string, string>>({})

const handleCopy = async (text: string, brokerId?: string) => {
  const result = await copyToClipboard(text)
  if (result.success) {
    if (brokerId) {
      copyMessages.value[brokerId] = result.message
      setTimeout(() => {
        if (copyMessages.value[brokerId]) {
          copyMessages.value[brokerId] = ''
        }
      }, 2000)
    } else {
      copyMessage.value = result.message
      setTimeout(() => {
        copyMessage.value = null
      }, 2000)
    }
  }
}

const isLoading = ref(true)

onMounted(async () => {
  try {
    await brokerStore.loadBrokers()
    await handleRefreshAll()
    brokerStore.hydrateSelection()
  } catch (error) {
    console.error('Failed to initialize brokers:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.modal {
  background-color: rgba(0, 0, 0, 0.5);
}

.Broker_logo {
  max-height: 60px;
  padding: 10px;
}
</style>
