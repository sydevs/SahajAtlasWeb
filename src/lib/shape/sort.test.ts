import { describe, expect, it } from 'vitest'

import { DEFAULT_SORT, SORT_ORDERS, byDistance, sortFromParams, sortToParams } from '@/lib/shape'

describe('sortFromParams', () => {
  it('defaults to recommended when the param is absent', () => {
    expect(sortFromParams(new URLSearchParams())).toBe('recommended')
    expect(sortFromParams(new URLSearchParams())).toBe(DEFAULT_SORT)
  })

  it('reads a valid order', () => {
    expect(sortFromParams(new URLSearchParams('sort=closest'))).toBe('closest')
    expect(sortFromParams(new URLSearchParams('sort=soonest'))).toBe('soonest')
    expect(sortFromParams(new URLSearchParams('sort=recommended'))).toBe('recommended')
  })

  it('falls back to the default for an unknown value', () => {
    expect(sortFromParams(new URLSearchParams('sort=alphabetical'))).toBe(DEFAULT_SORT)
    expect(sortFromParams(new URLSearchParams('sort='))).toBe(DEFAULT_SORT)
  })
})

describe('sortToParams', () => {
  it('omits the default order so links stay clean', () => {
    expect(sortToParams('recommended').toString()).toBe('')
  })

  it('serializes a non-default order', () => {
    expect(sortToParams('closest').get('sort')).toBe('closest')
    expect(sortToParams('soonest').get('sort')).toBe('soonest')
  })

  it('preserves other params and clears a stale sort when set back to default', () => {
    const next = sortToParams('recommended', new URLSearchParams('q=paris&sort=closest'))

    expect(next.get('q')).toBe('paris')
    expect(next.has('sort')).toBe(false)
  })

  it('round-trips every order through the codec', () => {
    for (const order of SORT_ORDERS) {
      expect(sortFromParams(sortToParams(order))).toBe(order)
    }
  })
})

describe('byDistance', () => {
  it('orders ascending with placeless/online (no distance) last', () => {
    const near = { distance: 1 }
    const far = { distance: 10 }
    const placeless = {}

    expect([far, placeless, near].sort(byDistance)).toEqual([near, far, placeless])
  })

  it('compares two placeless events equal (NaN-safe)', () => {
    expect(byDistance({}, {})).toBe(0)
  })
})
