import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REVEAL,
  FOREIGN_NEARBY_KM,
  MAX_NEARBY_REVEAL,
  MAX_REVEAL,
  NEARBY_KM,
  PAGE_SIZE,
  revealKey,
  revealRows,
} from '@/lib/shape'

type TestEvent = { distance?: number; id: string; address?: { country?: string | null } | null }

/** `n` events at `km` from the search centre, tagged so order is checkable. */
const at = (km: number | undefined, n: number, tag = '', country?: string): TestEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    distance: km,
    id: `${tag}${i}`,
    ...(country ? { address: { country } } : {}),
  }))

const near = (n: number, tag = 'n') => at(10, n, tag)
const far = (n: number, tag = 'f') => at(NEARBY_KM + 1, n, tag)

const reveal = (
  events: TestEvent[],
  options: Partial<{
    shown: number
    showAll: boolean
    hasSearchCenter: boolean
    searchCountry: string
  }> = {},
) =>
  revealRows(events, {
    shown: DEFAULT_REVEAL,
    showAll: false,
    hasSearchCenter: true,
    ...options,
  })

type RevealState = [TestEvent[], { shown: number; showAll: boolean }]

/**
 * The cross-product both property tests below sweep: result-set shape × `showAll` ×
 * count. ONE matrix rather than one each, because both properties are universal — a
 * shape added for either is worth checking against the other, and the two lists had
 * already drifted apart by a count. The shapes are the segment mixes around the two
 * ceilings, including the #129 case (a nearby segment past the ceiling with distant
 * events behind it).
 */
const everyReachableState = (): RevealState[] => {
  const sets = [
    near(30),
    [...near(30), ...far(30)],
    far(30),
    [...near(1), ...far(400)],
    near(MAX_REVEAL + 100),
    far(MAX_REVEAL + 100),
    [...near(MAX_REVEAL + 10), ...far(50)],
    [...near(MAX_REVEAL + 100), ...far(MAX_REVEAL + 100)],
    [...near(MAX_NEARBY_REVEAL), ...far(MAX_REVEAL)],
  ]
  const states: RevealState[] = []

  for (const events of sets) {
    for (const showAll of [false, true]) {
      for (const shown of [DEFAULT_REVEAL, 40, MAX_NEARBY_REVEAL, MAX_REVEAL, 999999]) {
        states.push([events, { shown, showAll }])
      }
    }
  }

  return states
}

describe('revealKey', () => {
  // Shaped like a real `eventsQuery` key: ['events', lat, lng, filtersKey, locale].
  const queryKey = ['events', '51.51', '-0.13', 'format=offline', 'en'] as const

  it('is stable for the same query key and sort', () => {
    expect(revealKey(queryKey, 'soonest')).toBe(revealKey([...queryKey], 'soonest'))
  })

  it('changes with anything the events query key changes', () => {
    // Centre, filters and locale all reach it through the query key — which is the
    // point of deriving from that key rather than re-listing its parts here.
    for (const changed of [
      ['events', '48.85', '-0.13', 'format=offline', 'en'],
      ['events', '51.51', '2.35', 'format=offline', 'en'],
      ['events', '51.51', '-0.13', 'format=online', 'en'],
      ['events', '51.51', '-0.13', 'format=offline', 'fr'],
    ]) {
      expect(revealKey(changed, 'soonest')).not.toBe(revealKey(queryKey, 'soonest'))
    }
  })

  it('cannot be collided by a separator smuggled through the filters', () => {
    // `filtersKey` embeds raw URL values (a region slug, language tokens), so a joined
    // key could be forged: `['a|b', 'c']` and `['a', 'b|c']` join identically. A
    // collision hands one search's reveal count to another.
    expect(revealKey(['events', 'a|b', 'c'], 'recommended')).not.toBe(
      revealKey(['events', 'a', 'b|c'], 'recommended'),
    )
  })

  it('changes with the sort, which the query key deliberately omits', () => {
    // Sort reorders the fetched list rather than refetching, so it is absent from the
    // query key — but it changes which events the revealed rows ARE, so the reveal has
    // to reset on it. That's the one part `revealKey` adds.
    expect(revealKey(queryKey, 'closest')).not.toBe(revealKey(queryKey, 'soonest'))
  })
})

