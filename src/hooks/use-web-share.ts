import { useCallback } from 'react'

// This is the payload the native share sheet accepts.
// It is the subset of the DOM `ShareData` type this app populates: an event title and its canonical URL.
export type WebShareData = {
  title?: string
  url: string
}

/**
 * How a share attempt ended. `dismissed` is the visitor backing out of the sheet, which says nothing
 * about the sheet working. `unavailable` means it could not open at all.
 */
export type WebShareResult = 'shared' | 'dismissed' | 'unavailable'

/**
 * This is an SSR-safe wrapper over the Web Share API, `navigator.share`.
 *
 * `canShare` is true only where the browser actually exposes `navigator.share`, on mobile and some desktops.
 * This detects it by capability, never by user-agent sniffing.
 * It is guarded, so it is simply `false` under the node test runner, where there is no `navigator.share`.
 *
 * `share` opens the native OS sheet.
 * A visitor dismissing the sheet resolves to `dismissed` (`AbortError`), so the same button can be tried again.
 * A missing API, or a host page that disables it through `Permissions-Policy` (`NotAllowedError`), resolves to `unavailable`.
 * Callers use `unavailable` to reveal the button grid, so the viewer is never stranded.
 * This is a fallback signal, not an error to surface.
 */
export function useWebShare(): {
  canShare: boolean
  share: (data: WebShareData) => Promise<WebShareResult>
} {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = useCallback(async (data: WebShareData): Promise<WebShareResult> => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      return 'unavailable'
    }

    try {
      await navigator.share(data)

      return 'shared'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError'
        ? 'dismissed'
        : 'unavailable'
    }
  }, [])

  return { canShare, share }
}
