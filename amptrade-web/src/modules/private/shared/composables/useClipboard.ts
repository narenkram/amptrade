import { ref } from 'vue'

export function useClipboard(timeout = 2000) {
  const copyMessage = ref<string | null>(null)
  const isCopying = ref(false)

  const copyToClipboard = async (text: string, successMessage = 'Copied to clipboard!') => {
    try {
      isCopying.value = true
      await navigator.clipboard.writeText(text)
      copyMessage.value = successMessage

      setTimeout(() => {
        copyMessage.value = null
      }, timeout)

      return {
        success: true,
        message: successMessage,
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to copy to clipboard'
      copyMessage.value = errorMessage

      setTimeout(() => {
        copyMessage.value = null
      }, timeout)

      return {
        success: false,
        message: errorMessage,
      }
    } finally {
      isCopying.value = false
    }
  }

  return {
    copyMessage,
    isCopying,
    copyToClipboard,
  }
}
