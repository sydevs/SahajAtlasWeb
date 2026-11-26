import { describe, expect, it } from 'vitest'

import { APPROX_LOCATION_MAX_AGE_MS, decodeApproxLocation } from '../src/lib/approx-location'
import { WRITTEN_GEO } from '../src/loader/literals'

import { GEO_PLACEHOLDER, encodeGeo, fixtureGeo, geoPayload, injectGeo } from './geo.mjs'

const NOW = Date.UTC(2026, 10, 26, 12)

// Cloudflare's own shapes: coordinates arrive as strings.
const PRAGUE = { country: 'CZ', city: 'Prague', latitude: '50.0880', longitude: '14.4208' }

const roundTrip = (cf: Parameters<typeof geoPayload>[0], readAt = NOW) => {
  const payload = geoPayload(cf, NOW)

  return payload ? decodeApproxLocation(encodeGeo(payload), readAt) : null
}

describe('the Worker and widget halves agree', () => {
  it('on the placeholder the loader leaves for the Worker', () => {
    expect(WRITTEN_GEO).toBe(GEO_PLACEHOLDER)
  })

  it('round-trips a town and its country', () => {
    expect(roundTrip(PRAGUE)).toEqual({
      countryCode: 'CZ',
      place: { city: 'Prague', center: [14.4208, 50.088] },
    })
  })

  // A name the payload must carry intact through base64url and UTF-8.
  it('round-trips a city name a JS string or an HTML attribute would choke on', () => {
    const city = `Kraków "</script>" it's   São`
    const token = encodeGeo(geoPayload({ ...PRAGUE, city }, NOW)!)

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeApproxLocation(token, NOW)?.place?.city).toBe(city)
  })

  it('keeps the country alone when Cloudflare places no town', () => {
    expect(roundTrip({ country: 'IN' })).toEqual({ countryCode: 'IN' })
  })

  it('reads the untouched placeholder as no guess', () => {
    expect(decodeApproxLocation(GEO_PLACEHOLDER, NOW)).toBeNull()
  })

  it('refuses a stale token, as a copied loader would carry', () => {
    expect(roundTrip(PRAGUE, NOW + APPROX_LOCATION_MAX_AGE_MS + 1000)).toBeNull()
    expect(roundTrip(PRAGUE, NOW - APPROX_LOCATION_MAX_AGE_MS - 1000)).toBeNull()
    expect(roundTrip(PRAGUE, NOW + APPROX_LOCATION_MAX_AGE_MS - 1000)).not.toBeNull()
  })

  it('writes the dev fixture as Prague', () => {
    expect(decodeApproxLocation(encodeGeo(fixtureGeo(NOW)!), NOW)?.place?.city).toBe('Prague')
  })
})

describe('geoPayload', () => {
  it('drops what names no country: unknown, Tor, or not a code', () => {
    for (const country of ['XX', 'T1', 'cz', 'CZE', 7]) {
      expect(geoPayload({ country }, NOW)).toBeNull()
    }
  })

  it('keeps a city only with both coordinates in range', () => {
    expect(geoPayload({ ...PRAGUE, latitude: '91' }, NOW)).toEqual({
      v: 1,
      t: NOW / 1000,
      cc: 'CZ',
    })
    expect(geoPayload({ ...PRAGUE, longitude: 'east' }, NOW)?.city).toBeUndefined()
    expect(geoPayload({ ...PRAGUE, city: 'x'.repeat(101) }, NOW)?.city).toBeUndefined()
  })

  it('answers nothing without a request.cf', () => {
    expect(geoPayload(undefined, NOW)).toBeNull()
  })
})

describe('injectGeo', () => {
  const body = `boot(a,b,"${GEO_PLACEHOLDER}")`

  it('replaces the one placeholder', () => {
    expect(injectGeo(body, 'TOKEN')).toBe('boot(a,b,"TOKEN")')
  })

  it('refuses a body with none, or with two', () => {
    expect(injectGeo('boot(a,b)', 'TOKEN')).toBeNull()
    expect(injectGeo(body + body, 'TOKEN')).toBeNull()
  })
})
