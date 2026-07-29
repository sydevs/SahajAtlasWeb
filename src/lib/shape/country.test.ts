import type { RegionTreeNode } from './hierarchy'
import type { RegionedFeature } from './country'

import { describe, it, expect } from 'vitest'

import { countryHasPrograms } from './country'

// Country slugs are lowercase ISO codes (SahajCloud#556); Iceland is deliberately
// absent — the "no programs" country the offer exists for.
const regions: RegionTreeNode[] = [
  { id: 1, slug: 'gb' },
  { id: 2, slug: 'cambridgeshire', parent: 1 },
  { id: 3, slug: 'cambridge', parent: 2 },
  { id: 4, slug: 'de' },
  { id: 5, slug: 'berlin', parent: 4 },
]

const at = (regionId: number | null): RegionedFeature => ({
  properties: { region: regionId === null ? null : { id: regionId } },
})

describe('countryHasPrograms', () => {
  it('is false for a country absent from the region tree', () => {
    // The headline case: Iceland has no node, so it has no programs by definition —
    // NOT "no region restriction" the way an unknown slug reads in the filter matcher.
    expect(countryHasPrograms(regions, [at(3)], 'IS')).toBe(false)
  })

  it('is true when an event sits on the country node itself', () => {
    expect(countryHasPrograms(regions, [at(1)], 'GB')).toBe(true)
  })

  it('is true when the events only sit on descendant regions', () => {
    // A class pinned to a city two levels down still counts as its country's.
    expect(countryHasPrograms(regions, [at(3)], 'GB')).toBe(true)
  })

  it('is false when every event belongs to another country', () => {
    expect(countryHasPrograms(regions, [at(3), at(2)], 'DE')).toBe(false)
    expect(countryHasPrograms(regions, [at(5)], 'GB')).toBe(false)
  })

  it('accepts either case of the code (the slug is lowercase)', () => {
    expect(countryHasPrograms(regions, [at(3)], 'gb')).toBe(true)
    expect(countryHasPrograms(regions, [at(3)], 'Gb')).toBe(true)
  })

  it('is false for an empty feed', () => {
    expect(countryHasPrograms(regions, [], 'GB')).toBe(false)
  })

  it('is false while either input is still loading, or with no country', () => {
    expect(countryHasPrograms(undefined, [at(1)], 'GB')).toBe(false)
    expect(countryHasPrograms(regions, undefined, 'GB')).toBe(false)
    expect(countryHasPrograms(regions, [at(1)], undefined)).toBe(false)
    expect(countryHasPrograms(regions, [at(1)], null)).toBe(false)
  })

  it('ignores region-less (online) events', () => {
    expect(countryHasPrograms(regions, [at(null)], 'GB')).toBe(false)
  })
})
