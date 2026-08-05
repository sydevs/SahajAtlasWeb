import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REVEAL,
  MAX_REVEAL,
  NEARBY_KM,
  PAGE_SIZE,
  resetReveal,
  revealFromParams,
  revealRows,
  revealToParams,
  showAllFromParams,
} from '@/lib/shape'

/** `n` events at `km` from the search centre, tagged so order is checkable. */
const at = (km: number | undefined, n: number, tag = '') =>
  Array.from({ length: n }, (_, i) => ({ distance: km, id: `${tag}${i}` }))

const near = (n: number, tag = 'n') => at(10, n, tag)
const far = (n: number, tag = 'f') => at(NEARBY_KM + 1, n, tag)

const reveal = (
  events: { distance?: number; id: string }[],
  options: Partial<{ shown: number; showAll: boolean; hasSearchCenter: boolean }> = {},
) =>
  revealRows(events, {
    shown: DEFAULT_REVEAL,
    showAll: false,
    hasSearchCenter: true,
    ...options,
  })

describe('revealFromParams', () => {
  it('defaults to one page when the param is absent or unparseable', () => {
    expect(revealFromParams(new URLSearchParams())).toBe(DEFAULT_REVEAL)
    expect(revealFromParams(new URLSearchParams('shown=lots'))).toBe(DEFAULT_REVEAL)
    expect(revealFromParams(new URLSearchParams('shown='))).toBe(DEFAULT_REVEAL)
  })

  it('never goes below one page, however the param is tampered with', () => {
    expect(revealFromParams(new URLSearchParams('shown=0'))).toBe(DEFAULT_REVEAL)
    expect(revealFromParams(new URLSearchParams('shown=-40'))).toBe(DEFAULT_REVEAL)
  })

  it('reads a revealed count and floors a fractional one', () => {
    expect(revealFromParams(new URLSearchParams('shown=75'))).toBe(75)
    expect(revealFromParams(new URLSearchParams('shown=75.9'))).toBe(75)
  })

  it('clamps at the ceiling, so a crafted link cannot render the whole feed at once', () => {
    // The rows are unvirtualized and the fetcher no longer caps the set, so an
    // unbounded `?shown=` would build every match in one commit — inside a host page.
    expect(revealFromParams(new URLSearchParams('shown=999999'))).toBe(MAX_REVEAL)
    expect(revealFromParams(new URLSearchParams(`shown=${MAX_REVEAL + 1}`))).toBe(MAX_REVEAL)
    expect(revealFromParams(new URLSearchParams(`shown=${MAX_REVEAL}`))).toBe(MAX_REVEAL)
  })
})

describe('revealToParams', () => {
  it('omits the first page so links stay clean', () => {
    expect(revealToParams(DEFAULT_REVEAL, false).toString()).toBe('')
  })

  it('serializes the count and the far-segment flag', () => {
    const params = revealToParams(75, true)

    expect(params.get('shown')).toBe('75')
    expect(params.get('all')).toBe('1')
  })

  it('preserves other params', () => {
    const params = revealToParams(50, false, new URLSearchParams('q=paris&sort=closest'))

    expect(params.get('q')).toBe('paris')
    expect(params.get('sort')).toBe('closest')
  })

  it('round-trips through the codec', () => {
    const params = revealToParams(120, true)

    expect(revealFromParams(params)).toBe(120)
    expect(showAllFromParams(params)).toBe(true)
  })
})

describe('resetReveal', () => {
  // The reason this exists: `useSetFilters` / `useSetSortOrder` copy the current params
  // wholesale, so without it a stale count would survive a change to the result set.
  it('clears both reveal params while preserving the rest', () => {
    const params = resetReveal(new URLSearchParams('q=paris&shown=125&all=1&sort=soonest'))

    expect(params.has('shown')).toBe(false)
    expect(params.has('all')).toBe(false)
    expect(params.get('q')).toBe('paris')
    expect(params.get('sort')).toBe('soonest')
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

  it('pages through the far segment once it is revealed', () => {
    const result = reveal([...near(20), ...far(40)], { shown: 45, showAll: true })

    expect(result.rows).toHaveLength(45)
    expect(result.more).toBe('more')
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
})
