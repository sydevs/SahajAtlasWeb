import { describe, expect, it } from 'vitest'

import { parseConfig, resolveRoute } from './config'

/** `resolveRoute` returns the route AND its provenance; most cases only assert the route. */
const routeOf = (scriptValue: string | null, pageSearch: string | null | undefined) =>
  resolveRoute(scriptValue, pageSearch).route

const at = (query: string, pageSearch = '') =>
  parseConfig(`https://atlas.example/auto.js${query}`, pageSearch)

describe('parseConfig', () => {
  it('reads every documented parameter off the script URL', () => {
    const config = at(
      '?key=abc123&map=false&locale=fr&routing=path&atlas=/gb/london',
    )

    expect(config).toEqual({
      key: 'abc123',
      map: false,
      locale: 'fr',
      routing: 'path',
      route: '/gb/london',
      routeFromPage: false,
    })
  })

  it('defaults every optional parameter to the permissive answer', () => {
    const config = at('?key=abc123')

    expect(config).toMatchObject({ map: true, routing: 'query', routeFromPage: false })
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
      route: undefined,
      routeFromPage: false,
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

  describe('routeFromPage — which URL the route came from', () => {
    // The two mean opposite things and `route` alone cannot tell them apart once resolved. A
    // page route is a visitor who followed a link, so the widget mounts eagerly and opens onto
    // it; a script route is the host's default view, so it stays lazy and opens nothing.
    it('is true for a route on the page URL', () => {
      const config = parseConfig('https://atlas.example/auto.js?key=k', '?atlas=/gb/london')

      expect(config).toMatchObject({ route: '/gb/london', routeFromPage: true })
    })

    it('is false for a route configured on the script URL', () => {
      const config = parseConfig('https://atlas.example/auto.js?key=k&atlas=/nl', '')

      expect(config).toMatchObject({ route: '/nl', routeFromPage: false })
    })

    it('is false for a page route the path guard rejected', () => {
      // `?atlas=//evil.example` must not count as a deep link: it would mount eagerly and
      // auto-open on a route we refused to honour.
      const config = parseConfig('https://atlas.example/auto.js?key=k', '?atlas=//evil.example')

      expect(config).toMatchObject({ route: undefined, routeFromPage: false })
    })

    it('lets the page route beat the script route, and still calls it a page route', () => {
      const config = parseConfig('https://atlas.example/auto.js?key=k&atlas=/nl', '?atlas=/gb')

      expect(config).toMatchObject({ route: '/gb', routeFromPage: true })
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
      expect(config.routeFromPage).toBe(false)
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
    expect(routeOf('/gb/london', '?atlas=/nl/amsterdam')).toBe('/nl/amsterdam')
  })

  it('falls back to the embed default when the page names no route', () => {
    expect(routeOf('/gb/london', '')).toBe('/gb/london')
    expect(routeOf('/gb/london', '?utm_source=x')).toBe('/gb/london')
  })

  it('is undefined when neither names one', () => {
    expect(routeOf(null, '')).toBeUndefined()
    expect(routeOf(null, '?other=1')).toBeUndefined()
  })

  it("preserves the host's other parameters in its reading of the page", () => {
    expect(routeOf(null, '?p=123&atlas=/fr/paris&utm=x')).toBe('/fr/paris')
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
      expect(routeOf(null, `?atlas=${encodeURIComponent(value)}`)).toBeUndefined()
    })

    it.each(hostile)('refuses %j from the script', (value) => {
      expect(routeOf(value, '')).toBeUndefined()
    })

    // A hostile value on the page must not win, but it must not poison the fallback either:
    // the embed's own safe default is still the right answer.
    it('falls through to a safe embed default when the page value is refused', () => {
      expect(routeOf('/gb/london', '?atlas=//evil.example')).toBe('/gb/london')
    })
  })

  it('survives a malformed query string rather than throwing', () => {
    expect(() => resolveRoute('/gb/london', '?%')).not.toThrow()
  })

  it('is wired into parseConfig, so the page wins there too', () => {
    expect(at('?key=k&atlas=/gb/london', '?atlas=/nl/amsterdam').route).toBe('/nl/amsterdam')
  })
})
