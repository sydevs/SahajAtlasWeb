import type { CountryTreeNode, RegionedFeature } from './country'

import { describe, it, expect } from 'vitest'

import { countryHasPrograms, isoCountryCode } from './country'

// Country slugs are lowercase ISO codes (SahajCloud#556); Iceland is deliberately
// absent — the "no programs" country the offer exists for. `as` is a two-letter slug
// at CITY level, standing in for a namesake country code (American Samoa).
const regions: CountryTreeNode[] = [
  { id: 1, slug: 'gb', level: 'country' },
  { id: 2, slug: 'cambridgeshire', level: 'region', parent: 1 },
  { id: 3, slug: 'cambridge', level: 'city', parent: 2 },
  { id: 4, slug: 'de', level: 'country' },
  { id: 5, slug: 'berlin', level: 'city', parent: 4 },
  { id: 6, slug: 'as', level: 'city', parent: 1 },
]

const at = (regionId: number): RegionedFeature => ({ properties: { region: { id: regionId } } })

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

  it('is false for an empty feed, and for an empty tree', () => {
    expect(countryHasPrograms(regions, [], 'GB')).toBe(false)
    expect(countryHasPrograms([], [at(1)], 'GB')).toBe(false)
  })

  it('counts an online class listed under the country — it is still a program', () => {
    // Online events belong to no *place*, but the feed still files them
    // under a region, so a country whose only listing is an online class is
    // not empty and must not be offered its own website.
    expect(countryHasPrograms(regions, [at(1)], 'GB')).toBe(true)
  })

  it('only matches a COUNTRY node, never a namesake slug at another level', () => {
    // `as` is a city here. Without the level check its events would answer for
    // American Samoa, wrongly suppressing that country's offer.
    expect(countryHasPrograms(regions, [at(6)], 'AS')).toBe(false)
  })
})

describe('isoCountryCode', () => {
  it('normalizes a two-letter code to uppercase', () => {
    expect(isoCountryCode('is')).toBe('IS')
    expect(isoCountryCode('GB')).toBe('GB')
    expect(isoCountryCode('Fr')).toBe('FR')
  })

  it('rejects anything that is not two letters', () => {
    expect(isoCountryCode('USA')).toBeUndefined()
    expect(isoCountryCode('')).toBeUndefined()
    expect(isoCountryCode('u')).toBeUndefined()
    expect(isoCountryCode('12')).toBeUndefined()
    expect(isoCountryCode('u-s')).toBeUndefined()
    expect(isoCountryCode(null)).toBeUndefined()
    expect(isoCountryCode(undefined)).toBeUndefined()
  })

  it('stays anchored — this is the only gate on an attacker-supplied ?cc', () => {
    // The result indexes `COUNTRY_SITES` and becomes a path segment in the flag CDN
    // URL, so an unanchored future edit (`/^[A-Za-z]{2}/`) must fail loudly here
    // rather than quietly letting a separator or a newline through.
    expect(isoCountryCode('gb/')).toBeUndefined()
    expect(isoCountryCode('gb\n')).toBeUndefined()
    expect(isoCountryCode('gb.')).toBeUndefined()
    expect(isoCountryCode(' gb')).toBeUndefined()
  })
})
