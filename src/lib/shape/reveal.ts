// How much of the search results list is revealed — a presentation concern, kept
// beside the sort codec for the same reason: it only decides how much of the
// already-fetched, already-sorted set is rendered, so it stays out of
// `filtersToParams`/`filtersKey`/`activeFilterCount` and out of the events query key
// (a count in the key would refetch per press). Both params live in the URL so the
// reveal survives the drawer stack's remount-on-navigation and is linkable.
//
// The distance cut is a SEGMENT BOUNDARY here, not a filter. `getEvents` returns every
// match ranked by distance; `revealRows` splits that into a nearby segment and a distant
// one, and pages through the nearby segment first. Reaching the distant events takes an
// explicit press ("Show distant events"), which is what signposts that nearby events
// have run out. That press is the ONLY distance affordance — there is deliberately no
// "< N km" pill, so the automatic cut is never mistaken for one of the user's own
// filters.

/** Events within this many km of the searched place are the "nearby" segment. */
export const NEARBY_KM = 300

/**
 * The nearby limit for an event in a DIFFERENT country from the searched one — half
 * the regular cut.
 *
 * Distance alone is a poor proxy for reachability across a border: someone searching
 * Lille does not want Belgian and Dutch classes ahead of French ones 250 km away, and
 * the further out the ranking goes the more of it is foreign. Halving the limit keeps
 * genuinely-local cross-border results (a Basel search still reaches Germany) while
 * pushing the rest into the distant segment, where one press still reveals them.
 *
 * Only applied when BOTH countries are known: an event with no address country (every
 * online event, and any in-person one the CMS left incomplete) is never demoted on a
 * fact we don't have.
 */
export const FOREIGN_NEARBY_KM = NEARBY_KM / 2

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

/**
 * Hard ceiling on the revealed count — 40 presses' worth of rows.
 *
 * The list renders every revealed row unvirtualized, and dropping the fetcher's
 * nearest-50 slice left nothing bounding that: `?shown=999999` would build the whole
 * matching feed in one commit. Reachable by hand too (press 40× and you're here), but
 * a crafted link gets there in one navigation, and this widget renders inside somebody
 * else's page — the freeze would be theirs.
 *
 * The tradeoff, taken deliberately: a matching set larger than this genuinely ends
 * here. That's the very shape of cap this issue removed, so the ceiling is set far
 * above any plausible search (the whole global feed is a few thousand events, and a
 * ranked list nobody scrolls past row 50 of does not need row 1001) — and the control
 * disappears at the ceiling rather than dead-ending, so it never lies about there
 * being more.
 */
export const MAX_REVEAL = PAGE_SIZE * 40

/**
 * Decode `?shown=`, falling back to one page for anything unparseable or too small and
 * clamping at `MAX_REVEAL`. Both bounds are enforced HERE rather than at the render, so
 * a hand-edited count can't reach `revealRows` at all.
 */
export const revealFromParams = (params: URLSearchParams): number => {
  const value = Number(params.get(REVEAL_PARAM))

  return Number.isFinite(value) && value > DEFAULT_REVEAL
    ? Math.min(Math.floor(value), MAX_REVEAL)
    : DEFAULT_REVEAL
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

/**
 * The minimum an event needs for the distance segmentation below — its distance from
 * the search point, and the country it sits in. Structural rather than `EventSlim` so
 * this module stays free of the entity types (like the comparators in `event.ts`).
 */
type Segmentable = { distance?: number; address?: { country?: string | null } | null }

/** Which control the foot of the list should offer next. */
export type RevealMore =
  /** More rows left in the segment on screen — "show more". */
  | 'more'
  /** Nearby matches exhausted, distant ones exist — "show distant events". */
  | 'farther'

export type Reveal<T> = {
  /** The rows to render — the revealed slice of the active segment(s). */
  rows: T[]
  /** What the button offers, or `null` when everything is revealed. */
  more: RevealMore | null
  /**
   * What the next press writes to the URL — `null` exactly when `more` is, so the
   * caller can't reach for a reveal the list isn't offering.
   */
  next: { shown: number; showAll: boolean } | null
  /**
   * Every match, across BOTH segments — not just the one on screen. The list counts up
   * to it ("showing 60 of 100"), and it has to include the far segment or the count
   * reads "60 of 60" at the very moment the only control offers 40 more.
   */
  total: number
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
 *
 * `searchCountry` (the geocoder's `?cc`) tightens the boundary to `FOREIGN_NEARBY_KM`
 * for events in another country. Absent — an ocean, a country-less feature, a search
 * that predates the param — every event is judged on distance alone.
 */
export function revealRows<T extends Segmentable>(
  sorted: T[],
  {
    shown,
    showAll,
    hasSearchCenter,
    searchCountry,
  }: { shown: number; showAll: boolean; hasSearchCenter: boolean; searchCountry?: string },
): Reveal<T> {
  // Half the cut for an event across a border, the full cut otherwise. Both countries
  // have to be known to demote anything: an event with no address country (every online
  // one) is judged on distance alone rather than on a fact we don't have.
  const limitFor = (event: T) => {
    const country = event.address?.country

    return searchCountry && country && country.toUpperCase() !== searchCountry.toUpperCase()
      ? FOREIGN_NEARBY_KM
      : NEARBY_KM
  }
  // Online events carry no distance, so they are never distance-excluded.
  const isNear = (event: T) => event.distance === undefined || event.distance <= limitFor(event)
  const near = hasSearchCenter ? sorted.filter(isNear) : sorted
  const far = hasSearchCenter ? sorted.filter((event) => !isNear(event)) : []

  // Before the distant segment is revealed the list IS the nearby one, so the slice
  // below clamps at the boundary for free — no press can overshoot it.
  const active = showAll ? [...near, ...far] : near
  // Re-clamped here, not just in the decoder, so the ceiling holds for every caller.
  const rows = active.slice(0, Math.min(shown, MAX_REVEAL))

  // Everything below reasons about `rows.length` — what is actually ON SCREEN — never
  // the requested count. The two diverge whenever the nearby segment is shorter than
  // the count (`?shown=99999` renders the 50 nearby matches, not 1000 rows), and
  // ceiling-gating on the raw count would then hide the control while a whole distant
  // segment sat unreached. It also keeps every `next` strictly greater than what's
  // shown, so no press can be a no-op.
  const revealed = rows.length

  // Rows still to come in the segment on screen; else the crossing, if there's a
  // distant segment to reach; else the list has genuinely ended. At the ceiling it has
  // ended as far as this list is concerned: offering a press that the clamp would undo
  // on read is the one thing worse than stopping.
  const more: RevealMore | null =
    revealed >= MAX_REVEAL
      ? null
      : revealed < active.length
        ? 'more'
        : !showAll && far.length > 0
          ? 'farther'
          : null

  return {
    rows,
    more,
    // The crossing CONTINUES the count rather than resetting it — the rows already
    // read stay on screen and the distant ones append below them.
    next:
      more === 'more'
        ? { shown: Math.min(revealed + PAGE_SIZE, active.length, MAX_REVEAL), showAll }
        : more === 'farther'
          ? { shown: Math.min(revealed + PAGE_SIZE, MAX_REVEAL), showAll: true }
          : null,
    total: sorted.length,
  }
}
