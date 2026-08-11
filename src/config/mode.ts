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
//  - `linkable`: whether the route on screen can be handed to somebody else — true for
//    the standalone build (the route is the pathname) and for embedded hash routing (it's
//    the `#!` fragment), false in memory mode. `mountRoute` (`lib/shape/hash.ts`) makes
//    that decision ONCE at mount, when a host page arrives carrying its own anchor
//    (`#respond`), and `Widget.tsx` passes its answer down. Nothing may re-derive it from
//    `window.location` — a second reading is how the two drift (issue #115).
//    Default TRUE, so a component that never heard of the axis behaves as it always has.
//    Read it wherever a URL is put in front of a human: `useShareUrl` does, for the share
//    block and the calendar export. NOT yet read by the `Link` atom — in memory mode an
//    in-widget href still resolves against the host origin, so a middle-click opens a host
//    URL that probably 404s. That consequence is unaddressed (issue #92 recorded it), and
//    this flag is what a fix would consult.
//
// Live preview (issue #40) is NOT a mode axis: it's boot session-state (only ever the
// standalone /preview iframe, never the web-component), held in the config/preview.ts
// singleton and read directly where needed — like config/api/auth.ts.
export type WidgetMode = {
  standalone: boolean
  hasMap: boolean
  linkable: boolean
}

/**
 * What a subtree with no provider above it renders as: the embedded widget, with a map,
 * whose route is in the URL. Every axis defaults to the behaviour that predates it, so
 * adding one can't change how anything already rendered.
 */
export const DEFAULT_WIDGET_MODE: WidgetMode = { standalone: false, hasMap: true, linkable: true }

export const WidgetModeContext = createContext<WidgetMode>(DEFAULT_WIDGET_MODE)

export const useWidgetMode = () => useContext(WidgetModeContext)
