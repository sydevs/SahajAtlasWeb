import { useCallback, useEffect, useState } from 'react'

/**
 * Copies to the clipboard and holds `copied` true for `ms`. `copy` resolves `false`, and never
 * throws, when there is no clipboard or the host refused `clipboard-write` (`docs/embedding.md`);
 * it then selects `fallback`, if given, so the visitor can copy it by hand, and `failed` stays
 * true until a copy succeeds.
 */
export function useCopy(ms: number) {
  // A count, not a flag, so a second copy inside the window restarts the timer.
  const [copies, setCopies] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copies) return
    const timer = window.setTimeout(() => setCopies(0), ms)

    return () => window.clearTimeout(timer)
  }, [copies, ms])

  const copy = useCallback(async (value: string, fallback?: Element | null): Promise<boolean> => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setCopies((n) => n + 1)
      setFailed(false)

      return true
    } catch {
      if (fallback) window.getSelection()?.selectAllChildren(fallback)
      setFailed(true)

      return false
    }
  }, [])

  return { copied: copies > 0, failed, copy }
}
