import type { GeocodingFeature } from '@mapbox/search-js-core'

import { describe, it, expect } from 'vitest'

import { geocodeCountryCode, geocodeRegionIds } from './geocode'

// A geocoder result reduced to what the reader touches: its `feature_type` (only to
// distinguish the cases below — the read itself is level-independent by design) and
// its country context. This is cast at the boundary. The real GeocodingFeature
// carries a dozen fields the reader never looks at, and `country_code` is not on
// the SDK's context type at all (see geocode.ts).
const feature = (featureType: string, country?: Record<string, unknown>): GeocodingFeature =>
  ({
    properties: { feature_type: featureType, context: country ? { country } : {} },
  }) as unknown as GeocodingFeature

describe('geocodeCountryCode', () => {
  it('reads the code from a country-level result (its context describes itself)', () => {
    // Geocoding v6 includes a `country` context on a country result too, so the one
    // read covers this without a `feature_type` branch.
    expect(geocodeCountryCode(feature('country', { name: 'Iceland', country_code: 'is' }))).toBe(
      'IS',
    )
  })

  it('reads the code from a place-level result via its country context', () => {
    // Searching a town is the case the offer has to catch — the country comes from
    // the surrounding context, never from the feature itself.
    const reykjavik = feature('place', {
      name: 'Iceland',
      country_code: 'IS',
      country_code_alpha_3: 'ISL',
    })

    expect(geocodeCountryCode(reykjavik)).toBe('IS')
  })

  it('yields nothing when the result carries no country context', () => {
    // An ocean or other country-less feature, and a shape with no
    // `properties` at all, which the vendor types say cannot happen, but
    // the optional chaining survives.
    expect(geocodeCountryCode(feature('region'))).toBeUndefined()
    expect(geocodeCountryCode({} as GeocodingFeature)).toBeUndefined()
  })

  it('yields nothing for a malformed code rather than passing it on', () => {
    expect(geocodeCountryCode(feature('place', { country_code: 'USA' }))).toBeUndefined()
    expect(geocodeCountryCode(feature('place', { country_code: '' }))).toBeUndefined()
    expect(geocodeCountryCode(feature('place', { country_code: 42 }))).toBeUndefined()
    expect(geocodeCountryCode(feature('place', { name: 'Nowhere' }))).toBeUndefined()
  })
})

describe('geocodeRegionIds', () => {
  const picked = (featureType: string, mapboxId: string, placeId?: string): GeocodingFeature =>
    ({
      properties: {
        feature_type: featureType,
        mapbox_id: mapboxId,
        context: placeId ? { place: { mapbox_id: placeId, name: 'Town' } } : {},
      },
    }) as unknown as GeocodingFeature

  it('offers the town around a pick smaller than a town, after the pick itself', () => {
    expect(geocodeRegionIds(picked('neighborhood', 'camden', 'london'))).toEqual([
      'camden',
      'london',
    ])
    expect(geocodeRegionIds(picked('postcode', 'nw1', 'london'))).toEqual(['nw1', 'london'])
    expect(geocodeRegionIds(picked('locality', 'hampstead', 'london'))).toEqual([
      'hampstead',
      'london',
    ])
  })

  it('never climbs from a town or anything larger', () => {
    // A district, a region or a country names an area wider than the town in its context.
    expect(geocodeRegionIds(picked('place', 'london', 'london'))).toEqual(['london'])
    expect(geocodeRegionIds(picked('district', 'greater-london', 'london'))).toEqual([
      'greater-london',
    ])
    expect(geocodeRegionIds(picked('region', 'england'))).toEqual(['england'])
    expect(geocodeRegionIds(picked('country', 'gb'))).toEqual(['gb'])
  })

  it('yields nothing for a feature that carries no id', () => {
    expect(geocodeRegionIds({} as GeocodingFeature)).toEqual([])
    expect(geocodeRegionIds(picked('neighborhood', ''))).toEqual([])
  })
})
