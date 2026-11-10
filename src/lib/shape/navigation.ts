/**
 * In-widget history shaping. The drawer stack is a pure function of the URL, but
 * *dismissal* is history-aware: every in-widget push stamps an incrementing
 * `location.state.depth`, so closing a drawer can go chronologically back
 * (`navigate(-1)`) when in-widget history exists, and fall back to the structural
 * parent only for a fresh deep link. This is kept here (pure, no react-router
 * import), so the decision is unit-testable in isolation from the components
 * that apply it.
 */
import { type StackEntry, isCanonicalPath, placeInStack, resolveStack, safePath } from './path'

/**
 * The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). A
 * structural climb (closing a fresh deep link) carries only `climbedFrom`: the page it left.
 */
export type AtlasNavState = { depth?: number; from?: string; climbedFrom?: string }

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

/** A place's address as the region tree gives it, by slug (`webPath`, already `safePath`-checked). */
export type PlacePathOf = (slug: string) => string | undefined

/** Each place's own address, by slug, from the region tree. Undefined until the tree is cached. */
export const placePathsOf = (
  regions: readonly { slug: string; webPath?: string | null }[] | undefined,
): PlacePathOf | undefined => {
  if (!regions) return undefined

  const paths = new Map(regions.map((node) => [node.slug, safePath(node.webPath)]))

  return (slug) => paths.get(slug)
}

/**
 * The pathname with its deepest place's address swapped for the one the data gives that place.
 * A place resolves by its last slug alone, so a typed or old address such as
 * `/united-kingdom/south-east/london` still opens London, whose country is `gb`. Read straight
 * from the URL, the breadcrumb line would say "united-kingdom" and the climb would land on a page
 * that doesn't exist. The address bar is left as it is (#31 dropped canonicalizing redirects);
 * only what is named and linked above the page follows the data.
 */
export const placedPathname = (pathname: string, pathOf?: PlacePathOf): string => {
  const place = placeInStack(resolveStack(pathname))
  const real = place && pathOf?.(place.slug)

  return real && !isCanonicalPath(place.path, real)
    ? `${real}${pathname.slice(place.path.length)}`
    : pathname
}

/**
 * Where Back goes from this location, as a route with its query: `undefined` at the root,
 * which has nothing to go back to. With in-widget history it is the entry that a
 * `navigate(-1)` lands on. A fresh deep link climbs to its structural parent instead, for
 * the same reason `dismissAction` does. This is the label's half of that decision, and the
 * two have to agree, so it reads the same inputs.
 */
export const backDestination = (
  location: {
    pathname: string
    search?: string
    state?: unknown
  },
  classes?: readonly ClassPathLike[],
  venueSlugs?: ReadonlySet<string>,
  pathOf?: PlacePathOf,
): string | undefined => {
  const entries = resolveStack(location.pathname)

  if (entries.length === 0) return undefined

  const from = (location.state as { from?: unknown } | null | undefined)?.from

  if (atlasDepth(location) > 0 && typeof from === 'string') return from

  const parent = climbDestination(location.pathname, classes, venueSlugs, pathOf)

  // A search keeps its query when something stacked over it climbs back (see DrawerStack).
  return parent === '/search' ? `${parent}${location.search ?? ''}` : parent
}

/** A class as the climb reads it from the feed: its page path and whether it is online. */
export type ClassPathLike = { webPath?: string | null; eventType?: string | null }

/**
 * Where a fresh deep link climbs to (X, swipe, Escape, the Back row): the nearest place above that
 * is worth landing on. It passes over two kinds of place (Anton, 6 Nov):
 *
 * - a venue: a class page already names its venue ("Evening Meditation at Balham Library"), so
 *   "Back to Balham Library" read as going nowhere. Back goes to the city; the breadcrumb still
 *   offers the venue's own list.
 * - a place holding a single in-person class, which would only open that class again
 *   (`loneClassPath`).
 *
 * It climbs the place's real ancestry (`placedPathname`), not the words typed in the address.
 *
 * Without the feed and the region tree (not loaded yet) it is the structural parent, as before.
 */
export const climbDestination = (
  pathname: string,
  classes?: readonly ClassPathLike[],
  venueSlugs?: ReadonlySet<string>,
  pathOf?: PlacePathOf,
): string => {
  const entries = resolveStack(placedPathname(pathname, pathOf))
  let index = entries.length - 2

  while (index >= 0) {
    const entry = entries[index]

    if (entry.kind !== 'region') break

    const isVenue = venueSlugs?.has(entry.slug) ?? false
    const under = classes?.filter((item) => item.webPath?.startsWith(`${entry.path}/`))
    const isLone = under?.length === 1 && under[0].eventType !== 'online'

    if (!isVenue && !isLone) break
    index -= 1
  }

  return index >= 0 ? entries[index].path : '/'
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

/**
 * The one class a place holds, when that is all it holds: exactly one in-person class, no online
 * class, and no filter narrowing the list. Opening such a place opens that class instead, the same
 * shortcut the place's row already takes in a list (`singleEventPath`). A sole child place with
 * one class counts too: Luxembourg holds only the city of Luxembourg, which holds one class.
 */
export const loneClassPath = (
  region: {
    subregions: { singleEventPath?: string }[]
    events: { path: string }[]
    onlineEvents: unknown[]
  },
  filtered: boolean,
): string | undefined => {
  if (filtered || region.onlineEvents.length > 0) return undefined
  if (region.events.length === 0 && region.subregions.length === 1)
    return region.subregions[0].singleEventPath
  if (region.subregions.length === 0 && region.events.length === 1) return region.events[0].path

  return undefined
}

/**
 * Whether this location was reached by leaving `path`, or a place on the way down to it, upward:
 * Back, swipe or Escape (`climbedFrom`), or a breadcrumb or link (`from`). A place that opens its
 * lone class shows its own page then, so leaving the class can never bounce back into it, even
 * two levels up (class, then its city, then the country that holds only that city).
 */
export const cameUpFrom = (location: { state?: unknown }, path: string): boolean => {
  const state = location.state as { from?: unknown } | null | undefined

  return climbedUpFrom(location, path) || leadsTo(state?.from, path)
}

/**
 * The structural-climb half of `cameUpFrom`: X, swipe, Escape or Back on a fresh deep link. A
 * place reached this way from its lone class climbs on (a breadcrumb tap shows the page instead).
 */
export const climbedUpFrom = (location: { state?: unknown }, path: string): boolean =>
  leadsTo((location.state as { climbedFrom?: unknown } | null | undefined)?.climbedFrom, path)

// Whether `value` is `path` itself or a place on the way down to it, query ignored.
const leadsTo = (value: unknown, path: string): boolean => {
  if (typeof value !== 'string') return false
  const route = value.split('?')[0]

  return route === path || path.startsWith(`${route}/`)
}
