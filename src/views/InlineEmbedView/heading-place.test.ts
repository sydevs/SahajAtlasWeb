import type { RegionNode } from '@/types'

import { describe, expect, it } from 'vitest'

import { headingPlace } from './heading-place'

const node = (
  id: number,
  slug: string,
  name: string,
  level: RegionNode['level'],
  parent: number | null,
  webPath: string,
): RegionNode => ({ id, slug, name, level, parent, webPath })

const REGIONS = [
  node(1, 'gb', 'United Kingdom', 'country', null, '/gb'),
  node(2, 'south-east', 'South East', 'region', 1, '/gb/south-east'),
  node(3, 'london', 'London', 'city', 2, '/gb/south-east/london'),
  node(4, 'brixton', 'Brixton Centre', 'venue', 3, '/gb/south-east/london/brixton'),
  node(5, 'as', 'Ascot', 'city', 2, '/gb/south-east/as'),
]

// Distinguishable from the tree's own English name, so a case reading the tree instead fails.
const COUNTRY_NAMES: Record<string, string> = { GB: 'Royaume-Uni', AS: 'Samoa américaines' }
const countryName = (code: string) => COUNTRY_NAMES[code]
const place = (pathname: string) => headingPlace(pathname, REGIONS, countryName)

describe('the place the inline heading names', () => {
  it('is nothing at the root, where the heading is the world title', () => {
    expect(place('/')).toBeUndefined()
  })

  it('names a region by its tree name', () => {
    expect(place('/gb/south-east/london')).toBe('London')
  })

  it("names a country in the visitor's language", () => {
    expect(place('/gb')).toBe('Royaume-Uni')
  })

  it('reads a two-letter slug as a country only where the tree says it is one', () => {
    expect(place('/gb/south-east/as')).toBe('Ascot')
  })

  it('names the city a venue sits in, not the venue', () => {
    expect(place('/gb/south-east/london/brixton')).toBe('London')
  })

  it("names the city of a class, and of that class's sign-up", () => {
    expect(place('/gb/south-east/london/brixton/507')).toBe('London')
    expect(place('/gb/south-east/london/brixton/507/register')).toBe('London')
  })

  it("follows the tree's own address, not the words typed", () => {
    // `/united-kingdom` is not the country's address; London's own is.
    expect(place('/united-kingdom/london')).toBe('London')
  })

  it('is nothing on a route that names no region', () => {
    expect(place('/search')).toBeUndefined()
  })

  it('finds a place by its Unicode slug, encoded or raw, whatever its normal form (#483)', () => {
    // A URL arrives NFC once decoded; a slug typed by hand into SahajCloud can be NFD.
    const munich = node(6, 'mu\u0308nchen', 'München', 'city', 2, '/gb/south-east/mu\u0308nchen')
    const regions = [...REGIONS, munich]

    expect(headingPlace('/gb/south-east/m%C3%BCnchen', regions, countryName)).toBe('München')
    expect(headingPlace('/gb/south-east/m\u00fcnchen', regions, countryName)).toBe('München')
  })

  it('names a country before the tree has loaded, and waits for it for anything else', () => {
    expect(headingPlace('/gb', undefined, countryName)).toBe('Royaume-Uni')
    expect(headingPlace('/gb/south-east/london', undefined, countryName)).toBeUndefined()
  })
})
