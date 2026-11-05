/**
 * In-widget history shaping. The drawer stack is a pure function of the URL, but
 * *dismissal* is history-aware: every in-widget push stamps an incrementing
 * `location.state.depth`, so closing a drawer can go chronologically back
 * (`navigate(-1)`) when in-widget history exists, and fall back to the structural
 * parent only for a fresh deep link. This is kept here (pure, no react-router
 * import), so the decision is unit-testable in isolation from the components
 * that apply it.
 */
import { type StackEntry, resolveStack } from './path'

/** The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). */
export type AtlasNavState = { depth?: number; from?: string }

/**
 * The in-widget history depth carried on a location's `state`. A fresh deep link
 * (or any navigation we did not stamp) has no numeric depth, so it reads as 0.
 * This reads defensively: `state` is `unknown` at the react-router boundary, and
 * may be anything a host page put there.
 */
export const atlasDepth = (location: { state?: unknown }): number => {
  const state = location.state as { depth?: unknown } | null | undefined

  return typeof state?.depth === 'number' ? state.depth : 0
}

/**
 * The `state` to stamp on an in-widget push: one level deeper than the current
 * entry. The single definition of the depth-stamp convention, shared by the Link
 * atom (declarative `state` prop) and `useAtlasNavigate` (imperative), so the two
 * paths cannot silently diverge. Pair it with `rememberCamera(location.key)` at
 * click time, so a later back restores the camera. That stays a separate call,
 * because Link stamps `state` at render but can only capture the live camera on click.
 *
 * `from` records where the push left, query included, so the Back button can name the
 * place `navigate(-1)` will land on. History itself cannot be read, only moved through.
 */
export const atlasPushState = (location: {
  state?: unknown
  pathname?: string
  search?: string
}): AtlasNavState => ({
  depth: atlasDepth(location) + 1,
  ...(location.pathname ? { from: `${location.pathname}${location.search ?? ''}` } : {}),
})

/**
 * Where Back goes from this location, as a route with its query: `undefined` at the root,
 * which has nothing to go back to. With in-widget history it is the entry that a
 * `navigate(-1)` lands on. A fresh deep link climbs to its structural parent instead, for
 * the same reason `dismissAction` does. This is the label's half of that decision, and the
 * two have to agree, so it reads the same inputs.
 */
export const backDestination = (location: {
  pathname: string
  search?: string
  state?: unknown
}): string | undefined => {
  const entries = resolveStack(location.pathname)

  if (entries.length === 0) return undefined

  const from = (location.state as { from?: unknown } | null | undefined)?.from

  if (atlasDepth(location) > 0 && typeof from === 'string') return from

  const parent = entries.at(-2)?.path ?? '/'

  // A search keeps its query when something stacked over it climbs back (see DrawerStack).
  return parent === '/search' ? `${parent}${location.search ?? ''}` : parent
}

/** One place in the breadcrumb line, always a link: the page itself is the heading's job. */
export type Crumb = Extract<StackEntry, { kind: 'region' | 'online' }>

const isPlace = (entry: StackEntry): entry is Crumb =>
  entry.kind === 'region' || entry.kind === 'online'

/**
 * The places a page sits inside, from the URL, and so the same however the visitor got
 * there: `/cz/jihlava/757` gives Czechia, Jihlava. The page itself is left to the heading. A
 * single place is nothing but the Back button's destination said twice, so that yields no
 * trail at all.
 */
export const breadcrumbTrail = (pathname: string): Crumb[] => {
  const entries = resolveStack(pathname)
  const top = entries.at(-1)
  const places = (top && isPlace(top) ? entries.slice(0, -1) : entries).filter(isPlace)

  return places.length < 2 ? [] : places
}

/** What dismissing the top drawer resolves to. */
export type DismissAction =
  | 'collapse' // the root view (no parent) — collapse the sheet to its peek
  | 'back' // in-widget history exists — go chronologically back (restores camera)
  | 'fallback' // a fresh deep link (depth 0) — climb to the structural parent

/**
 * Resolve the dismiss behaviour from whether a structural parent exists and the
 * current in-widget depth. `back` (never at depth 0) is what keeps the embedded
 * widget from navigating the *host page* away. At depth 0 there is no in-widget
 * entry to pop, so this climbs structurally instead.
 */
export const dismissAction = ({
  hasParent,
  depth,
}: {
  hasParent: boolean
  depth: number
}): DismissAction => {
  if (!hasParent) return 'collapse'

  return depth > 0 ? 'back' : 'fallback'
}
