import { ref, type Ref } from 'vue'

interface StrikeSelectionOptions {
  debug?: boolean // Default: false
  offset?: number // Default: 0
}

interface StrikeSelectionResult {
  selectedStrike: Ref<string>
  selectNearestStrike: (ltp: number, availableStrikes: number[], customOffset?: number) => void
  resetSelection: () => void
  error: Ref<string | null>
}

export function useNearestStrikeSelection(
  options: StrikeSelectionOptions = {},
): StrikeSelectionResult {
  const { debug = false, offset = 0 } = options

  const selectedStrike = ref('')
  const error = ref<string | null>(null)

  const selectNearestStrike = (ltp: number, availableStrikes: number[], customOffset?: number) => {
    error.value = null
    const effectiveOffset = customOffset !== undefined ? customOffset : offset

    if (!availableStrikes.length) {
      error.value = 'No strikes available'
      return
    }

    try {
      // Sort strikes for easier offset application
      const sortedStrikes = [...availableStrikes].sort((a, b) => a - b)

      // Find the ATM strike (closest to LTP)
      let atmIndex = 0
      let minDiff = Infinity

      for (let i = 0; i < sortedStrikes.length; i++) {
        const diff = Math.abs(sortedStrikes[i] - ltp)
        if (diff < minDiff) {
          minDiff = diff
          atmIndex = i
        }
      }

      // Apply offset
      const targetIndex = Math.max(
        0,
        Math.min(sortedStrikes.length - 1, atmIndex + effectiveOffset),
      )
      const selectedValue = sortedStrikes[targetIndex]

      if (debug) {
        console.debug('[useNearestStrikeSelection] Strike selection with offset:', {
          ltp,
          atmIndex,
          offset: effectiveOffset,
          targetIndex,
          selectedValue,
        })
      }

      selectedStrike.value = selectedValue.toString()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Strike selection failed'
      console.error('[useNearestStrikeSelection] Error:', {
        error: err,
        ltp,
        availableStrikes,
        offset: effectiveOffset,
      })
    }
  }

  const resetSelection = () => {
    selectedStrike.value = ''
    error.value = null
  }

  return {
    selectedStrike,
    selectNearestStrike,
    resetSelection,
    error,
  }
}
