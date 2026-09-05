import { isoCountryCode } from './country'

// This tracks how much of the search results list is revealed. It is a presentation
// concern, so it stays out of `filtersToParams`/`filtersKey`/`activeFilterCount`, and
// out of the events query key (a count in the key would refetch per press). Unlike the
// filters and the sort, it is not in the URL. Paging is a reading position, not a
// destination, and a reload should start at the first page. It lives in
// `useResultsReveal` (`src/config/store.ts`), which is session-scoped — see the note
// there.
//
// The distance cut is a segment boundary here, not a filter. `getEvents` returns every
// match ranked by distance. `revealRows` splits that into a nearby segment and a
// distant one, and pages through the nearby segment first. Reaching the distant events
// takes an explicit press ("Show distant events"), which signposts that nearby events
// have run out. That press is the only distance affordance. There is deliberately no
// "< N km" pill, so the automatic cut is never mistaken for one of the user's own
// filters.

/** Events within this many km of the searched place are the "nearby" segment. */
export const NEARBY_KM = 300

/**
 * The nearby limit for an event in a different country from the searched one: half the
 * regular cut.
 *
 * Distance alone is a poor proxy for reachability across a border. Someone searching
 * Lille does not want Belgian and Dutch classes ahead of French ones 250 km away, and
 * the further out the ranking goes, the more of it is foreign. Halving the limit keeps
 * genuinely local cross-border results (a Basel search still reaches Germany), while
 * pushing the rest into the distant segment, where one press still reveals them.
 *
 * This applies only when both countries are known. An event with no address country
 * (every online event, and any in-person one the CMS left incomplete) is never demoted
 * on a fact we do not have.
 */
export const FOREIGN_NEARBY_KM = NEARBY_KM / 2

/** Rows revealed per press — also the first page. */
export const PAGE_SIZE = 25

/** The first page's row count — where every result set starts. */
export const DEFAULT_REVEAL = PAGE_SIZE

/**
 * A hard ceiling on the revealed count: 16 presses' worth of rows.
 *
 * The list renders every revealed row unvirtualized. Dropping the fetcher's nearest-50
 * slice left nothing bounding that. The count is session state now, not a URL param,
 * so no link can jump straight to a huge one. But the ceiling still matters. It is the
 * only thing standing between a long enough session and a commit that builds the whole
 * matching feed, inside somebody else's page.
 *
 * This answers two separate questions, kept apart because issue #98 conflated them,
 * and the measurements came out the other way round:
 *
 * **Why a ceiling at all: DOM hygiene in a page we do not own.** The old 1,000 rows
 * produced about 22,000 nodes, and 400 rows produce about 8,900. That budget is ours,
 * not an external standard. Lighthouse's DOM audit starts warning an order of
 * magnitude lower, and the product genuinely cannot take that.
 *
 * **Why 400: it is the deepest list actually profiled smooth,** rounded to a whole
 * page. The ticket set out to virtualize these rows, assuming mounted row count is
 * what makes a long list stutter. A profile in the real vaul drawer, at 6x CPU
 * throttle, over an identical 40px-per-frame scroll, disproved that:
 *
 *   - 331 rows / 7,331 DOM nodes, fully revealed:  median 8.3ms, p95 17.4ms, 0/100 frames >32ms
 *   -  50 rows / 1,079 DOM nodes, actively paging: median 38.4ms, p95 175ms, 71/100 frames >32ms
 *
 * Six times the DOM scrolled *better*. What costs is rendering a card, not owning one.
 * The janky frames were the `useTransition` reveal building the next page, and only 1
 * of the 71 coincided with the commit that grew the row count. A windowing virtualizer
 * re-renders cards as they enter the viewport, so it would pay that cost repeatedly on
 * every scroll, instead of once per row.
 *
 * The test checked that inference against the browser-native analogue, not against a
 * virtualizer. `content-visibility: auto` also defers per-row work to scroll-in, and it
 * made the same list worse (p95 36→59ms, worst frame 61→307ms — a noisier run whose own
 * plain baseline was 36ms, so compare inside that pair rather than against the 17.4ms
 * above). Different mechanism, same direction. So windowing here is a *likely*
 * regression, not a measured one, and the ticket's sanctioned fallback was used instead.
 *
 * **A matching set larger than the ceiling ends here.** The control disappears instead
 * of dead-ending, so it never lies about there being more. A ceiling must not end one
 * segment by ending the list. Applied to the combined count, it did exactly that, and
 * `MAX_NEARBY_REVEAL` below is the reserve that stops it. This number stays the bound
 * on `rows.length`, whichever segments are showing. That is the DOM promise, and the
 * ratchet in `reveal.test.ts` covers both constants, so neither can be given back
 * quietly.
 *
 * The real lever on the felt cost is the per-card render (`EventFacts` / `EventChips`
 * and their date formatting), which is a different ticket's surface.
 */
