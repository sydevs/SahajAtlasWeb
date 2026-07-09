import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.tsx'
import atlasAuth from './config/api/auth'
import { initTheme } from './hooks/use-theme'

const searchParams = new URLSearchParams(window.location.search)

if (!atlasAuth.apiKey) {
  atlasAuth.apiKey = searchParams.get('key') || import.meta.env.VITE_SAHAJCLOUD_API_KEY
}

// Iframe-friendly content-only mode: `?map=0` (or `?map=false`) renders without
// the Mapbox canvas. Default is the full map.
const hasMap = searchParams.get('map') !== '0' && searchParams.get('map') !== 'false'

// Restore the persisted (or default) theme before first paint to avoid a flash.
initTheme()

ReactDOM.createRoot(document.getElementById('syatlas')!).render(
  <BrowserRouter>
    <App standalone apiKey={atlasAuth.apiKey} hasMap={hasMap} />
  </BrowserRouter>,
)
