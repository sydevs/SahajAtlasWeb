// How much of the search results list is revealed — a presentation concern, kept
// beside the sort codec for the same reason: it only decides how much of the
// already-fetched, already-sorted set is rendered, so it stays out of
// `filtersToParams`/`filtersKey`/`activeFilterCount` and out of the events query key
// (a count in the key would refetch per press). Both params live in the URL so the
// reveal survives the drawer stack's remount-on-navigation and is linkable.
//
// The "< NEARBY_KM" cut is a SEGMENT BOUNDARY here, not a filter. `getEvents` returns
// every match ranked by distance; `revealRows` splits that into a nearby segment and a
// far one, and pages through the nearby segment first. Crossing into the far segment
// takes an explicit press ("show events farther than N km"), which is what signposts
// that nearby events have run out. That press is the ONLY distance affordance — there
// is deliberately no "< N km" pill, so the automatic distance cut is never mistaken
// for one of the user's own filters.

/** Events within this many km of the searched place are the "nearby" segment. */
export const NEARBY_KM = 500

/** Rows revealed per press — also the first page. */
export const PAGE_SIZE = 25

/** The URL query param the revealed row count serializes to. */
export const REVEAL_PARAM = 'shown'

/**
 * The far-segment flag. Kept as its own param rather than derived from the revealed
 * count: a search with fewer nearby matches than one page (12 nearby, 300 far) would
 * have its default count already "past" the boundary, and the far events would reveal
 * themselves with no press. It predates this codec as the pill's dismissal (`?all=1`).
 */
export const SHOW_ALL_PARAM = 'all'

/** The first page's row count; omitted from the URL. */
export const DEFAULT_REVEAL = PAGE_SIZE

/** Decode `?shown=`, falling back to one page for anything unparseable or too small. */
export const revealFromParams = (params: URLSearchParams): number => {
  const value = Number(params.get(REVEAL_PARAM))

  return Number.isFinite(value) && value > DEFAULT_REVEAL ? Math.floor(value) : DEFAULT_REVEAL
}

/** Decode `?all=1` — whether the far segment has been revealed. */
export const showAllFromParams = (params: URLSearchParams): boolean =>
  params.get(SHOW_ALL_PARAM) === '1'

/**
 * Write the revealed count (and the far-segment flag) into a copy of `base`, preserving
 * every other param and omitting the first-page default so links stay clean (mirrors
 * `sortToParams`). Passing the default also clears a stale count from a previous reveal.
 */
export const revealToParams = (
  shown: number,
  showAll: boolean,
  base?: URLSearchParams,
): URLSearchParams => {
  const params = new URLSearchParams(base)

  if (shown > DEFAULT_REVEAL) params.set(REVEAL_PARAM, String(shown))
  else params.delete(REVEAL_PARAM)

  if (showAll) params.set(SHOW_ALL_PARAM, '1')
  else params.delete(SHOW_ALL_PARAM)

  return params
}

/**
 * Drop the reveal back to the first page. Needed wherever a setter copies the current
 * params wholesale (`useSetFilters`, `useSetSortOrder`) — a change to WHICH events show,
 * or to their order, makes the previous count meaningless. A new place search doesn't
 * need this: `preserveSearchState` re-encodes from an empty base, so both params go.
 */
export const resetReveal = (params: URLSearchParams): URLSearchParams =>
  revealToParams(DEFAULT_REVEAL, false, params)

/** The minimum an event needs for the distance segmentation below. */
type Distanced = { distance?: number }

/** Which control the foot of the list should offer next. */
export type RevealMore =
  /** More rows left in the segment on screen — "show more". */
  | 'more'
  /** Nearby matches exhausted, far ones exist — "show events farther than N km". */
  | 'farther'

export type Reveal<T> = {
  /** The rows to render — the revealed slice of the active segment(s). */
  rows: T[]
  /** What the button offers, or `null` when everything is revealed. */
  more: RevealMore | null
  /** The count to write to the URL on the next press (`null` when there is none). */
  nextShown: number | null
  /** Whether that press also has to reveal the far segment. */
  nextShowAll: boolean
  /** Every row reachable in the current segment(s) — what `rows.length` counts up to. */
  total: number
  /** True when the nearby segment is empty but far matches exist (the empty-state CTA). */
  onlyFar: boolean
}

/**
 * Slice the sorted matches to what's revealed, and work out what the button does next.
 *
 * Order of operations is filter → sort → **segment → slice**: the caller sorts the FULL
 * matching set (so `?sort=soonest` means soonest of the matches, not of an arbitrary
 * nearest-N), and this splits the result into the nearby segment and the far one,
 * preserving that order within each. Paging is clamped at the segment boundary, so a
 * press can never roll silently past "nearby" into events a thousand km away.
 *
 * Without a searched place (ranking from the map centre) there is no meaningful
 * distance cut, so everything is one segment.
 */
export function revealRows<T extends Distanced>(
  sorted: T[],
  {
    shown,
    showAll,
    hasSearchCenter,
  }: { shown: number; showAll: boolean; hasSearchCenter: boolean },
): Reveal<T> {
  // Online events carry no distance, so they are never distance-excluded.
  const isNear = (event: T) => event.distance === undefined || event.distance <= NEARBY_KM
  const near = hasSearchCenter ? sorted.filter(isNear) : sorted
  const far = hasSearchCenter ? sorted.filter((event) => !isNear(event)) : []

  // Before the far segment is revealed the list IS the nearby one, so the slice below
  // clamps at the boundary for free — no press can overshoot it.
  const active = showAll ? [...near, ...far] : near
  const rows = active.slice(0, shown)
  const onlyFar = near.length === 0 && far.length > 0

  if (rows.length < active.length) {
    return {
      rows,
      more: 'more',
      nextShown: Math.min(shown + PAGE_SIZE, active.length),
      nextShowAll: showAll,
      total: active.length,
      onlyFar,
    }
  }

  // The nearby segment is exhausted. Offer the far one, continuing the count rather
  // than resetting it — the rows already read stay on screen and the new ones append.
  if (!showAll && far.length > 0) {
    return {
      rows,
      more: 'farther',
      nextShown: near.length + PAGE_SIZE,
      nextShowAll: true,
      total: active.length,
      onlyFar,
    }
  }

  return { rows, more: null, nextShown: null, nextShowAll: showAll, total: active.length, onlyFar }
}
