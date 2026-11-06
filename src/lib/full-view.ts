/**
 * PROTOTYPE (`ux/embed-inline`): how an in-page embed opens its full view, and where it returns.
 *
 * The full view is the whole interface over the host's page, opened by a tap on the inline card.
 * Where it can open depends on how the host embedded us:
 *
 *  1. **`layer`** — the script embed runs in the host's own document, so a `position: fixed` layer
 *     covers the whole screen. Works everywhere, iPhone included. The best path.
 *  2. **`fullscreen`** — a frame cannot draw outside its box, but with `allow="fullscreen"` on the
 *     `<iframe>` and a browser that supports the Fullscreen API on elements (desktop, Android), the
 *     frame's own document goes fullscreen and the layer fills it.
 *  3. **`page`** — otherwise (iPhone Safari offers fullscreen to video only, per WebKit's bug
 *     tracker; not tested here), this tab goes to the Atlas page at the same route, with a bar
 *     back to the host. The same tab rather than a new one: older visitors lose their way among
 *     tabs.
 */

export type OpenPath = 'layer' | 'fullscreen' | 'page'

/** The opening path for this document, decided at tap time. */
export function openPath(framed: boolean): OpenPath {
  if (!framed) return 'layer'

  // `fullscreenEnabled` is false when the frame lacks `allow="fullscreen"`, and absent on iPhone.
  if (
    document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function'
  )
    return 'fullscreen'

  return 'page'
}

/** "www.example.org" → "example.org": the name a visitor knows the site by. */
export const siteName = (hostname: string): string => hostname.replace(/^www\./, '')

/**
 * The host page's origin, seen from inside a frame, or `null`.
 *
 * A cross-origin frame cannot read the parent's URL. `location.ancestorOrigins` (Chrome, Safari)
 * names the parent's origin; `document.referrer` does too under the default referrer policy,
 * which trims it to the origin. Neither gives the page's path.
 */
export function frameHostOrigin(): string | null {
  try {
    const ancestor = window.location.ancestorOrigins?.[0]

    if (ancestor && ancestor !== 'null') return ancestor
    if (document.referrer) return new URL(document.referrer).origin
  } catch {
    // An unreadable referrer is no host, not an error.
  }

  return null
}

/** The name to show in the full view's bar: the page we are on, or the page framing us. */
export function hostLabel(framed: boolean): string | null {
  if (!framed) return siteName(window.location.hostname)

  const origin = frameHostOrigin()

  return origin ? siteName(new URL(origin).hostname) : null
}

export const RETURN_PARAM = 'return'
export const FROM_FRAME_PARAM = 'from'

/**
 * The Atlas page a frame sends the visitor to, at the route they tapped, with the way back.
 *
 * The page is this frame's own origin: the only address today that serves the same build and keeps
 * the route (the compact card's `wemeditate.com/map` drops it). Which address this should be is a
 * decision for Anton and Devindra, so it lives in this one function.
 */
export function atlasPageUrl(route: string, returnOrigin: string | null, focus?: 'search'): string {
  const url = new URL(route, window.location.origin)

  url.searchParams.set(FROM_FRAME_PARAM, 'frame')
  if (returnOrigin) url.searchParams.set(RETURN_PARAM, returnOrigin)
  if (focus) url.searchParams.set('focus', focus)

  // The frame's own embed parameters stay behind: the page is the whole interface.
  url.searchParams.delete('inline')

  return url.toString()
}

/** Leaves the host page for the Atlas page in the same tab. Allowed after a tap, unless sandboxed. */
export function goToAtlasPage(url: string): void {
  try {
    if (window.top) {
      window.top.location.href = url

      return
    }
  } catch {
    // A sandboxed frame without `allow-top-navigation-by-user-activation` refuses; fall through.
  }
  window.open(url, '_top')
}

/**
 * Whether `href` is on one of the client's allowed domains (one per line, as SahajCloud stores
 * them), so a return link can never be used to send a visitor anywhere else.
 */
export function isAllowedReturn(href: string, allowedDomains: string | null | undefined): boolean {
  let host: string

  try {
    const url = new URL(href)

    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false
    host = url.hostname
  } catch {
    return false
  }

  return (allowedDomains ?? '')
    .split('\n')
    .map((domain) =>
      domain
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, ''),
    )
    .filter(Boolean)
    .some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/** The key the full view stamps on each history entry it owns, with that entry's depth. */
export const FULL_VIEW_KEY = '__sy_full'

/** How deep under the page's own entry `state` sits, or 0 for an entry the full view doesn't own. */
export const fullViewDepth = (state: unknown = window.history.state): number => {
  const value = (state as Record<string, unknown> | null)?.[FULL_VIEW_KEY]

  return typeof value === 'number' && value > 0 ? value : 0
}

/** The part of `History` the full view writes; a parameter so a spec can hand in one that refuses. */
export type HistoryWriter = Pick<History, 'state' | 'pushState' | 'replaceState'>

// ⚠ Both writers return `false` rather than throw. Some hosts' pages refuse history writes, which
// is why the router has a memory mode (#154); there the full view keeps its open state locally.

/** Stamps the current entry with its depth, keeping whatever the router keeps there. */
export function stampDepth(depth: number, history: HistoryWriter = window.history): boolean {
  try {
    const state = history.state

    history.replaceState(
      { ...(state && typeof state === 'object' ? state : {}), [FULL_VIEW_KEY]: depth },
      '',
    )

    return true
  } catch {
    return false
  }
}

/** Adds an entry identical to the current one, for the full view to go back from. */
export function pushMarker(history: HistoryWriter = window.history): boolean {
  try {
    history.pushState(history.state, '')

    return true
  } catch {
    return false
  }
}
