import { useCallback, useEffect, useState } from 'react'

/**
 * Copies to the clipboard and holds `copied` true for `ms`. `copy` resolves `false`, and never
 * throws, when there is no clipboard or the host refused `clipboard-write` (`docs/embedding.md`).
 */
export function useCopy(ms: number) {
  // A count, not a flag, so a second copy inside the window restarts the timer.
  const [copies, setCopies] = useState(0)

  useEffect(() => {
    if (!copies) return
    const timer = window.setTimeout(() => setCopies(0), ms)

    return () => window.clearTimeout(timer)
  }, [copies, ms])

  const copy = useCallback(async (value: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard) return false
      await navigator.clipboard.writeText(value)
      setCopies((n) => n + 1)

      return true
    } catch {
      return false
    }
  }, [])

  return { copied: copies > 0, copy }
}
