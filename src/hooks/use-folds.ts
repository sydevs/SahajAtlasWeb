import { useCallback } from 'react'

import { useResultFolds } from '@/config/store'

/**
 * Which folded groups of a list are open, kept across the drawer's remounts. `key` names the list:
 * a different one starts again from each group's default. A group stays on its default, which can
 * change as results come in, until the visitor toggles it.
 */
export const useFolds = (key: string) => {
  const storedKey = useResultFolds((state) => state.key)
  const open = useResultFolds((state) => state.open)
  const setOpen = useResultFolds((state) => state.setOpen)
  const current = storedKey === key ? open : undefined

  return {
    isOpen: (id: string, byDefault: boolean) => current?.[id] ?? byDefault,
    setOpen: useCallback((id: string, value: boolean) => setOpen(key, id, value), [key, setOpen]),
  }
}
