import { ref } from 'vue'

export function useTradeFormData() {
  // Trade form data refs
  const selectedSymbol = ref('')
  const selectedExpiry = ref('')
  const strikeData = ref<{ CE: number[]; PE: number[] }>({ CE: [], PE: [] })
  const underlyingToken = ref<string | null>(null)
  const selectedSegment = ref('')
  const lotSize = ref(1)
  const quantity = ref(1)
  const productType = ref('Intraday')
  const orderType = ref(localStorage.getItem('steadfast:trade:selectedOrderType') || 'Market Protection')
  const selectedExchange = ref(localStorage.getItem('steadfast:trade:selectedExchange') || '')
  const totalQuantity = ref(1)
  const shortcutsEnabled = ref(localStorage.getItem('steadfast:trade:shortcutsEnabled') !== 'false')
  const positionFilter = ref('ALL')
  const defaultStopLoss = ref(15)
  const defaultTarget = ref(30)
  const underlyingLtp = ref<number | null>(null)

  return {
    selectedSymbol,
    selectedExpiry,
    strikeData,
    underlyingToken,
    selectedSegment,
    lotSize,
    quantity,
    productType,
    orderType,
    selectedExchange,
    totalQuantity,
    shortcutsEnabled,
    positionFilter,
    defaultStopLoss,
    defaultTarget,
    underlyingLtp,
  }
}
