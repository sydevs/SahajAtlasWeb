import { useCallback } from 'react'

// The payload the native share sheet accepts — the subset of the DOM `ShareData`
// this app populates (an event title + its canonical URL).
export type WebShareData = {
  title?: string
  url: string
}

/**
 * SSR-safe wrapper over the Web Share API (`navigator.share`).
 *
 * `canShare` is true only where the browser actually exposes `navigator.share`
 * (mobile and some desktops) — detected by capability, never by user-agent
 * sniffing — and guarded so it is simply `false` under the node test runner,
 * where there is no `navigator.share`.
 *
 * `share` opens the native OS sheet and resolves to `true` on success or `false`
 * when it can't complete: the API is missing, the user dismisses the sheet
 * (`AbortError`), or the host page has disabled it via `Permissions-Policy`
 * (`NotAllowedError`). Callers use that `false` to reveal the button grid so the
 * viewer is never stranded — it is a fallback signal, not an error to surface.
 */
export function useWebShare(): {
  canShare: boolean
  share: (data: WebShareData) => Promise<boolean>
} {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = useCallback(async (data: WebShareData): Promise<boolean> => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false

    try {
      await navigator.share(data)

      return true
    } catch {
      // AbortError (user dismissed the sheet) or NotAllowedError (blocked by the
      // host page's Permissions-Policy) — either way, signal the caller to show
      // the grid rather than bubbling an error.
      return false
    }
  }, [])

  return { canShare, share }
}
