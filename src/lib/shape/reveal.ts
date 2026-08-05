// How much of the search results list is revealed — a presentation concern, so it
// stays out of `filtersToParams`/`filtersKey`/`activeFilterCount` and out of the events
// query key (a count in the key would refetch per press). Unlike the filters and the
// sort it is NOT in the URL: paging is a reading position, not a destination, and a
// reload should start at the first page. It lives in `useResultsReveal`
// (`src/config/store.ts`), which is session-scoped — see the note there.
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

/** The first page's row count — where every result set starts. */
export const DEFAULT_REVEAL = PAGE_SIZE

/**
 * Hard ceiling on the revealed count — 40 presses' worth of rows.
 *
 * The list renders every revealed row unvirtualized, and dropping the fetcher's
 * nearest-50 slice left nothing bounding that. The count is session state now rather
 * than a URL param, so no link can jump straight to a huge one — but the ceiling stays:
 * it is the only thing standing between a long enough session and a commit that builds
 * the whole matching feed, inside somebody else's page.
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
 * The identity of a result set, for `useResultsReveal`. A reveal belongs to the set it
 * was made against; when this changes — a new place, an edited filter, a re-sort, a
 * language switch — the stored count no longer describes anything and the list is back
 * at its first page. Derived rather than reset imperatively, so no call site that
 * changes one of these inputs can forget to clear the reveal.
 */
export const revealKey = (parts: {
  latitude: number
  longitude: number
  filtersKey: string
  sort: string
  locale: string
}): string =>
  [
    parts.latitude.toFixed(2),
    parts.longitude.toFixed(2),
    parts.filtersKey,
    parts.sort,
    parts.locale,
  ].join('|')

/**
 * The minimum an event needs for the distance segmentation below — its distance from
 * the search point, and the country it sits in. Structural rather than `EventSlim` so
 * this module stays free of the entity types (like the comparators in `event.ts`).
 */
type Segmentable = { distance?: number; address?: { country?: string | null } | null }

/**
 * Which control the foot of the list should offer next.
 *
 * `'farther'` covers BOTH reaching the distant segment and every page within it: once
 * the reader has asked for distant events, everything further down the list is one, so
 * the button keeps saying so rather than reverting to a bare "Show more" that would
 * quietly stop describing what it fetches.
 */
export type RevealMore =
  /** More rows left in the nearby segment — "show more". */
  | 'more'
  /** Reaching, or paging through, the distant segment — "show distant events". */
  | 'farther'

export type Reveal<T> = {
  /** The rows to render — the revealed slice of the active segment(s). */
  rows: T[]
  /** What the button offers, or `null` when everything is revealed. */
  more: RevealMore | null
  /**
   * The reveal state a press moves to — `null` exactly when `more` is, so the caller
   * can't reach for a reveal the list isn't offering. Always strictly more rows than
   * are on screen, so no press can be a no-op.
   */
  next: { shown: number; showAll: boolean } | null
  /**
   * Every match, across BOTH segments — not just the one on screen. The list counts up
   * to it ("showing 60 of 100"), and it has to include the distant segment or the count
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
  // the count (a count of 99999 renders the 50 nearby matches, not 1000 rows), and
  // ceiling-gating on the raw count would then hide the control while a whole distant
  // segment sat unreached. It also keeps every `next` strictly greater than what's
  // shown, so no press can be a no-op.
  const revealed = rows.length
  // Rows the list could still reach — the distant segment included, since one press
  // brings it into `active`.
  const reachable = showAll ? active.length : near.length + far.length

  // Rows still to come; `'farther'` once the distant segment is involved, either
  // because this press reaches it or because it is already showing and everything
  // below is distant. At the ceiling the list has ended as far as this is concerned:
  // offering a press the clamp would undo is the one thing worse than stopping.
  const more: RevealMore | null =
    revealed >= MAX_REVEAL || revealed >= reachable
      ? null
      : showAll || revealed >= active.length
        ? 'farther'
        : 'more'

  return {
    rows,
    more,
    // Reaching the distant segment CONTINUES the count rather than resetting it — the
    // rows already read stay on screen and the distant ones append below them.
    next: more
      ? {
          shown: Math.min(revealed + PAGE_SIZE, reachable, MAX_REVEAL),
          showAll: showAll || more === 'farther',
        }
      : null,
    total: sorted.length,
  }
}