export const MAX_REVEAL = PAGE_SIZE * 16

/**
 * A ceiling on the nearby segment alone: 12 pages, applied only while there is a
 * distant segment to reserve the remaining 4 for.
 *
 * The two segments need separate budgets, because one combined clamp deletes a segment
 * instead of trimming a list (issue #129). With enough nearby matches to reach
 * `MAX_REVEAL` on their own, no press could add a distant row without dropping a
 * nearby one. So `more` went null, the control unmounted, and everything past the
 * distance boundary became unreachable for that search. Only the `sr-only` live
 * region acknowledged this, still counting to a total nothing could show. The nearby
 * segment auto-pages on scroll, so arriving there took no press at all.
 *
 * Reserving headroom fixes that **by construction, rather than by a special case**.
 * Nearby paging stops with budget still unspent, so the crossing press always has
 * room to reveal rows into. That is the same no-op-free property every other `next`
 * in this file has. This is why the reserve must be strict: `MAX_NEARBY_REVEAL <
 * MAX_REVEAL`, pinned in `reveal.test.ts`, since an equal pair silently reinstates
 * the bug.
 *
 * An undivided list — no searched place, or every match nearby — has no second
 * segment to reserve for. It keeps the whole budget, and behaves exactly as it did
 * before.
 *
 * The cost sits at the other end, and it is the honest trade. A search with more than
 * `MAX_NEARBY_REVEAL` nearby matches, and a distant segment, stops at 300 nearby
 * rows, not 400. Some tail is unreachable at any finite ceiling. This makes it the far
 * end of one segment, instead of the whole of the other.
 */
export const MAX_NEARBY_REVEAL = PAGE_SIZE * 12

/**
 * The identity of a result set, for `useResultsReveal`. A reveal belongs to the set it
 * was made against. When this changes — a new place, an edited filter, a re-sort, a
 * language switch — the stored count no longer describes anything, and the list goes
 * back to its first page. This value is derived, not reset imperatively, so no call
 * site that changes one of these inputs can forget to clear the reveal.
 *
 * This builds from the events query key, instead of re-deriving its parts, so the two
 * notions of "the same search" cannot drift. That key already quantizes the centre
 * (small map moves must not count as a new search), and folds in the filters and
 * locale. Only the sort has to be added. It reorders the fetched list, so it is
 * deliberately absent from the query key, but it does change which events the
 * revealed rows are.
 */
export const revealKey = (queryKey: readonly unknown[], sort: string): string =>
  // This uses `JSON.stringify`, not `join`. The key carries `filtersKey`, which embeds
  // raw URL values (a region slug, language tokens). Any separator those can contain
  // would let two different result sets collide on one key, and a collision hands one
  // search's reveal count to another. Structural encoding has no separator to forge.
  JSON.stringify([...queryKey, sort])

/**
 * The minimum an event needs for the distance segmentation below: its distance from
 * the search point, and the country it sits in. This type is structural, not
 * `EventSlim`, so this module stays free of the entity types, like the comparators in
 * `event.ts`.
 */
type Segmentable = { distance?: number; address?: { country?: string | null } | null }

/**
 * Which control the foot of the list should offer next.
 *
 * `'farther'` covers both reaching the distant segment and every page within it. Once
 * the reader has asked for distant events, everything further down the list is one.
 * So the button keeps saying so, instead of reverting to a bare "Show more" that would
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
   * The reveal state a press moves to. This is `null` exactly when `more` is, so the
   * caller cannot reach for a reveal the list is not offering. It always holds
   * strictly more rows than are on screen, so no press can be a no-op.
   */
  next: { shown: number; showAll: boolean } | null
  /**
   * Every match, across both segments, not just the one on screen. The list counts up
   * to this value ("showing 60 of 100"). It has to include the distant segment, or the
   * count reads "60 of 60" at the very moment the only control offers 40 more.
   */
  total: number
  /**
   * The boundary the empty state should name: the smallest limit actually applied, so
   * the sentence stays true. "No events within 300 km" is a lie when a cross-border
   * match sits at 200 km and the 150 km foreign limit is what excluded it. "Within
   * 150 km" holds either way, because an empty nearby segment means nothing cleared
   * either limit.
   */
  nearbyKm: number
}

