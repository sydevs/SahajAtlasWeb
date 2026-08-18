import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import { RoutingContext } from './config/routing'
import App from './App.tsx'
import atlasAuth from './config/api/auth'
import { capturePreview } from './config/preview'
import { attributeEnabled } from './config/attributes'
import { initTheme } from './hooks/use-theme'

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

// The standalone build's route IS the pathname, so its resolver is the trivial one — but it has
// to be PROVIDED, because `useShareUrl` reads the absence of a resolver as "this route is not in a
// URL". Without it every share screen here would offer no link.
const hrefFor = (route: string) => new URL(route, window.location.origin).toString()

ReactDOM.createRoot(document.getElementById('syatlas')!).render(
  <RoutingContext.Provider value={hrefFor}>
    <BrowserRouter>
      <App standalone apiKey={atlasAuth.apiKey} hasMap={hasMap} />
    </BrowserRouter>
  </RoutingContext.Provider>,
)
