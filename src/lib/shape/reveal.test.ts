import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REVEAL,
  FOREIGN_NEARBY_KM,
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
    // A result set past MAX_REVEAL: the rows stop there, and so does the control —
    // `next` would be clamped straight back on read, so the button would sit there
    // doing nothing.
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
    // Every reachable state: whatever the button offers, the count it writes has to be
    // strictly greater than what is on screen, or pressing it is a no-op.
    const sets = [near(30), [...near(30), ...far(30)], far(30), [...near(1), ...far(400)]]

    for (const events of sets) {
      for (const showAll of [false, true]) {
        for (const shown of [DEFAULT_REVEAL, 40, MAX_REVEAL, 999999]) {
          const result = reveal(events, { shown, showAll })

          if (result.next) expect(result.next.shown).toBeGreaterThan(result.rows.length)
        }
      }
    }
  })
})
