import type { EventSlim } from '@/types'

import { DateTime } from 'luxon'

import {
  byDistance,
  byNextOccurrence,
  isOnline,
  isSoon,
  isUnverified,
  nextOccurrence,
} from './event'

// The list sort order — a presentation concern, kept deliberately apart from the
// event filters. Filters are predicates (they change WHICH events show, so they key
// the events query and light the filter badge); sort only reorders the already-fetched
// list, so it stays out of `filtersToParams`/`filtersKey`/`matchesFilters`/
// `activeFilterCount` and lives under its own `?sort=` param. Both live in the URL so a
// shared link keeps its ordering.

/** The three list orderings offered by the sort menu, in display order. */
export type SortOrder = 'recommended' | 'closest' | 'soonest'

/** All orderings, in menu order — also the codec's allow-list. */
export const SORT_ORDERS: readonly SortOrder[] = ['recommended', 'closest', 'soonest']

/**
 * The default ordering, everywhere: the relevance score. A searched town opens on it too. Its
 * groups already put the town first, so within them the score is what adds language, timing and
 * verification to distance. Omitted from the URL.
 */
export const DEFAULT_SORT: SortOrder = 'recommended'

/** The URL query param the sort order serializes to (separate from the filter codec). */
export const SORT_PARAM = 'sort'

/** Decode `?sort=`, falling back to the default for anything unrecognized. */
export const sortFromParams = (params: URLSearchParams): SortOrder => {
  const value = params.get(SORT_PARAM)

  return SORT_ORDERS.includes(value as SortOrder) ? (value as SortOrder) : DEFAULT_SORT
}

/**
 * Write `order` into a copy of `base`, preserving every other param and omitting the
 * default so links stay clean (mirrors `filtersToParams`). Setting the default also
 * clears a stale `?sort=` left over from a previous selection.
 */
export const sortToParams = (order: SortOrder, base?: URLSearchParams): URLSearchParams => {
  const params = new URLSearchParams(base)

  if (order === DEFAULT_SORT) params.delete(SORT_PARAM)
  else params.set(SORT_PARAM, order)

  return params
}

/** The distance a class is ranked by. Placeless, and so online, classes have none. */
export type DistanceOf<T> = (event: T) => number | undefined

const ownDistance: DistanceOf<{ distance?: number }> = (event) => event.distance

/**
 * Recommended: the distance, weighted. These are the first Atlas's weights (3b807fb4), with the
 * unverified one from #221. Each multiplies, so a large enough gap in distance still wins:
 *
 *  - a language other than the map's: +100%
 *  - starting soon: -50% (online within the hour, in person within the week, `isSoon`)
 *  - online: +50%
 *  - unverified (no manager, brought in by bulk import): +50%
 *
 * A class with no distance counts as 100 km away.
 */
function calculateOrder(event: EventSlim, language: string, distance: number | undefined) {
  let order = distance ?? 100
  const online = isOnline(event)
  const languageCode = event.languages[0] ?? ''
  const next = nextOccurrence(event)

  if (language != languageCode) order *= 2
  if (next && isSoon(DateTime.fromJSDate(next), online)) order *= 0.5
  if (online) order *= 1.5
  // A factor, not a partition: a partition would outrank distance and language both.
  if (isUnverified(event)) order *= 1.5

  return order
}

// `recommended` uses decorate-sort-undecorate, so each event's order is computed
// once (it builds luxon DateTimes) instead of O(n·log n) times inside the
// comparator. The active language is an argument because this module stays free
// of React and i18n (`AGENTS.md`); the caller is already subscribed to it.
//
// This sorts the WHOLE matching set. That is the point of dropping the
// fetcher's nearest-50 cap (#85). Sorting a pre-truncated pool made
// `?sort=soonest` mean "soonest among the 50 nearest," and it re-ranked
// `recommended` over an arbitrary subset. The order of operations is filter,
// then group by place (`splitResults`, for a searched place), then sort within
// each group, then slice. `revealRows` owns the slice.
//
// `distanceOf` is what Closest and Recommended measure. A group outside a whole
// country measures from the country's own classes, not from its middle.
export function sortEvents<T extends EventSlim>(
  events: T[],
  order: SortOrder,
  language: string,
  distanceOf: DistanceOf<T> = ownDistance,
): T[] {
  switch (order) {
    case 'closest':
      // Classes at one address tie on distance, so the visitor's language decides between them.
      return [...events].sort(
        (x, y) =>
          byDistance({ distance: distanceOf(x) }, { distance: distanceOf(y) }) ||
          Number(y.languages[0] === language) - Number(x.languages[0] === language),
      )
    case 'soonest':
      return [...events].sort(byNextOccurrence)
    default:
      return events
        .map((event) => ({ event, order: calculateOrder(event, language, distanceOf(event)) }))
        .sort((a, b) => a.order - b.order)
        .map(({ event }) => event)
  }
}

/**
 * The order of the online group. Distance means nothing to a class you join from home, so unless
 * the visitor asked for Soonest, this falls back to the relevance score: their language, then soon.
 */
export const orderOnline = (online: EventSlim[], order: SortOrder, language: string): EventSlim[] =>
  sortEvents(online, order === 'soonest' ? 'soonest' : 'recommended', language)
