import { createContext, useContext } from 'react'

/**
 * This is how to turn a widget route into a URL a human can be given. See #154.
 *
 * This is a CONTEXT, not a field on `WidgetMode`.
 * `WidgetMode` is a plain data object that stories spread over, in `views/story-harness.tsx`, to vary one axis at a time.
 * Putting a closure in it would invite a story to restate the shape and silently drop the resolver.
 * Issue #115 recorded exactly that mistake, when a story flipped `standalone` by accident.
 *
 * `undefined` means the widget's route is not in a URL at all, memory mode, where there is honestly nothing to hand out.
 * Callers must render no link, rather than a wrong one. `shareableUrl` already follows this rule.
 */
export type HrefFor = ((route: string) => string) | undefined

export const RoutingContext = createContext<HrefFor>(undefined)

/**
 * This returns the absolute URL for a widget route, or `undefined` where there is none.
 *
 * This is what makes a widget route linkable from anywhere in the tree, without re-reading `window.location`.
 * A second reading is how `linkable` and the address bar drifted apart in the first place. See #115.
 */
export const useHrefFor = (): HrefFor => useContext(RoutingContext)
