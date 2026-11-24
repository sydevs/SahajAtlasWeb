/**
 * In-widget history shaping. The drawer stack is a pure function of the URL, but Back is
 * history-aware: every in-widget push stamps an incrementing `location.state.depth`, so Back
 * can go chronologically back (`navigate(-1)`) when in-widget history exists, and climbs only
 * for a fresh deep link, never popping the host page's own history. This is kept here (pure,
 * no react-router import), so the decision is unit-testable in isolation from the components
 * that apply it.
 */
import { ancestorIds, indexRegions } from './hierarchy'
import { type PlacePathOf, placedPathname, resolveStack } from './path'

/**
 * The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). A
 * structural climb (dismissing a fresh deep link) carries only `climbedFrom`: the page it left.
 */
export type AtlasNavState = { depth?: number; from?: string; climbedFrom?: string }

// `state` is `unknown` at the react-router boundary, and may be anything a host page put there,
// so every member is read as possibly anything.
const navState = (location: { state?: unknown }): { [K in keyof AtlasNavState]?: unknown } =>
  typeof location.state === 'object' && location.state !== null ? location.state : {}

/**
 * The in-widget history depth carried on a location's `state`. A fresh deep link
 * (or any navigation we did not stamp) has no numeric depth, so it reads as 0.
 */
export const atlasDepth = (location: { state?: unknown }): number => {
  const { depth } = navState(location)

  return typeof depth === 'number' ? depth : 0
}

/**
 * The `state` to stamp on an in-widget push: one level deeper than the current
 * entry. The single definition of the depth-stamp convention, shared by the Link
 * atom (declarative `state` prop) and `useAtlasNavigate` (imperative), so the two
 * paths cannot silently diverge. Pair it with `rememberCamera(location.key)` at
 * click time, so a later back restores the camera. That stays a separate call,
 * because Link stamps `state` at render but can only capture the live camera on click.
 *
 * `from` records where the push left, query included, so Back can name the entry
 * `navigate(-1)` lands on: history itself can be moved through, never read.
 */
export const atlasPushState = (location: {
  state?: unknown
  pathname: string
  search: string
}): AtlasNavState => ({
  depth: atlasDepth(location) + 1,
  from: `${location.pathname}${location.search}`,
})

/** What a climb reads to pass over places (`climbDestination`). Every member may be missing. */
export type ClimbInputs = {
  /** Slugs a climb passes over: venues, and places holding a single in-person class. */
  passable?: ReadonlySet<string>
  /** Each place's own address, so a typed or old address climbs the real ancestry. */
  pathOf?: PlacePathOf
}

/**
 * The places a climb passes over:
 *
 * - a venue: a class page already names its venue ("Evening Meditation at Balham Library"),
 *   so "Back to Balham Library" reads as going nowhere. Back goes to the city instead.
 * - a place holding a single in-person class and nothing else, which would only open that
 *   class again (`loneClassPath`).
 */
export const passablePlaces = (
  regions: readonly { id: number; slug: string; level?: string | null; parent?: number | null }[],
  classes: readonly { region: { id: number }; online: boolean }[],
): Set<string> => {
  const index = indexRegions([...regions])
  const located = new Map<number, number>()
  const online = new Map<number, number>()

  for (const item of classes) {
    const tally = item.online ? online : located

    for (const id of ancestorIds(index, item.region.id)) tally.set(id, (tally.get(id) ?? 0) + 1)
  }

  return new Set(
    regions
      .filter(
        (node) => node.level === 'venue' || (located.get(node.id) === 1 && !online.has(node.id)),
      )
      .map((node) => node.slug),
  )
}

/**
 * Where a fresh deep link climbs to (Back, swipe, Escape): the nearest place above that is
 * worth landing on (`passablePlaces`), along the place's real ancestry (`placedPathname`),
 * not the words typed in the address. With nothing known yet it is the structural parent.
 */
export const climbDestination = (pathname: string, { passable, pathOf }: ClimbInputs = {}) => {
  const entries = resolveStack(placedPathname(pathname, pathOf))
  let index = entries.length - 2

  while (index >= 0) {
    const entry = entries[index]

    if (entry.kind !== 'region' || !passable?.has(entry.slug)) break
    index -= 1
  }

  return index >= 0 ? entries[index].path : '/'
}

/** What Back does: where it lands, and whether getting there is a step back in history. */
export type BackStep = { to: string; history: boolean }

/**
 * What Back does from this location, or `undefined` at the root, which has nothing to go back
 * to. With in-widget history it steps back to the entry the push stamped as `from`. Otherwise
 * (a fresh deep link, or an entry stamped before `from` existed) it climbs, so it can never
 * pop the host page's history. Back's label and its press both read this one answer.
 */
export const backStep = (
  location: { pathname: string; search?: string; state?: unknown },
  climb?: ClimbInputs,
): BackStep | undefined => {
  if (resolveStack(location.pathname).length === 0) return undefined

  const { from } = navState(location)

  if (atlasDepth(location) > 0 && typeof from === 'string') return { to: from, history: true }

  const parent = climbDestination(location.pathname, climb)

  // A search keeps its query when something stacked over it climbs back.
  return { to: parent === '/search' ? `${parent}${location.search ?? ''}` : parent, history: false }
}

/**
 * The one class a place holds, when that is all it holds: exactly one in-person class, no
 * online class, and no filter narrowing the list. Opening such a place opens that class, the
 * shortcut its row already takes in a list (`singleEventPath`). A sole child place with one
 * class counts too: Luxembourg holds only the city of Luxembourg, which holds one class.
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

// Whether `value` is `path` itself or a place on the way down to it, query ignored.
const leadsTo = (value: unknown, path: string): boolean => {
  if (typeof value !== 'string') return false
  const route = value.split('?')[0]

  return route === path || path.startsWith(`${route}/`)
}

/** Whether a structural climb (Back, swipe or Escape at depth 0) left `path` or a place above it. */
export const climbedUpFrom = (location: { state?: unknown }, path: string): boolean =>
  leadsTo(navState(location).climbedFrom, path)

/**
 * Whether this location was reached by leaving `path`, or a place on the way down to it: a
 * climb, or a history step back (`from`). A place that opens its lone class shows its own page
 * then, so leaving the class never bounces back into it, even two levels up.
 */
export const cameUpFrom = (location: { state?: unknown }, path: string): boolean =>
  climbedUpFrom(location, path) || leadsTo(navState(location).from, path)
