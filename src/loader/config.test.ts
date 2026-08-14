import { describe, expect, it } from 'vitest'

import { parseConfig, resolveRoute } from './config'

const at = (query: string, pageSearch = '') =>
  parseConfig(`https://atlas.example/auto.js${query}`, pageSearch)

describe('parseConfig', () => {
  it('reads every documented parameter off the script URL', () => {
    const config = at(
      '?key=abc123&map=false&locale=fr&routing=path&compact=always&atlas=/gb/london',
    )

    expect(config).toEqual({
      key: 'abc123',
      map: false,
      locale: 'fr',
      routing: 'path',
      compact: 'always',
      route: '/gb/london',
    })
  })

  it('defaults every optional parameter to the permissive answer', () => {
    const config = at('?key=abc123')

    expect(config).toMatchObject({ map: true, routing: 'query', compact: 'auto' })
    expect(config.locale).toBeUndefined()
    expect(config.route).toBeUndefined()
  })

  it('reports a missing key as null rather than an empty string', () => {
    expect(at('').key).toBeNull()
    expect(at('?key=').key).toBeNull()
  })

  // The settings that were REMOVED rather than renamed (#149). Identity and branding belong to
  // the client record, and there are no privacy opt-outs. A stray value must be ignored, not
  // quietly honoured — otherwise the "configured in the CMS" rule has an undocumented bypass.
  it.each([
    'analytics=false',
    'geolocation=false',
    'error-reporting=false',
    'name=Somebody%20Else',
    'primary-color=%23ff0000',
    'secondary-color=%2300ff00',
    'mount=/map',
    'base-path=/gb/london',
  ])('ignores the removed parameter %s', (param) => {
    const config = at(`?key=abc123&${param}`)

    expect(config).toEqual({
      key: 'abc123',
      map: true,
      locale: undefined,
      routing: 'query',
      compact: 'auto',
      route: undefined,
    })
  })

  // The rule that exists so a typo can never silently switch off a flow the host relies on.
  describe('boolean parameters', () => {
    it.each(['false', '0'])('treats %s as off', (value) => {
      expect(at(`?map=${value}`).map).toBe(false)
    })

    // Each of these READS like it disables something and must not. `map=no` in particular is the
    // one an integrator writes by accident, and `docs/embedding.md` says so.
    it.each(['no', 'off', 'FALSE', 'False', 'nope', '', 'true', '1'])(
      'leaves the feature on for %s',
      (value) => {
        expect(at(`?map=${value}`).map).toBe(true)
      },
    )

    it('leaves the feature on when the parameter is absent entirely', () => {
      expect(at('?key=x').map).toBe(true)
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

describe('resolveRoute', () => {
  // The precedence is the whole point: the page's own `?atlas=` is a visitor who deep-linked,
  // navigated or followed a shared link, so sending them to the embed's default instead would
  // discard where they actually asked to be.
  it('prefers the route already on the page', () => {
    expect(resolveRoute('/gb/london', '?atlas=/nl/amsterdam')).toBe('/nl/amsterdam')
  })

  it('falls back to the embed default when the page names no route', () => {
    expect(resolveRoute('/gb/london', '')).toBe('/gb/london')
    expect(resolveRoute('/gb/london', '?utm_source=x')).toBe('/gb/london')
  })

  it('is undefined when neither names one', () => {
    expect(resolveRoute(null, '')).toBeUndefined()
    expect(resolveRoute(null, '?other=1')).toBeUndefined()
  })

  it("preserves the host's other parameters in its reading of the page", () => {
    expect(resolveRoute(null, '?p=123&atlas=/fr/paris&utm=x')).toBe('/fr/paris')
  })

  // A route is a route wherever it came from. The page's copy is the MORE likely of the two to be
  // adversarial — it rides on a link somebody clicked — so it is guarded just as hard.
  describe('both sources are guarded', () => {
    const hostile = [
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'relative/path',
    ]

    it.each(hostile)('refuses %j from the page', (value) => {
      expect(resolveRoute(null, `?atlas=${encodeURIComponent(value)}`)).toBeUndefined()
    })

    it.each(hostile)('refuses %j from the script', (value) => {
      expect(resolveRoute(value, '')).toBeUndefined()
    })

    // A hostile value on the page must not win, but it must not poison the fallback either:
    // the embed's own safe default is still the right answer.
    it('falls through to a safe embed default when the page value is refused', () => {
      expect(resolveRoute('/gb/london', '?atlas=//evil.example')).toBe('/gb/london')
    })
  })

  it('survives a malformed query string rather than throwing', () => {
    expect(() => resolveRoute('/gb/london', '?%')).not.toThrow()
  })

  it('is wired into parseConfig, so the page wins there too', () => {
    expect(at('?key=k&atlas=/gb/london', '?atlas=/nl/amsterdam').route).toBe('/nl/amsterdam')
  })
})
