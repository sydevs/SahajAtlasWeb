import { useCallback } from 'react'

// This is the payload the native share sheet accepts.
// It is the subset of the DOM `ShareData` type this app populates: an event title and its canonical URL.
export type WebShareData = {
  title?: string
  url: string
}

/**
 * This is an SSR-safe wrapper over the Web Share API, `navigator.share`.
 *
 * `canShare` is true only where the browser actually exposes `navigator.share`, on mobile and some desktops.
 * This detects it by capability, never by user-agent sniffing.
 * It is guarded, so it is simply `false` under the node test runner, where there is no `navigator.share`.
 *
 * `share` opens the native OS sheet.
 * It resolves to `true` on success, or `false` when it cannot complete.
 * It cannot complete when the API is missing, when the user dismisses the sheet, `AbortError`, or when the host page has disabled it through `Permissions-Policy`, `NotAllowedError`.
 * Callers use that `false` to reveal the button grid, so the viewer is never stranded.
 * This is a fallback signal, not an error to surface.
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
      // This is `AbortError`, the user dismissed the sheet, or `NotAllowedError`, blocked by the host page's `Permissions-Policy`.
      // Either way, this signals the caller to show the grid, instead of bubbling an error.
      return false
    }
  }, [])

  return { canShare, share }
}
