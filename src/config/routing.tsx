import { createContext, useContext } from 'react'

/**
 * How to turn a widget route into a URL a human can be given (#154).
 *
 * A **context** rather than a field on `WidgetMode` because `WidgetMode` is a plain data object
 * that stories spread over (`views/story-harness.tsx`) to vary one axis at a time. Putting a
 * closure in it invites a story to restate the shape and silently drop the resolver — the exact
 * mistake report 115 recorded when a story flipped `standalone` by accident.
 *
 * `undefined` means the widget's route is not in a URL at all — memory mode, where there is
 * honestly nothing to hand out. Callers must render no link rather than a wrong one, which is the
 * rule `shareableUrl` already follows.
 */
export type HrefFor = ((route: string) => string) | undefined

export const RoutingContext = createContext<HrefFor>(undefined)

/**
 * The absolute URL for a widget route, or `undefined` where there is none.
 *
 * This is what makes a widget route linkable from anywhere in the tree without re-reading
 * `window.location` — a second reading being how `linkable` and the address bar drifted apart in
 * the first place (#115).
 */
export const useHrefFor = (): HrefFor => useContext(RoutingContext)
