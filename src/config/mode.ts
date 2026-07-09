import { createContext, useContext } from 'react'

// The two runtime axes the widget renders under (issue #30):
//  - `standalone`: the standalone SPA build (BrowserRouter, main.tsx) vs. the
//    embedded <sahaj-atlas> element (HashRouter). Canonical/og:url tags are only
//    advertised in the standalone build — the widget's hash URLs are not canonical.
//  - `hasMap`: whether a Mapbox canvas renders (default true). map=false omits the
//    whole map subtree; the MapController is then a no-op.
export type WidgetMode = {
  standalone: boolean
  hasMap: boolean
}

export const WidgetModeContext = createContext<WidgetMode>({ standalone: false, hasMap: true })

export const useWidgetMode = () => useContext(WidgetModeContext)
