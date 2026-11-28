/**
 * Where Back goes. The drawer stack is a pure function of the URL, but Back is history-aware:
 * every in-widget push stamps `location.state`, so Back steps back (`navigate(-1)`) through
 * in-widget history and climbs only for a fresh deep link, never popping the host page's own
 * history. Pure, with no react-router import, so the decision tests in isolation.
 */
import { filtersFromParams, filtersToParams, hasActiveFilters } from './filters'
import { ancestorIds, indexRegions } from './hierarchy'
import {
  type PlacePathOf,
  type StackEntry,
  parentOf,
  placedPathname,
  resolveStack,
  withQuery,
} from './path'

/**
 * The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). A
 * structural climb (dismissing a fresh deep link) carries only `climbedFrom`: the page it left.
 */
export type AtlasNavState = { depth?: number; from?: string; climbedFrom?: string }

// `state` is `unknown` at the react-router boundary, and may be anything a host page put there,
// so every member is read as possibly anything.
const navState = (location: { state?: unknown }): { [K in keyof AtlasNavState]?: unknown } =>
  typeof location.state === 'object' && location.state !== null ? location.state : {}

// A stamped route, or `undefined` when the stamp is missing or not a string.
const stamp = (location: { state?: unknown }, key: 'from' | 'climbedFrom'): string | undefined => {
  const value = navState(location)[key]

  return typeof value === 'string' ? value : undefined
}

/**
 * Whether the entry before this one is `route`'s page, whatever its query: then a link between
 * two sibling views (a place's list and its calendar) steps back to it rather than stacking it
 * again behind Back.
 */
export const cameFrom = (location: { state?: unknown }, route: string): boolean =>
  atlasDepth(location) > 0 && stamp(location, 'from')?.split('?')[0] === route.split('?')[0]

/**
 * The in-widget history depth carried on a location's `state`. A fresh deep link
 * (or any navigation we did not stamp) has no numeric depth, so it reads as 0.
 */
export const atlasDepth = (location: { state?: unknown }): number => {
  const { depth } = navState(location)

  return typeof depth === 'number' ? depth : 0
}

/**
 * The `state` to stamp on an in-widget push, shared by the Link atom and `useAtlasNavigate` so
 * the two cannot diverge: one level deeper, and `from`, where the push left (query included), so
 * Back can name the entry `navigate(-1)` lands on. History can be moved through, never read.
 * Pair it with `rememberCamera(location.key)` at click time: Link stamps `state` at render, but
 * can only capture the live camera on click.
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
 *   class again (the `singleEventPath` such a place carries).
 */
export const passablePlaces = (
  regions: readonly { id: number; slug: string; level?: string | null; parent?: number | null }[],
  classes: readonly { region: { id: number }; online: boolean }[],
): Set<string> => {
  const index = indexRegions(regions)
  // How many classes sit under each place, and which places hold an in-person one.
  const count = new Map<number, number>()
  const inPerson = new Set<number>()

  for (const item of classes) {
    for (const id of ancestorIds(index, item.region.id)) {
      count.set(id, (count.get(id) ?? 0) + 1)
      if (!item.online) inPerson.add(id)
    }
  }

  return new Set(
    regions
      .filter(
        (node) => node.level === 'venue' || (count.get(node.id) === 1 && inPerson.has(node.id)),
      )
      .map((node) => node.slug),
  )
}

/**
 * Where a fresh deep link climbs to (Back, swipe, Escape): the nearest place above that is
 * worth landing on (`passablePlaces`), along the place's real ancestry (`placedPathname`),
 * not the words typed in the address. With nothing known yet it is the structural parent.
 */
export const climbDestination = (pathname: string, { passable, pathOf }: ClimbInputs = {}) =>
  resolveStack(placedPathname(pathname, pathOf))
    .slice(0, -1)
    .reverse()
    .find((entry) => entry.kind !== 'region' || !passable?.has(entry.slug))?.path ?? '/'

/**
 * What Back does: where it lands, and how it gets there — a step back through in-widget history,
 * a climb (a push up the tree), or, for the filters, a replace of the filters' own entry.
 */
export type BackStep = { to: string; how: 'history' | 'climb' | 'replace' }

