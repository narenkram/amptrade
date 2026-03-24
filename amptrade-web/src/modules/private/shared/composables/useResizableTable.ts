import { ref, onUnmounted } from 'vue'

export function useResizableTable() {
  // Add these refs for resize handling
  const isResizing = ref(false)
  const currentColumn = ref<HTMLElement | null>(null)
  const startX = ref(0)
  const startWidth = ref(0)

  // Add these methods for handling resize
  const startResize = (event: MouseEvent | TouchEvent, column: HTMLElement) => {
    isResizing.value = true
    currentColumn.value = column

    // Get the starting X position for both mouse and touch events
    const clientX = event instanceof MouseEvent ? event.pageX : event.touches[0].pageX
    startX.value = clientX
    startWidth.value = column.offsetWidth

    // Add both mouse and touch event listeners
    if (event instanceof MouseEvent) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', stopResize)
    } else {
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', stopResize)
      document.addEventListener('touchcancel', stopResize)
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value || !currentColumn.value) return
    e.preventDefault()
    const diff = e.pageX - startX.value
    updateColumnWidth(diff)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!isResizing.value || !currentColumn.value) return
    e.preventDefault() // Prevent scrolling while resizing
    const diff = e.touches[0].pageX - startX.value
    updateColumnWidth(diff)
  }

  const updateColumnWidth = (diff: number) => {
    if (!currentColumn.value) return
    const newWidth = Math.max(50, startWidth.value + diff) // Minimum width of 50px
    currentColumn.value.style.width = `${newWidth}px`
    currentColumn.value.style.minWidth = `${newWidth}px`
    currentColumn.value.style.maxWidth = `${newWidth}px`
  }

  const stopResize = () => {
    isResizing.value = false

    // Remove both mouse and touch event listeners
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopResize)
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', stopResize)
    document.removeEventListener('touchcancel', stopResize)
  }

  onUnmounted(() => {
    stopResize()
  })

  return {
    startResize,
  }
}