/**
 * Slices the sorted matches to what is revealed, and works out what the button does
 * next.
 *
 * The order of operations is filter, then sort, then **segment, then slice**. The
 * caller sorts the full matching set (so `?sort=soonest` means soonest of the matches,
 * not of an arbitrary nearest-N). This function then splits the result into the
 * nearby segment and the far one, preserving that order within each. Paging is
 * clamped at the segment boundary, so a press can never roll silently past "nearby"
 * into events a thousand km away.
 *
 * Without a searched place (ranking from the map centre), there is no meaningful
 * distance cut, so everything is one segment.
 *
 * `searchCountry` (the geocoder's `?cc`) tightens the boundary to `FOREIGN_NEARBY_KM`
 * for events in another country. When it is absent — an ocean, a country-less
 * feature, a search that predates the param — every event is judged on distance alone.
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
  // This applies half the cut for an event across a border, the full cut otherwise.
  // Both countries must be known to demote anything. An event with no address country
  // (every online one) is judged on distance alone, instead of on a fact we do not
  // actually have.
  const limitFor = (event: T) => {
    // This uses `isoCountryCode`, like every other country consumer. The CMS address
    // field is a bare nullish string, so a malformed value (a 3-letter code, stray
    // whitespace) must degrade to "unknown", and be judged on distance alone, instead
    // of comparing as-is and demoting an event on a fact we do not actually have.
    const country = isoCountryCode(event.address?.country)

    return searchCountry && country && country !== searchCountry ? FOREIGN_NEARBY_KM : NEARBY_KM
  }
  // Online events carry no distance, so they are never distance-excluded.
  const isNear = (event: T) => event.distance === undefined || event.distance <= limitFor(event)
  const near = hasSearchCenter ? sorted.filter(isNear) : sorted
  const far = hasSearchCenter ? sorted.filter((event) => !isNear(event)) : []
  // This is the smallest limit any excluded event was held to. It is what the empty
  // state can name without lying (see `nearbyKm` on the return type).
  const nearbyKm = far.some((event) => limitFor(event) === FOREIGN_NEARBY_KM)
    ? FOREIGN_NEARBY_KM
    : NEARBY_KM

  // The nearby segment gets its own ceiling whenever something sits past the
  // boundary, so paging through it always stops with budget left for the crossing —
  // see `MAX_NEARBY_REVEAL`. With no distant segment, there is nothing to reserve
  // for, and the list keeps the full ceiling.
  const nearRevealable = far.length > 0 ? near.slice(0, MAX_NEARBY_REVEAL) : near

  // Before the distant segment is revealed, the list is the nearby one, so the slice
  // below clamps at the boundary for free. No press can overshoot it.
  const active = showAll ? [...nearRevealable, ...far] : nearRevealable
  // This clamps here, instead of at the call site, so the ceiling holds for every
  // caller.
  const rows = active.slice(0, Math.min(shown, MAX_REVEAL))

  // Everything below reasons about `rows.length`, what is actually on screen, never
  // the requested count. The two diverge whenever the nearby segment is shorter than
  // the count. A count of 99999 renders the 50 nearby matches, not `MAX_REVEAL` of
  // them (spelled as the constant, so this line cannot go stale when it moves).
  // Ceiling-gating on the raw count would then hide the control while a whole distant
  // segment sat unreached. This also keeps every `next` strictly greater than what is
  // shown, so no press can be a no-op.
  const revealed = rows.length
  // Every match, both segments. `near` and `far` partition `sorted`, so this is what
  // the list counts up to, whether or not the distant segment is showing yet.
  const total = sorted.length
  // Every match this list can put on screen: `total` less the nearby tail the reserve
  // holds back. This differs from `total`, because the two count different things.
  // The announcement counts matches, and `next` counts rows. This value is what keeps
  // a stored count describing rows that exist, instead of pointing past the end of
  // the list. It does not keep a press non-empty. `total` here would never produce a
  // no-op either, since `more` is null whenever `revealed` has reached it. The strict
  // reserve is what makes the crossing press non-empty, and it is the only thing
  // that does.
  const reachable = nearRevealable.length + far.length

  // Whether the active segment(s) have anything left. `false` does not mean the list
  // has ended. The crossing into the distant segment may still be on offer, and the
  // reserve above guarantees the ceiling has left room for it.
  const hasMoreActive = revealed < Math.min(active.length, MAX_REVEAL)
  // The one press that changes which segments are active. It is never automatic (see
  // `auto` in `DynamicEventsList`). The distance boundary is crossed on purpose.
  const crossing = !showAll && far.length > 0

  // Rows still to come. This reads `'farther'` once the distant segment is involved,
  // either because this press reaches it or because it is already showing and
  // everything below is distant. It reads `null` only when nothing is left that a
  // press could reveal. Offering a press the clamp would undo is the one thing worse
  // than stopping.
  const more: RevealMore | null = hasMoreActive
    ? showAll
      ? 'farther'
      : 'more'
    : crossing
      ? 'farther'
      : null

  return {
    rows,
    more,
    // Reaching the distant segment continues the count, instead of resetting it. The
    // rows already read stay on screen, and the distant ones append below them.
    next: more
      ? {
          shown: Math.min(revealed + PAGE_SIZE, reachable, MAX_REVEAL),
          showAll: showAll || more === 'farther',
        }
      : null,
    total,
    nearbyKm,
  }
}
