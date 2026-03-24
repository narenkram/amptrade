import { onMounted, onUnmounted, type Ref } from 'vue'

interface UseMouseScrollOptions<T> {
  targetSelector: string
  currentValue: Ref<string | number | undefined>
  values: T[] | Ref<T[]>
  valueToString?: (value: T) => string
  isNumber?: boolean
  min?: number
  max?: number
  step?: number
  onChange?: (value: string | number) => void | Promise<void>
}

export function useMouseScroll<T>({
  targetSelector,
  currentValue,
  values,
  valueToString = (value) => String(value),
  isNumber = false,
  min,
  max,
  step = 1,
  onChange,
}: UseMouseScrollOptions<T>) {
  const getValues = () => (Array.isArray(values) ? values : values.value)

  const changeValue = async (direction: 'up' | 'down') => {
    let newValue: string | number | undefined

    if (isNumber && typeof currentValue.value === 'number') {
      const delta = direction === 'up' ? step : -step
      newValue = (currentValue.value as number) + delta

      if (min !== undefined) newValue = Math.max(min, newValue)
      if (max !== undefined) newValue = Math.min(max, newValue)
    } else {
      const valuesList = getValues()
      if (!valuesList.length || !currentValue.value) return

      const currentIndex = valuesList.findIndex(
        (value) => valueToString(value) === currentValue.value,
      )
      if (currentIndex === -1) return

      let newIndex = currentIndex
      if (direction === 'up') {
        newIndex = currentIndex + 1 >= valuesList.length ? 0 : currentIndex + 1
      } else {
        newIndex = currentIndex - 1 < 0 ? valuesList.length - 1 : currentIndex - 1
      }

      newValue = valueToString(valuesList[newIndex])
    }

    currentValue.value = newValue

    if (onChange) {
      await onChange(newValue)
    }
  }

  const handleWheel = (event: WheelEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest(targetSelector)) return

    event.preventDefault()

    if (event.deltaY < 0) {
      changeValue('up')
    } else {
      changeValue('down')
    }
  }

  onMounted(() => {
    window.addEventListener('wheel', handleWheel, { passive: false })
  })

  onUnmounted(() => {
    window.removeEventListener('wheel', handleWheel)
  })
}