describe('revealRows', () => {
  it('reveals one page and offers more when matches remain', () => {
    const result = reveal(near(60))

    expect(result.rows).toHaveLength(PAGE_SIZE)
    expect(result.more).toBe('more')
    expect(result.next).toEqual({ shown: PAGE_SIZE * 2, showAll: false })
    expect(result.total).toBe(60)
  })

  it('offers nothing when one page covers every match', () => {
    const result = reveal(near(10))

    expect(result.rows).toHaveLength(10)
    expect(result.more).toBeNull()
    expect(result.next).toBeNull()
  })

  it('offers nothing for an empty result set', () => {
    const result = reveal([])

    expect(result.rows).toEqual([])
    expect(result.more).toBeNull()
    expect(result.next).toBeNull()
  })

  it('preserves the order it is given — it segments, it does not re-sort', () => {
    const sorted = [...near(2, 'n'), ...far(2, 'f')]
    const result = reveal(sorted, { shown: 100, showAll: true })

    expect(result.rows.map((event) => event.id)).toEqual(['n0', 'n1', 'f0', 'f1'])
  })

  it('clamps the last nearby page at the boundary rather than rolling into far events', () => {
    // 30 nearby: the second page would run to 50 and swallow far events if the slice
    // were taken over the whole pool. It must stop at 30 and then offer the crossing.
    const result = reveal([...near(30), ...far(40)], { shown: PAGE_SIZE * 2 })

    expect(result.rows).toHaveLength(30)
    expect(result.rows.every((event) => event.distance === 10)).toBe(true)
    expect(result.more).toBe('farther')
  })

  it('offers the far segment once nearby matches run out, continuing the count', () => {
    const result = reveal([...near(20), ...far(40)])

    expect(result.rows).toHaveLength(20)
    expect(result.more).toBe('farther')
    // Continuing, not resetting: the 20 rows already read stay on screen.
    expect(result.next).toEqual({ shown: 20 + PAGE_SIZE, showAll: true })
    // The count spans BOTH segments even though only the nearby one is on screen —
    // "20 of 20" beside a button offering 40 more would read as a finished list.
    expect(result.total).toBe(60)
  })

  it('keeps saying "distant" for every page after the segment is revealed', () => {
    // Not `'more'`: everything below the boundary is a distant event, so a bare "Show
    // more" would stop describing what the press actually fetches.
    const result = reveal([...near(20), ...far(40)], { shown: 45, showAll: true })

    expect(result.rows).toHaveLength(45)
    expect(result.more).toBe('farther')
    expect(result.next).toEqual({ shown: 60, showAll: true })
    expect(result.total).toBe(60)
  })

  it('stops offering anything once the far segment is exhausted too', () => {
    const result = reveal([...near(20), ...far(10)], { shown: 100, showAll: true })

    expect(result.rows).toHaveLength(30)
    expect(result.more).toBeNull()
    expect(result.next).toBeNull()
  })

  it('offers only the crossing for an all-far result set', () => {
    // The empty state the "no events within N km" alert explains. The default count
    // already exceeds the (zero-length) nearby segment, which is exactly why the far
    // reveal is its own flag rather than being derived from the count.
    const result = reveal(far(40))

    expect(result.rows).toEqual([])
    expect(result.more).toBe('farther')
    expect(result.next).toEqual({ shown: PAGE_SIZE, showAll: true })
  })

  it('keeps online (distanceless) events in the nearby segment', () => {
    const result = reveal([...at(undefined, 3, 'o'), ...far(40)])

    expect(result.rows.map((event) => event.id)).toEqual(['o0', 'o1', 'o2'])
    expect(result.more).toBe('farther')
  })

  it('treats events exactly at the boundary as nearby', () => {
    const result = reveal(at(NEARBY_KM, 3))

    expect(result.rows).toHaveLength(3)
    expect(result.more).toBeNull()
  })

  it('holds an event across a border to half the distance', () => {
    // Same distance, different countries: the domestic one is nearby, the foreign one
    // is not. Someone searching Lille doesn't want Belgian classes ahead of French ones.
    const distance = FOREIGN_NEARBY_KM + 10
    const result = reveal([...at(distance, 1, 'home', 'FR'), ...at(distance, 1, 'abroad', 'BE')], {
      searchCountry: 'FR',
    })

    expect(result.rows.map((event) => event.id)).toEqual(['home0'])
    expect(result.more).toBe('farther')
  })

  it('keeps a genuinely-local cross-border event nearby', () => {
    const result = reveal(at(FOREIGN_NEARBY_KM - 10, 3, 'abroad', 'DE'), { searchCountry: 'CH' })

    expect(result.rows).toHaveLength(3)
    expect(result.more).toBeNull()
  })

  it('compares country codes case-insensitively', () => {
    // `?cc` is normalized uppercase, but the CMS address is whatever was stored.
    const result = reveal(at(NEARBY_KM - 10, 2, 'home', 'fr'), { searchCountry: 'FR' })

    expect(result.rows).toHaveLength(2)
    expect(result.more).toBeNull()
  })

  it('reports the boundary the empty state can name without lying', () => {
    // A cross-border match at 200 km is excluded by the 150 km foreign limit, so
    // "no events within 300 km" would be false while that event exists. The smaller
    // limit is true either way: an empty nearby segment means nothing cleared either.
    const foreign = reveal(at(FOREIGN_NEARBY_KM + 50, 3, 'abroad', 'BE'), { searchCountry: 'FR' })

    expect(foreign.rows).toEqual([])
    expect(foreign.nearbyKm).toBe(FOREIGN_NEARBY_KM)

    // Nothing was demoted on nationality here, so the full boundary is the honest one.
    const domestic = reveal(at(NEARBY_KM + 50, 3, 'home', 'FR'), { searchCountry: 'FR' })

    expect(domestic.nearbyKm).toBe(NEARBY_KM)
  })

  it('never demotes an event on a country it does not know', () => {
    // No `?cc` (an ocean, a country-less feature) or no address country (every online
    // event) — judged on distance alone rather than on a fact we do not have.
    const between = at(FOREIGN_NEARBY_KM + 10, 2, 'x', 'BE')

    expect(reveal(between).rows).toHaveLength(2)
    expect(reveal(at(FOREIGN_NEARBY_KM + 10, 2, 'y'), { searchCountry: 'FR' }).rows).toHaveLength(2)
  })

  it('makes no distance cut without a searched place', () => {
    // Ranking from the map centre — there is no place to be "far" from, so the far
    // segment never forms and paging runs straight through.
    const result = reveal([...near(10), ...far(40)], { hasSearchCenter: false })

    expect(result.rows).toHaveLength(PAGE_SIZE)
    expect(result.more).toBe('more')
    expect(result.next).toEqual({ shown: 50, showAll: false })
    expect(result.total).toBe(50)
  })

  it('stops at the ceiling rather than offering a press the clamp would undo', () => {
    // A result set past MAX_REVEAL, all of it nearby: with no distant segment there is
    // nothing to reserve for, so the list keeps the full ceiling. The rows stop there,
    // and so does the control — `next` would be clamped straight back on read, so the
    // button would sit there doing nothing.
    const result = reveal(near(MAX_REVEAL + 100), { shown: MAX_REVEAL })

    expect(result.rows).toHaveLength(MAX_REVEAL)
    expect(result.more).toBeNull()
    expect(result.next).toBeNull()
    // The count stays honest about what matched, even where the list stops short.
    expect(result.total).toBe(MAX_REVEAL + 100)
  })

  it('never proposes a count above the ceiling', () => {
    const result = reveal(near(MAX_REVEAL + 100), { shown: MAX_REVEAL - 1 })

    expect(result.next).toEqual({ shown: MAX_REVEAL, showAll: false })
  })

  it('clamps a hand-edited count that bypassed the decoder', () => {
    const result = reveal(near(MAX_REVEAL + 100), { shown: 999999 })

    expect(result.rows).toHaveLength(MAX_REVEAL)
    expect(result.more).toBeNull()
  })

  it('keeps the distant segment reachable when the nearby one fills its own ceiling', () => {
    // The case issue #98 pinned as a known sharp edge and #129 fixed — the whole reason
    // the budget is per-segment. Why, in the `MAX_NEARBY_REVEAL` docblock.
    const events = [...near(MAX_REVEAL + 10), ...far(50)]
    const result = reveal(events, { shown: MAX_REVEAL })

    // Nearby paging stops at the reserve, not at the ceiling — with budget still unspent,
    // so the crossing below has somewhere to put its rows.
    expect(result.rows).toHaveLength(MAX_NEARBY_REVEAL)
    expect(result.more).toBe('farther')
    expect(result.next).toEqual({ shown: MAX_NEARBY_REVEAL + PAGE_SIZE, showAll: true })
    // The count still spans every match, reachable or not — unchanged by the reserve.
    expect(result.total).toBe(MAX_REVEAL + 60)

    // And the press DELIVERS: a page of distant rows appended below the nearby ones,
    // rather than a re-slice of the same segment. Fed the `next` just asserted, so this
    // is literally the press the control offers rather than a hand-copy of it.
    const after = reveal(events, result.next!)

    // By the fixture's tag, not by re-deriving the distance rule the module owns.
    expect(after.rows).toHaveLength(MAX_NEARBY_REVEAL + PAGE_SIZE)
    expect(after.rows.slice(0, MAX_NEARBY_REVEAL).every((event) => event.id.startsWith('n'))).toBe(
      true,
    )
    expect(after.rows.slice(MAX_NEARBY_REVEAL).every((event) => event.id.startsWith('f'))).toBe(
      true,
    )
  })

  it('spends the reserve on distant rows, then stops at the ceiling', () => {
    // Paging on past the crossing: the distant segment draws on what the nearby ceiling
    // left, and the list ends at `MAX_REVEAL` — the bound the DOM budget is about.
    const result = reveal([...near(MAX_REVEAL + 10), ...far(500)], {
      shown: 999999,
      showAll: true,
    })

    expect(result.rows).toHaveLength(MAX_REVEAL)
    expect(result.rows.filter((event) => event.distance === 10)).toHaveLength(MAX_NEARBY_REVEAL)
    expect(result.more).toBeNull()
    expect(result.next).toBeNull()
  })

  it('gives the distant segment the whole budget when there is no nearby one', () => {
    // The reserve caps the NEARBY segment; it does not portion out the ceiling. An
    // all-distant result set still pages to `MAX_REVEAL`.
    const result = reveal(far(MAX_REVEAL + 100), { shown: 999999, showAll: true })

    expect(result.rows).toHaveLength(MAX_REVEAL)
  })

  it('never renders more rows than the ceiling, whatever the segment mix', () => {
    // The DOM bound as a property of the function, not just of the constant: the reserve
    // splits the budget between segments and must never let their sum exceed it.
    const states = everyReachableState()

    // A sweep that swept nothing passes every assertion in the loop below.
    expect(states.length).toBeGreaterThan(0)

    for (const state of states) {
      expect(reveal(...state).rows.length).toBeLessThanOrEqual(MAX_REVEAL)
    }
  })

  it('still offers the distant segment when a huge count only filled the nearby one', () => {
    // The ceiling is about ROWS RENDERED, not the number in the URL. A count past both
    // the ceiling and the nearby segment renders that segment and no more — so the
    // distant events are still one press away, not silently unreachable.
    const result = reveal([...near(40), ...far(200)], { shown: 999999 })

    expect(result.rows).toHaveLength(40)
    expect(result.more).toBe('farther')
    expect(result.next).toEqual({ shown: 40 + PAGE_SIZE, showAll: true })
  })

  it('never offers a press that would reveal nothing', () => {
    // Whatever the button offers, the count it writes has to be strictly greater than
    // what is on screen, or pressing it is a no-op.
    let offered = 0

    for (const state of everyReachableState()) {
      const result = reveal(...state)

      if (!result.next) continue
      offered += 1
      expect(result.next.shown).toBeGreaterThan(result.rows.length)
    }

    // The assertion above is inside a conditional inside a loop: without this, a sweep
    // that never reached a state WITH a press on offer would pass having checked nothing.
    expect(offered).toBeGreaterThan(0)
  })
})