/** Whether two routes are the same page, with their query parameters in any order. */
export const sameRoute = (a: string, b: string): boolean => {
  const canonical = (route: string) => {
    const [path, query = ''] = route.split('?')
    const params = new URLSearchParams(query)

    params.sort()

    return `${path}?${params}`
  }

  return canonical(a) === canonical(b)
}

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
  const entries = resolveStack(location.pathname)

  if (entries.length === 0) return undefined
  if (entries.at(-1)?.kind === 'filters') {
    // Where closing the filters lands, by X, swipe or Esc alike. Every tap already wrote the URL, so
    // closing shows the answers rather than undoing them. Over the search or the calendar it returns
    // there with the query as it now stands. Over a view that lists no filtered classes, answers open
    // the search, scoped to the place the filters were opened over; with none, the filters close
    // like any other view.
    //
    // A step back says where it lands, query included, and the drawer rewrites the landed entry's
    // query where the answers changed it, so no stale results entry is left behind. Anything else
    // replaces the filters' own entry: Back from the results still leads to the view before the
    // filters, and a fresh link never takes the host page back.
    const { pathname, search = '' } = location
    const origin = parentOf(pathname) ?? '/'
    const params = new URLSearchParams(search)
    const filters = filtersFromParams(params)
    const listsFiltered = listsFilteredClasses(origin)
    const from = atlasDepth(location) > 0 ? stamp(location, 'from') : undefined
    const answered = listsFiltered || hasActiveFilters(filters)
    const to = answered
      ? withQuery(
          listsFiltered ? origin : '/search',
          listsFiltered
            ? params
            : filtersToParams(
                { ...filters, region: filters.region ?? pageRegion(pathname) },
                params,
              ),
        )
      : withQuery(origin, params)

    if (from && from.split('?')[0] === to.split('?')[0]) return { to, how: 'history' }
    if (answered) return { to, how: 'replace' }

    return { to: climbDestination(pathname, climb), how: 'climb' }
  }

  const from = stamp(location, 'from')

  if (atlasDepth(location) > 0 && from) return { to: from, how: 'history' }

  const parent = climbDestination(location.pathname, climb)

  // A search keeps its query when something stacked over it climbs back.
  return {
    to: parent === '/search' ? withQuery(parent, location.search ?? '') : parent,
    how: 'climb',
  }
}

// The class a route shows, or sits on (its Register or Share), by id: a class's own `webPath` and
// its place's path plus its id are two addresses for one class.
const classOf = (route: string): number | undefined =>
  resolveStack(route.split('?')[0])
    .reverse()
    .find((entry): entry is Extract<StackEntry, { kind: 'event' }> => entry.kind === 'event')?.id

/**
 * How this location was reached, for a place whose only class sits at `lone`. Such a place opens
 * that class, so leaving the class must never bounce back into it:
 *
 * - `'climbed'` — a structural climb (Back, swipe or Escape at depth 0) left the class or a place
 *   above it, so the place climbs on, as Back already said it would.
 * - `'back'` — a step back from the class, or from its Register or Share, so the place shows its
 *   own page.
 * - `undefined` — an arrival, a push from a place above included, so the place opens its class.
 */
export const loneClassExit = (
  location: { state?: unknown },
  lone: string,
): 'climbed' | 'back' | undefined => {
  const id = classOf(lone)
  const isLone = (route: string) => id !== undefined && classOf(route) === id
  const climbed = stamp(location, 'climbedFrom')?.split('?')[0]
  const from = stamp(location, 'from')

  if (climbed && (isLone(climbed) || lone.startsWith(`${climbed}/`))) return 'climbed'
  if (from && isLone(from)) return 'back'

  return undefined
}

/** Whether a view's own list is the filtered classes, so answers rewrite its query in place. */
export const listsFilteredClasses = (pathname: string): boolean =>
  pathname === '/search' || pathname === '/calendar'

/**
 * The region a path is about, or `null` off one: `/gb/south-east/london` → `london`.
 *
 * A trailing `filters` is stepped over, so a filter drawer is about the page under it —
 * `/gb/london/filters` → `london`. A region's own list does not reflect filters, so applying from
 * there lands on `/search`; without this as the starting scope that search would be worldwide,
 * and filtering "evenings" from the UK would list evenings everywhere.
 */
export const pageRegion = (pathname: string): string | null => {
  const entries = resolveStack(pathname)
  const entry = entries.at(-1)?.kind === 'filters' ? entries.at(-2) : entries.at(-1)

  return entry?.kind === 'region' ? entry.slug : null
}

/**
 * Whether clearing every filter on the results goes back to the place page they were opened from,
 * rather than leaving that place's unfiltered list. The first answer given on a place page opens
 * the results (`useFilterEditor`), so with that place still in scope and no place searched since
 * (`center`), clearing undoes that step.
 */
export const clearsBackToPlace = (
  location: { pathname: string; search?: string; state?: unknown },
  region: string | null,
): boolean => {
  const from = stamp(location, 'from')

  return (
    location.pathname === '/search' &&
    atlasDepth(location) > 0 &&
    from !== undefined &&
    region !== null &&
    pageRegion(from.split('?')[0]) === region &&
    !new URLSearchParams(location.search).has('center')
  )
}
