import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { RoutingContext } from './config/routing'
import App from './App.tsx'
import atlasAuth from './config/api/auth'
import { capturePreview } from './config/preview'
import { attributeEnabled } from './config/attributes'
import { initTheme } from './hooks/use-theme'
import { fallbackUrl } from './lib/fallback-url'
import { decideSlot } from './lib/slot-decision'

const searchParams = new URLSearchParams(window.location.search)

if (!atlasAuth.apiKey) {
  atlasAuth.apiKey = searchParams.get('key') || import.meta.env.VITE_SAHAJCLOUD_API_KEY
}

// Iframe-friendly content-only mode: `?map=0` (or `?map=false`) renders without
// the Mapbox canvas. Default is the full map.
const hasMap = attributeEnabled(searchParams.get('map'))

// SahajCloud live-preview boot (issue #40): if the URL is `/preview?…`, capture
// collection/id/secret and scrub the secret from the address bar before React mounts
// (BrowserRouter snapshots window.location on mount). No-op on every other route, so
// normal standalone use is unaffected. `key`/`map` above are read first, off the
// original URL, so scrubbing the query string doesn't drop them.
capturePreview()

// Restore the persisted (or default) theme before first paint to avoid a flash.
initTheme()

/**
 * Is this the top document, or is it framed?
 *
 * **This build is the frame target** — the documented secondary delivery for hosts that cannot
 * run the loader (`docs/embedding.md`) — and framing changes two things below: where a link may
 * point, and whether a route is worth handing to anybody.
 */
const topLevel = (() => {
  try {
    return window.self === window.top
  } catch {
    return false
  }
})()

/**
 * Where a link to this route should point, or `undefined` when there is honestly nowhere.
 *
 * **Never this origin when framed.** `sahajatlas.com` is a by-product of the loader and the
 * frame — an asset host and a frame target, `noindex` on three layers and not a page anybody
 * should be sent to. Composing against `window.location.origin` inside a frame handed every
 * share sheet a `sahajatlas.com` URL whenever an event had no canonical of its own, which is
 * both a dead end for the visitor and the branding leak #158 exists to close.
 */
const hrefFor = (route: string) =>
  new URL(route, topLevel ? window.location.origin : fallbackUrl()).toString()

// Does the interface fit? With no element to measure, the slot is the viewport — which for a
// framed build is the frame. `fromPage: false` because a framed embed never auto-opens: its
// button is an anchor to another document, and following it on mount would be a redirect
// nobody asked for.
const { compact, warning } = decideSlot({ element: null, hasMap, fromPage: false })

if (warning) console.warn(`[sahaj-atlas] ${warning}`)

/**
 * `BrowserRouter`, unconditionally.
 *
 * An earlier draft of this file probed `history.replaceState` and fell back to a `MemoryRouter`
 * where it threw, on the belief that a sandboxed iframe refuses URL writes. **Measured in Chrome
 * 151, it does not** — a real `sandbox="allow-scripts"` frame has an opaque origin
 * (`localStorage` throws) and still permits `replaceState` and `pushState`. That left the probe
 * covering only `file://`, which is not a supported way to run this build: it has no origin for
 * the API to accept, no CORS, and no way to reach SahajCloud at all, so a widget there fails long
 * before its router does.
 *
 * A branch whose only remaining case is a configuration we do not support is a branch that is
 * never exercised and never right, so it is gone rather than kept as insurance.
 */
ReactDOM.createRoot(document.getElementById('syatlas')!).render(
  <RoutingContext.Provider value={hrefFor}>
    <BrowserRouter>
      <App
        standalone
        apiKey={atlasAuth.apiKey}
        compact={compact}
        hasMap={hasMap}
        linkable={topLevel}
      />
    </BrowserRouter>
  </RoutingContext.Provider>,
)
