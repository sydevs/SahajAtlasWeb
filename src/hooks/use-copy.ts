import { useCallback, useEffect, useState } from 'react'

/**
 * Copies text to the clipboard and remembers, for `ms`, that it did, so the caller can say so.
 * `copy` resolves `false` when there is no clipboard or the page refused it (a host can block
 * `clipboard-write`, `docs/embedding.md`), so the caller can offer the text to copy by hand.
 * It never throws.
 */
export function useCopy(ms: number) {
  // A count, not a flag, so a second copy inside the window restarts the timer.
  const [copies, setCopies] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copies) return
    setCopied(true)
    const timer = window.setTimeout(() => setCopied(false), ms)

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

  return { copied, copy }
}
