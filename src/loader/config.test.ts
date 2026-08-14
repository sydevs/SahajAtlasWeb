import { describe, expect, it } from 'vitest'

import { parseConfig } from './config'

const at = (query: string) => parseConfig(`https://atlas.example/auto.js${query}`)

describe('parseConfig', () => {
  it('reads every documented parameter off the script URL', () => {
    const config = at(
      '?key=abc123&map=false&locale=fr&routing=path&mount=/map&name=Meditate%20Now' +
        '&primary-color=%23112233&secondary-color=%23445566' +
        '&analytics=false&geolocation=false&error-reporting=false&compact=always&base-path=/gb/london',
    )

    expect(config).toEqual({
      key: 'abc123',
      map: false,
      locale: 'fr',
      routing: 'path',
      mount: '/map',
      name: 'Meditate Now',
      primaryColor: '#112233',
      secondaryColor: '#445566',
      analytics: false,
      geolocation: false,
      errorReporting: false,
      compact: 'always',
      basePath: '/gb/london',
    })
  })

  it('defaults every optional parameter to the permissive answer', () => {
    const config = at('?key=abc123')

    expect(config).toMatchObject({
      map: true,
      routing: 'query',
      analytics: true,
      geolocation: true,
      errorReporting: true,
      compact: 'auto',
    })
    expect(config.locale).toBeUndefined()
    expect(config.mount).toBeUndefined()
    expect(config.basePath).toBeUndefined()
  })

  it('reports a missing key as null rather than an empty string', () => {
    expect(at('').key).toBeNull()
    expect(at('?key=').key).toBeNull()
  })

  // The rule that exists so a typo can never silently switch off a flow the host relies on.
  describe('boolean parameters', () => {
    it.each(['false', '0'])('treats %s as off', (value) => {
      expect(at(`?analytics=${value}`).analytics).toBe(false)
    })

    // Each of these READS like it disables something and must not. `geolocation=no` in
    // particular is the one an integrator writes by accident, and `docs/embedding.md` says so.
    it.each(['no', 'off', 'FALSE', 'False', 'nope', '', 'true', '1'])(
      'leaves the feature on for %s',
      (value) => {
        expect(at(`?geolocation=${value}`).geolocation).toBe(true)
      },
    )

    it('leaves the feature on when the parameter is absent entirely', () => {
      expect(at('?key=x').errorReporting).toBe(true)
    })
  })

  describe('compact, which is three-valued and so cannot use the boolean reader', () => {
    it.each([
      ['always', 'always'],
      ['never', 'never'],
      ['auto', 'auto'],
    ])('reads %s', (value, expected) => {
      expect(at(`?compact=${value}`).compact).toBe(expected)
    })

    // Accepted so a host reasoning by analogy from the documented false/0 rule gets the
    // sensible answer rather than silence.
    it.each([
      ['1', 'always'],
      ['true', 'always'],
      ['0', 'never'],
      ['false', 'never'],
    ])('accepts the boolean spelling %s', (value, expected) => {
      expect(at(`?compact=${value}`).compact).toBe(expected)
    })

    // The protective bias: an unrecognised value resolves to the ADAPTIVE default, never to
    // the destructive one. A typo must not lock a host into a small card forever.
    it.each(['allways', 'sometimes', 'AUTO', ''])('falls back to auto for %s', (value) => {
      expect(at(`?compact=${value}`).compact).toBe('auto')
    })
  })

  describe('routing', () => {
    it('takes path only when asked for by name', () => {
      expect(at('?routing=path').routing).toBe('path')
    })

    it.each(['query', 'hash', 'PATH', 'anything', ''])(
      'falls back to query for %s — the mode that needs no host configuration',
      (value) => {
        expect(at(`?routing=${value}`).routing).toBe('query')
      },
    )
  })

  // `mount` and `base-path` are host-supplied and reach a route, so they get the same guard
  // `webPath` does. These are the cases `safePath` exists for; the pin spec asserts the
  // loader's copy agrees with the widget's.
  describe('path parameters are guarded', () => {
    it.each([
      ['//evil.example', 'protocol-relative'],
      ['/\\evil.example', 'leading backslash, which browsers normalise to a slash'],
      ['/\t/evil.example', 'TAB, which the URL parser strips before parsing'],
      ['/\n/evil.example', 'LF'],
      ['/\r/evil.example', 'CR'],
      ['https://evil.example', 'absolute'],
      ['javascript:alert(1)', 'a scheme'],
      ['relative/path', 'not site-relative'],
    ])('refuses %s (%s)', (value) => {
      expect(at(`?mount=${encodeURIComponent(value)}`).mount).toBeUndefined()
      expect(at(`?base-path=${encodeURIComponent(value)}`).basePath).toBeUndefined()
    })

    it('accepts an ordinary site-relative path', () => {
      expect(at('?mount=/map').mount).toBe('/map')
      expect(at('?base-path=/gb/london/507').basePath).toBe('/gb/london/507')
    })
  })

  // This runs before anything is on screen, in a page we do not own. A throw here would take
  // the host's own scripts down with it, so a URL we cannot parse yields defaults.
  describe('a script src it cannot parse', () => {
    it.each([null, undefined, '', 'not a url'])('yields defaults for %s', (src) => {
      const config = parseConfig(src as string | null | undefined)

      expect(config.key).toBeNull()
      expect(config.map).toBe(true)
      expect(config.compact).toBe('auto')
    })
  })

  it('ignores the path and only reads the query, so any filename works', () => {
    expect(parseConfig('https://atlas.example/v2/auto.js?key=k').key).toBe('k')
    expect(parseConfig('/auto.js?key=k').key).toBe('k')
  })
})
