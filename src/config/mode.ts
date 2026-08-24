import { createContext, useContext } from 'react'

// The runtime axes the widget renders under (issue #30):
//  - `standalone`: the standalone SPA build (BrowserRouter, main.tsx) vs. the
//    embedded <sahaj-atlas> element (query routing). Canonical/og:url tags are only
//    advertised in the standalone build — the widget's hash URLs are not canonical.
//    NOT every crawler directive the app emits is gated on this flag. The `noindex`
//    (issue #106) ships from index.html, which the embed never serves, and from
//    public/_headers, which governs our OWN URLs — embed.js and the assets included —
//    but never a host page's document. Both are gated by construction rather than at
//    runtime, so this flag is not the whole answer to "what do we tell crawlers".
//  - `hasMap`: whether a Mapbox canvas renders (default true). map=false omits the
//    whole map subtree; the MapController is then a no-op.
//  - `linkable`: whether the route on screen can be handed to somebody else — true for the
//    standalone build (the route is the pathname) and for embedded query OR path routing (it's `?atlas=`
//    on the host's own URL), false in memory mode. `mountDecision` (`lib/shape/routing.ts`) makes
//    that call ONCE at mount and `Widget.tsx` passes its answer down. Nothing may re-derive it
//    from `window.location` — a second reading is how the two drift (issue #115).
//    Default TRUE, so a component that never heard of the axis behaves as it always has.
//
//    **What it is NOT for any more (#154).** Two of the three things this flag used to warn about
//    are gone. `useShareUrl` no longer reads it: it asks `useHrefFor` (`config/routing.tsx`)
//    instead, because a resolver that is `undefined` answers the same question and additionally
//    resolves the EVENT's route rather than whatever drawer the sharer was standing in. And the
//    `Link` atom's hrefs are now correct everywhere the route is in a URL, because `createHref`
//    returns an absolute host-origin URL — the middle-click 404 that #92 recorded and #142 left
//    open. What remains is the honest residue: in memory mode an in-widget href still resolves
//    against the host origin.
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
