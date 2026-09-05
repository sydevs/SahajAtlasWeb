import { createContext, useContext } from 'react'

// These are the runtime axes the widget renders under. See issue #30.
//
//  - `standalone`: this is the standalone SPA build, BrowserRouter and `main.tsx`, versus the
//    embedded `<sahaj-atlas>` element, which uses query routing.
//    Canonical and `og:url` tags appear only in the standalone build. The widget's hash URLs are not canonical.
//    NOT every crawler directive the app emits gates on this flag.
//    The `noindex` directive from issue #106 ships from `index.html`, which the embed never serves,
//    and from `public/_headers`, which governs our OWN URLs, `embed.js` and its assets, but never a host page's document.
//    Both gate by construction, not at runtime, so this flag is not the whole answer to "what do we tell crawlers."
//  - `hasMap`: this is whether a Mapbox canvas renders. It defaults to true.
//    `map=false` omits the whole map subtree, and the `MapController` becomes a no-op.
//  - `linkable`: this is whether the route on screen can be handed to somebody else.
//    It is true for the standalone build, where the route is the pathname, and for embedded query or path routing, where it is `?atlas=` on the host's own URL.
//    It is false in memory mode.
//    `mountDecision`, in `lib/shape/routing.ts`, makes that call ONCE at mount, and `Widget.tsx` passes its answer down.
//    Nothing may re-derive it from `window.location`. A second reading is how the two drift. See issue #115.
//    This defaults to TRUE, so a component that never heard of this axis behaves as it always has.
//
//    **This flag is no longer for two things it used to warn about. See #154.**
//    `useShareUrl` no longer reads it.
//    It asks `useHrefFor`, in `config/routing.tsx`, instead.
//    A resolver that is `undefined` answers the same question, and it also resolves the EVENT's route, rather than whatever drawer the sharer was standing in.
//    The `Link` atom's hrefs are now correct everywhere the route is in a URL, because `createHref` returns an absolute host-origin URL.
//    That fixes the middle-click 404 that #92 recorded and #142 left open.
//    What remains is the honest residue: in memory mode, an in-widget href still resolves against the host origin.
//
// Live preview, issue #40, is NOT a mode axis.
// It is boot session-state, only ever in the standalone `/preview` iframe, never the web component.
// It lives in the `config/preview.ts` singleton, and code reads it directly where needed, such as in `config/api/auth.ts`.
export type WidgetMode = {
  standalone: boolean
  hasMap: boolean
  linkable: boolean
}

/**
 * This is what a subtree with no provider above it renders as: the embedded widget, with a map, whose route is in the URL.
 * Every axis defaults to the behavior that predates it.
 * So adding an axis cannot change how anything already rendered.
 */
export const DEFAULT_WIDGET_MODE: WidgetMode = { standalone: false, hasMap: true, linkable: true }

export const WidgetModeContext = createContext<WidgetMode>(DEFAULT_WIDGET_MODE)

export const useWidgetMode = () => useContext(WidgetModeContext)
