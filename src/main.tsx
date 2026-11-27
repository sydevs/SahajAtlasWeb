import type { PaletteRoles } from './config/theme/palette'

import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { RoutingContext } from './config/routing'
import App from './App.tsx'
import atlasAuth from './config/api/auth'
import livePreview from './config/live-preview/protocol'
import { activateLivePreview, captureLivePreview } from './config/live-preview/boot'
import { startClientsPreview } from './config/live-preview/clients'
import { attributeEnabled } from './config/attributes'
import { bootApproxLocation } from './config/store'
import { initTheme } from './hooks/use-theme'
import { adoptStyles } from './styles/sheet'

// The embed's sheet is adopted by its shadow root, so the build stopped appending a
// `<style>` to `document.head` altogether (`styles/sheet.ts`). This shell has no shadow
// root — `<html>` is its theme root — so it adopts the same sink into its document.
// Before `initTheme()` and the render below, so nothing paints unstyled.
adoptStyles(document)

const searchParams = new URLSearchParams(window.location.search)

if (!atlasAuth.apiKey) {
  atlasAuth.apiKey = searchParams.get('key') || import.meta.env.VITE_SAHAJCLOUD_API_KEY
}

// Iframe-friendly content-only mode: `?map=0` (or `?map=false`) renders without
// the Mapbox canvas. Default is the full map.
const hasMap = attributeEnabled(searchParams.get('map'))

// The visitor's approximate location, the module the app Worker serves per visitor, as the
// loader imports it for an embed. A variable, so Vite leaves the import to the browser.
const GEO_MODULE = '/geo.js'

bootApproxLocation(import(/* @vite-ignore */ GEO_MODULE).then((module) => module.default))

// SahajCloud live-preview boot (issue #40). Synchronous, and deliberately only half the
// job: this stashes the token and takes it out of `location.href` before React mounts
// (BrowserRouter snapshots window.location then), and opens nothing. `key`/`map` above are
// read first, off the original URL, so the scrub cannot drop them. No-op on every other
// page load, which is all of them.
const livePreviewPending = captureLivePreview()

// Restore the persisted (or default) theme before first paint to avoid a flash.
initTheme()

/**
 * Is this the top document, or is it framed?
 *
 * **This build is the frame target** — the documented secondary delivery for hosts that cannot
 * run the loader (`docs/embedding.md`) — and framing changes two things below: where a link may
 * point, and whether a route is worth handing to anybody.
 *
 * A cross-origin parent can refuse the comparison itself, and that is framed too.
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
 * **Framed, the answer is `undefined`, and that is the whole contract rather than a gap.**
 * `HrefFor` (`config/routing.tsx`) is already `((route) => string) | undefined`, and
 * `useShareUrl` reads the absent resolver as "this route is not in a URL" and renders no share
 * block at all. That is the right answer here: `sahajatlas.com` is a by-product origin nobody
 * should be sent to, and a framed build has no other URL of its own.
 *
 * ⚠ An earlier version composed against the fallback base instead, which fabricated a URL on a
 * site that does not serve it: `new URL('/gb/london', 'https://wemeditate.com/map')` resolves to
 * `https://wemeditate.com/gb/london` — the `/map` segment is dropped, and that path 404s. It
 * swapped one dead-end share URL for another while looking like a fix.
 */
const hrefFor = topLevel
  ? (route: string) => new URL(route, window.location.origin).toString()
  : undefined

/**
 * Mount, once whatever has to be settled first is settled.
 *
 * ⚠ **The form decision is inside here because it reads the live-preview verdict**, and that
 * verdict does not exist until the verify resolves.
 */
function mount() {
  // A frame is an embed, so it opens inline, like the script embed does; opened directly, this
  // is the map-first page. ⚠ **A live-preview session is framed and stays map-first**: it is
  // SahajCloud's preview panel, where an editor checks the interface they are editing, and
  // "Expand map" would lead them off to another site.
  const inline = !topLevel && !livePreview.active

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
  // The root is kept, and a preview message re-renders through it with the new
  // `brand`. `BrandTheme` prefers the prop over the client record's colours, so a
  // manager's unsaved pick wins for as long as the session is open — and the map
  // follows, since `useBrandPalette` feeds `markerColors` and the layer factories.
  const root = ReactDOM.createRoot(document.getElementById('syatlas')!)
  const render = (brand?: PaletteRoles) =>
    root.render(
      <RoutingContext.Provider value={hrefFor}>
        <BrowserRouter>
          <App standalone apiKey={atlasAuth.apiKey} brand={brand} hasMap={hasMap} inline={inline} />
        </BrowserRouter>
      </RoutingContext.Provider>,
    )

  render()
  startClientsPreview(render)
}

// ⚠ **Nothing renders until the token has been proven.** `applyRequestContext` already fails
// closed on an unverified session, so this is not what makes the gate safe — it makes the gate
// unobservable, by leaving no window in which a component could mount, read `active` as false,
// and then never hear that it had become true. Activation never rejects, and on the
// overwhelmingly common path there is no token and no wait at all.
if (livePreviewPending) void activateLivePreview().then(mount, mount)
else mount()
