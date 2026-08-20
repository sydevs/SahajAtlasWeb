import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router'

import { RoutingContext } from './config/routing'
import App from './App.tsx'
import atlasAuth from './config/api/auth'
import { capturePreview } from './config/preview'
import { attributeEnabled } from './config/attributes'
import { initTheme } from './hooks/use-theme'
import { fallbackUrl } from './lib/fallback-url'
import { decideSlot } from './lib/slot-decision'
import { urlWritable } from './lib/url-writable'

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
 * Is this document allowed to write its own URL, and is it the top one?
 *
 * **This build is the frame target** — the documented secondary delivery for hosts that cannot
 * run the loader (`docs/embedding.md`) — so both answers change what is correct here, and
 * neither was being asked before (#161).
 */
const writable = urlWritable(window.history, window.location.href)
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
 *
 * `undefined` in memory mode is read by `useShareUrl` as "this route is not in a URL", so the
 * share block renders nothing rather than the wrong thing.
 */
const hrefFor = writable
  ? (route: string) => new URL(route, topLevel ? window.location.origin : fallbackUrl()).toString()
  : undefined

// Does the interface fit? With no element to measure, the slot is the viewport — which for a
// framed build is the frame. `fromPage: false` because a framed embed never auto-opens: its
// button is an anchor to another document, and following it on mount would be a redirect
// nobody asked for.
const { compact, warning } = decideSlot({ element: null, hasMap, fromPage: false })

if (warning) console.warn(`[sahaj-atlas] ${warning}`)

// A sandboxed frame (`allow-scripts` without `allow-same-origin`) and a `file://` document both
// refuse `pushState`, and the bare BrowserRouter this file used to mount would throw on the
// visitor's FIRST in-widget navigation rather than at boot — a live failure the frame delivery
// would have walked straight into.
const router = writable ? (
  <BrowserRouter>
    <App compact={compact} apiKey={atlasAuth.apiKey} hasMap={hasMap} linkable={topLevel} standalone />
  </BrowserRouter>
) : (
  <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
    <App compact={compact} apiKey={atlasAuth.apiKey} hasMap={hasMap} linkable={false} standalone />
  </MemoryRouter>
)

ReactDOM.createRoot(document.getElementById('syatlas')!).render(
  <RoutingContext.Provider value={hrefFor}>{router}</RoutingContext.Provider>,
)
