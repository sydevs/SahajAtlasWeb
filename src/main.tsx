import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { RoutingContext } from './config/routing'
import App from './App.tsx'
import atlasAuth from './config/api/auth'
import livePreview from './config/live-preview/protocol'
import { activateLivePreview, captureLivePreview } from './config/live-preview/boot'
import { attributeEnabled } from './config/attributes'
import { initTheme } from './hooks/use-theme'
import { reportIntegrationWarning } from './lib/report'
import { FULL_SLOT, decideSlot, framed } from './lib/slot-decision'

const searchParams = new URLSearchParams(window.location.search)

if (!atlasAuth.apiKey) {
  atlasAuth.apiKey = searchParams.get('key') || import.meta.env.VITE_SAHAJCLOUD_API_KEY
}

// Iframe-friendly content-only mode: `?map=0` (or `?map=false`) renders without
// the Mapbox canvas. Default is the full map.
const hasMap = attributeEnabled(searchParams.get('map'))

// SahajCloud live-preview boot (issue #40). Synchronous, and deliberately only half the
// job: this stashes the token and takes it out of the address bar before React mounts
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
 */
const topLevel = !framed()

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
 * ⚠ **The slot decision is inside here because it reads the live-preview verdict**, and that
 * verdict does not exist until the verify resolves.
 */
function mount() {
  // Does the interface fit? With no element to measure, the slot is the viewport — which for a
  // framed build is the frame. `fromPage: false` because a framed embed never auto-opens: its
  // button is an anchor to another document, and following it on mount would be a redirect
  // nobody asked for.
  //
  // ⚠ **A live-preview session skips the question entirely.** The slot is SahajCloud's preview
  // panel: framed, and free to be dragged under the 360×420 the interface needs. Asked, this
  // would answer `compact` — and a reviewer would get a one-button card where the document they
  // are editing should be, with the button leading off to another site. There is nowhere bigger
  // to offer an editor inside their own admin panel, so the premise of the whole decision is
  // absent. Cramped beats absent.
  const { compact, contained, warning } = livePreview.active
    ? FULL_SLOT
    : decideSlot({ element: null, hasMap, fromPage: false })

  if (warning) reportIntegrationWarning(warning)

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
          contained={contained}
          hasMap={hasMap}
        />
      </BrowserRouter>
    </RoutingContext.Provider>,
  )
}

// ⚠ **Nothing renders until the token has been proven.** `applyRequestContext` already fails
// closed on an unverified session, so this is not what makes the gate safe — it makes the gate
// unobservable, by leaving no window in which a component could mount, read `active` as false,
// and then never hear that it had become true. Activation never rejects, and on the
// overwhelmingly common path there is no token and no wait at all.
if (livePreviewPending) void activateLivePreview().then(mount, mount)
else mount()
