import type { GeocodingFeature } from '@mapbox/search-js-core'

import { describe, it, expect } from 'vitest'

import { geocodeCountryCode, isoCountryCode } from './geocode'

// A geocoder result reduced to what the reader touches. Cast at the boundary: the
// real GeocodingFeature carries a dozen fields the reader never looks at, and
// `country_code` isn't on the SDK's context type at all (see geocode.ts).
const feature = (country?: Record<string, unknown>): GeocodingFeature =>
  ({ properties: { context: country ? { country } : {} } }) as unknown as GeocodingFeature

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
})

describe('geocodeCountryCode', () => {
  it('reads the code from a country-level result (its context describes itself)', () => {
    expect(geocodeCountryCode(feature({ name: 'Iceland', country_code: 'is' }))).toBe('IS')
  })

  it('reads the code from a place-level result via its country context', () => {
    // Searching a town is the case the offer has to catch — the country comes from
    // the context, not from the feature's own type.
    const reykjavik = feature({ name: 'Iceland', country_code: 'IS', country_code_alpha_3: 'ISL' })

    expect(geocodeCountryCode(reykjavik)).toBe('IS')
  })

  it('yields nothing when the result carries no country context', () => {
    expect(geocodeCountryCode(feature())).toBeUndefined()
    expect(geocodeCountryCode({} as GeocodingFeature)).toBeUndefined()
  })

  it('yields nothing for a malformed code rather than passing it on', () => {
    expect(geocodeCountryCode(feature({ country_code: 'USA' }))).toBeUndefined()
    expect(geocodeCountryCode(feature({ country_code: '' }))).toBeUndefined()
    expect(geocodeCountryCode(feature({ country_code: 42 }))).toBeUndefined()
    expect(geocodeCountryCode(feature({ name: 'Nowhere' }))).toBeUndefined()
  })
})
