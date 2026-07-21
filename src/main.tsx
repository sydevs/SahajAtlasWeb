import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.tsx'
import atlasAuth from './config/api/auth'
import { installChunkRecovery } from './config/chunk-recovery'
import { capturePreview } from './config/preview'
import { initTheme } from './hooks/use-theme'

// Reload once if a lazy chunk vanishes mid-session (deploy happened underneath us).
installChunkRecovery()

const searchParams = new URLSearchParams(window.location.search)

if (!atlasAuth.apiKey) {
  atlasAuth.apiKey = searchParams.get('key') || import.meta.env.VITE_SAHAJCLOUD_API_KEY
}

// Iframe-friendly content-only mode: `?map=0` (or `?map=false`) renders without
// the Mapbox canvas. Default is the full map.
const hasMap = searchParams.get('map') !== '0' && searchParams.get('map') !== 'false'

// SahajCloud live-preview boot (issue #40): if the URL is `/preview?…`, capture
// collection/id/secret and scrub the secret from the address bar before React mounts
// (BrowserRouter snapshots window.location on mount). No-op on every other route, so
// normal standalone use is unaffected. `key`/`map` above are read first, off the
// original URL, so scrubbing the query string doesn't drop them.
capturePreview()

// Restore the persisted (or default) theme before first paint to avoid a flash.
initTheme()

ReactDOM.createRoot(document.getElementById('syatlas')!).render(
  <BrowserRouter>
    <App standalone apiKey={atlasAuth.apiKey} hasMap={hasMap} />
  </BrowserRouter>,
)
