import { useCallback } from 'react'

// This is the payload the native share sheet accepts.
// It is the subset of the DOM `ShareData` type this app populates: an event title and its canonical URL.
export type WebShareData = {
  title?: string
  url: string
}

/**
 * How a native share attempt ended.
 *
 * - `shared`: the sheet completed.
 * - `dismissed`: the viewer closed the sheet (`AbortError`). They saw it working, so the
 *   caller keeps offering it rather than swapping in the fallback grid.
 * - `unavailable`: the sheet could not open — no API, or the host page's
 *   `Permissions-Policy` refused it (`NotAllowedError`). The caller reveals the grid, so the
 *   viewer is never stranded.
 */
export type WebShareOutcome = 'shared' | 'dismissed' | 'unavailable'

/**
 * This is an SSR-safe wrapper over the Web Share API, `navigator.share`.
 *
 * `canShare` is true only where the browser actually exposes `navigator.share`, on mobile and some desktops.
 * This detects it by capability, never by user-agent sniffing.
 * It is guarded, so it is simply `false` under the node test runner, where there is no `navigator.share`.
 *
 * `share` opens the native OS sheet and resolves to a `WebShareOutcome`. It never rejects:
 * a failure is a fallback signal, not an error to surface.
 */
export function useWebShare(): {
  canShare: boolean
  share: (data: WebShareData) => Promise<WebShareOutcome>
} {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = useCallback(async (data: WebShareData): Promise<WebShareOutcome> => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return 'unavailable'
    }

    try {
      await navigator.share(data)

      return 'shared'
    } catch (error) {
      // ⚠ Closing the macOS sheet rejects with `AbortError`. Treating that as a failure
      // replaced the working Share button with the fallback grid the moment the viewer
      // closed the sheet.
      return error instanceof DOMException && error.name === 'AbortError'
        ? 'dismissed'
        : 'unavailable'
    }
  }, [])

  return { canShare, share }
}
