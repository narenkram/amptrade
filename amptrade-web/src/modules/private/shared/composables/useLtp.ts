import { inject, type Ref, unref, type MaybeRef } from 'vue'
import type { InstrumentType } from '@/modules/private/shared/types/trade'

export function useLtp(type?: MaybeRef<InstrumentType | undefined>) {
  const callInstrumentLtp = inject('callInstrumentLtp') as Ref<number | null>
  const putInstrumentLtp = inject('putInstrumentLtp') as Ref<number | null>
  const futuresInstrumentLtp = inject('futuresInstrumentLtp') as Ref<number | null>
  const equityInstrumentLtp = inject('equityInstrumentLtp') as Ref<number | null>

  const getCurrentLtp = () => {
    const currentType = unref(type)
    if (!currentType) return null

    switch (currentType) {
      case 'CALL':
        return callInstrumentLtp.value
      case 'PUT':
        return putInstrumentLtp.value
      case 'FUT':
        return futuresInstrumentLtp.value
      case 'EQ':
        return equityInstrumentLtp.value
      default:
        return null
    }
  }

  return {
    getCurrentLtp,
  }
}