// A ratchet on the CONSTANTS, not on `revealRows` — hence its own block. Every ceiling
// test above spells the bound as `MAX_REVEAL` / `MAX_NEARBY_REVEAL`, so all of them pass
// just as happily at a million; nothing else in the suite would notice the DOM bound
// being given back, or the reserve between the two segments being closed up.
describe('MAX_REVEAL and MAX_NEARBY_REVEAL', () => {
  it('is the whole-list bound the two segments divide, inside its DOM budget', () => {
    // ~22 nodes per card, measured in the running widget (331 rows rendered 7,331 nodes),
    // so 400 rows is ~8,800. An AVERAGE over real cards — chips and a distance line come
    // and go — so treat it as a sizing estimate, not a per-row invariant.
    //
    // The budget is OURS, picked to sit just above the profiled-smooth depth; it is not
    // an external standard (Lighthouse's DOM audit warns an order of magnitude lower,
    // which this product cannot meet). Raising the ceiling means re-running that profile
    // and moving this number deliberately, which is the whole point of failing here.
    const NODES_PER_ROW = 22
    const NODE_BUDGET = 10_000

    // Over `MAX_REVEAL` alone: the reserve DIVIDES this budget, it does not add to it.
    expect(MAX_REVEAL * NODES_PER_ROW).toBeLessThanOrEqual(NODE_BUDGET)
  })

  it('are whole numbers of pages, so the last press lands exactly on them', () => {
    // Otherwise the final press is clamped to a stub that reveals fewer rows than the
    // button implied — at the crossing as well as at the end of the list.
    expect(MAX_REVEAL % PAGE_SIZE).toBe(0)
    expect(MAX_NEARBY_REVEAL % PAGE_SIZE).toBe(0)
  })

  it('leave the nearby segment STRICTLY below the ceiling', () => {
    // Strictness is what gives the crossing press room to reveal into; an equal pair
    // silently reinstates #129. Why, in the `MAX_NEARBY_REVEAL` docblock.
    expect(MAX_NEARBY_REVEAL).toBeLessThan(MAX_REVEAL)
  })

  it('reserve enough for the distant segment to be worth reaching', () => {
    // Subsumes the strict check above at today's numbers, and both are kept on purpose:
    // this one is a product floor (a one-row reserve is correct but makes "Show distant
    // events" reveal a single card), the one above is the correctness ratchet that has to
    // survive someone deciding the floor is negotiable.
    expect(MAX_REVEAL - MAX_NEARBY_REVEAL).toBeGreaterThanOrEqual(PAGE_SIZE * 2)
  })

  it('stay far past any plausible reading depth', () => {
    // The other direction: a ceiling of a page or two would be a truncated product
    // wearing a bound's clothes. Asserted on the NEARBY cap because that is now the
    // binding one for the ordinary search — `MAX_REVEAL` clears it by the reserve.
    expect(MAX_NEARBY_REVEAL).toBeGreaterThanOrEqual(PAGE_SIZE * 8)
  })
})
