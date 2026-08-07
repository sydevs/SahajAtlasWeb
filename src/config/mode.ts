import { createContext, useContext } from 'react'

// The runtime axes the widget renders under (issue #30):
//  - `standalone`: the standalone SPA build (BrowserRouter, main.tsx) vs. the
//    embedded <sahaj-atlas> element (HashRouter). Canonical/og:url tags are only
//    advertised in the standalone build — the widget's hash URLs are not canonical.
//    NOT every crawler directive the app emits is gated on this flag. The `noindex`
//    (issue #106) ships from index.html, which the embed never serves, and from
//    public/_headers, which governs our OWN URLs — embed.js and the assets included —
//    but never a host page's document. Both are gated by construction rather than at
//    runtime, so this flag is not the whole answer to "what do we tell crawlers".
//  - `hasMap`: whether a Mapbox canvas renders (default true). map=false omits the
//    whole map subtree; the MapController is then a no-op.
//
// Live preview (issue #40) is NOT a mode axis: it's boot session-state (only ever the
// standalone /preview iframe, never the web-component), held in the config/preview.ts
// singleton and read directly where needed — like config/api/auth.ts.
export type WidgetMode = {
  standalone: boolean
  hasMap: boolean
}

export const WidgetModeContext = createContext<WidgetMode>({ standalone: false, hasMap: true })

export const useWidgetMode = () => useContext(WidgetModeContext)
