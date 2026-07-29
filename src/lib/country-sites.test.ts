import { describe, it, expect } from 'vitest'

import { COUNTRY_SITES, countrySite } from './country-sites'

// The mapping is hand-scraped static data, so the contract it has to hold is
// mechanical: canonical uppercase alpha-2 keys (what `isoCountryCode` normalizes a
// `?cc` value to — a lowercase or aliased key would simply never be found) and
// http(s) values (they're rendered as an external link). Asserted here so a
// refresh from shrimataji.org can't quietly break either.

describe('COUNTRY_SITES', () => {
  const entries = Object.entries(COUNTRY_SITES)

  it('holds the full scraped list (95 countries)', () => {
    expect(entries).toHaveLength(95)
  })

  it('keys every entry by a canonical uppercase ISO alpha-2 code', () => {
    for (const [code] of entries) {
      // `Intl.Locale` canonicalizes a region subtag, so a legacy alias (`UK`, `SU`)
      // or a mis-cased/mistyped code fails to round-trip.
      expect(new Intl.Locale(`und-${code}`).region, code).toBe(code)
    }
  })

  it('points every entry at an http(s) URL', () => {
    for (const [code, url] of entries) {
      expect(new URL(url).protocol, code).toMatch(/^https?:$/)
    }
  })

  it('resolves a localized country name for every key', () => {
    const names = new Intl.DisplayNames('en', { type: 'region' })

    for (const [code] of entries) {
      // The offer labels itself with the country name; `of` echoing the raw code
      // back would mean the key isn't a region Intl knows.
      expect(names.of(code), code).not.toBe(code)
    }
  })
})

describe('countrySite', () => {
  it('looks a country up whatever the casing — a lowercase slug or an uppercase ?cc', () => {
    expect(countrySite('IS')).toBe(COUNTRY_SITES.IS)
    expect(countrySite('is')).toBe(COUNTRY_SITES.IS)
  })

  it('is undefined for a country with no site, and for no country at all', () => {
    // Angola is a real country the list doesn't cover — the "keeps today's empty
    // state" case.
    expect(countrySite('AO')).toBeUndefined()
    expect(countrySite('')).toBeUndefined()
    expect(countrySite(null)).toBeUndefined()
    expect(countrySite(undefined)).toBeUndefined()
  })
})
