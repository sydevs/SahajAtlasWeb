import { describe, expect, it } from 'vitest'

import { parseApproxLocation } from '../src/lib/approx-location'
import { GEO_MODULE } from '../src/loader/literals'

import { GEO_PATH, approxLocation, geoModule } from './geo.mjs'

// Cloudflare's own shapes: coordinates arrive as strings.
const PRAGUE = { country: 'CZ', city: 'Prague', latitude: '50.0880', longitude: '14.4208' }

/** What the widget reads after importing the module the Worker built for `cf`. */
const roundTrip = async (cf: Parameters<typeof approxLocation>[0]) => {
  const source = geoModule(approxLocation(cf))
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)

  return parseApproxLocation(module.default)
}

describe('the Worker and widget halves agree', () => {
  it('on where the module is served', () => {
    expect(new URL(GEO_MODULE, 'https://sahajatlas.com/loader.js').pathname).toBe(GEO_PATH)
  })

  it('round-trips a town and its country', async () => {
    expect(await roundTrip(PRAGUE)).toEqual({
      countryCode: 'CZ',
      place: { city: 'Prague', center: [14.4208, 50.088] },
    })
  })

  // A name the module must carry intact, as JavaScript.
  it('round-trips a city name with quotes, a line separator and non-Latin letters', async () => {
    const city = `Kraków "</script>" it's   São`

    expect((await roundTrip({ ...PRAGUE, city }))?.place?.city).toBe(city)
  })

  it('keeps the country alone when Cloudflare places no town', async () => {
    expect(await roundTrip({ country: 'IN' })).toEqual({ countryCode: 'IN' })
  })

  it('exports null when Cloudflare knows nothing, which the widget reads as no guess', async () => {
    expect(geoModule(approxLocation({ country: 'XX' }))).toBe('export default null\n')
    expect(await roundTrip(undefined)).toBeNull()
  })
})

describe('approxLocation', () => {
  it('drops what names no country: unknown, Tor, or not a code', () => {
    for (const country of ['XX', 'T1', 'cz', 'CZE', 7]) {
      expect(approxLocation({ country })).toBeNull()
    }
  })

  it('keeps a town only with both coordinates in range', () => {
    expect(approxLocation({ ...PRAGUE, latitude: '91' })).toEqual({ countryCode: 'CZ' })
    expect(approxLocation({ ...PRAGUE, longitude: 'east' })?.place).toBeUndefined()
    expect(approxLocation({ ...PRAGUE, city: 'x'.repeat(101) })?.place).toBeUndefined()
  })

  // `Number('')` is 0: a blank coordinate would put the town on Null Island.
  it('refuses a blank coordinate rather than reading it as zero', () => {
    expect(approxLocation({ ...PRAGUE, latitude: '', longitude: ' ' })?.place).toBeUndefined()
  })
})
