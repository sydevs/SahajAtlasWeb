import type { GeoEvent } from './hierarchy'

import { describe, it, expect } from 'vitest'

import {
  ancestorIdsFromBreadcrumbs,
  boundsUnder,
  countUnder,
  eventsUnder,
  partitionUnder,
} from './hierarchy'

// Belgium(28) → Antwerpen(473) and Belgium(28) → Brussels(470) → venue(513).
const events: GeoEvent[] = [
  { point: [4.4, 51.2], ancestorIds: [28, 473], online: false }, // event in Antwerpen
  { point: [4.35, 50.85], ancestorIds: [28, 470, 513], online: false }, // event at the Brussels venue
  { point: null, ancestorIds: [28, 470], online: true }, // online event under Brussels
]

describe('ancestorIdsFromBreadcrumbs', () => {
  it('extracts numeric doc ids in order', () => {
    expect(ancestorIdsFromBreadcrumbs([{ doc: 28 }, { doc: 470 }, { doc: 513 }])).toEqual([
      28, 470, 513,
    ])
  })

  it('handles populated doc objects and skips nulls', () => {
    expect(ancestorIdsFromBreadcrumbs([{ doc: { id: 28 } }, { doc: null }])).toEqual([28])
    expect(ancestorIdsFromBreadcrumbs(null)).toEqual([])
  })
})

describe('eventsUnder / countUnder', () => {
  it('counts every descendant event under a country', () => {
    expect(countUnder(events, 28)).toBe(3)
  })

  it('counts only the matching subtree under a city/venue', () => {
    expect(countUnder(events, 473)).toBe(1)
    expect(countUnder(events, 470)).toBe(2)
    expect(countUnder(events, 513)).toBe(1)
  })

  it('returns the matching events themselves', () => {
    expect(eventsUnder(events, 473)).toEqual([events[0]])
  })
})

describe('boundsUnder', () => {
  it('bounds only the located events, ignoring online ones', () => {
    expect(boundsUnder(events, 470)).toEqual([4.35, 50.85, 4.35, 50.85])
  })

  it('returns null when a region has no located events', () => {
    expect(boundsUnder([{ point: null, ancestorIds: [99], online: false }], 99)).toBeNull()
  })
})

describe('partitionUnder', () => {
  // Belgium(28) → Antwerpen(473) [1 located] and Belgium(28) → Brussels(470) →
  // venue(513) [2 located + 1 online], plus one placeless offline event directly
  // under Belgium and one out-of-subtree event under France(99).
  const [belgium, antwerpen, brussels, venue, france] = [28, 473, 470, 513, 99]
  const subtree: GeoEvent[] = [
    { point: [4.4, 51.2], ancestorIds: [belgium, antwerpen], online: false }, // → Antwerpen
    { point: [4.35, 50.85], ancestorIds: [belgium, brussels, venue], online: false }, // → Brussels
    { point: [4.36, 50.84], ancestorIds: [belgium, brussels], online: false }, // → Brussels
    { point: null, ancestorIds: [belgium], online: false }, // placeless offline, no child
    { point: null, ancestorIds: [belgium, brussels], online: true }, // online under Brussels
    { point: [2.35, 48.85], ancestorIds: [france], online: false }, // outside the subtree
  ]

  it('groups located events by the direct child whose subtree holds them', () => {
    const { byChild } = partitionUnder(subtree, belgium, [antwerpen, brussels])

    // Attribution follows ancestry to the one direct child, not the terminal region.
    expect(byChild.get(antwerpen)).toHaveLength(1)
    expect(byChild.get(brussels)).toHaveLength(2)
  })

  it('classifies online by the flag, not geometry; placeless offline stays located', () => {
    const { direct, online } = partitionUnder(subtree, belgium, [antwerpen, brussels])

    // The coordinate-less *offline* event (point: null) is located → `direct`, not online.
    expect(direct).toEqual([{ point: null, ancestorIds: [belgium], online: false }])
    // Only the eventType-online event rolls up, though it shares a null point with `direct`.
    expect(online).toEqual([{ point: null, ancestorIds: [belgium, brussels], online: true }])
  })

  it('excludes events outside the region subtree', () => {
    const { byChild, direct, online } = partitionUnder(subtree, belgium, [antwerpen, brussels])
    const kept = [...byChild.values()].flat().length + direct.length + online.length

    // Five of six events fall under Belgium; the France event is dropped entirely.
    expect(kept).toBe(5)
  })

  it('puts every located event in `direct` for a childless leaf, online rolled up', () => {
    // Brussels as a leaf (no child ids): its two located events hang off `direct`,
    // its online event rolls up — the same split a city/center view renders.
    const { byChild, direct, online } = partitionUnder(subtree, brussels, [])

    expect(byChild.size).toBe(0)
    expect(direct).toHaveLength(2)
    expect(online).toHaveLength(1)
  })
})
