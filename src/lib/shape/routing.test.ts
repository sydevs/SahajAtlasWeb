import { describe, expect, it } from 'vitest'

import { ROUTE_PARAM, hrefFor, mountDecision, routeFromParam, routeToParam } from './routing'

const HOST = 'https://host.example/classes'

describe('routeToParam', () => {
  it('leaves a plain route readable', () => {
    // The whole reason `/` is restored after encoding: this is the string a visitor sees in a
    // shared link, and `%2Fnl%2Famsterdam%2F1204` is noise.
    expect(routeToParam('/nl/amsterdam/1204')).toBe('/nl/amsterdam/1204')
  })

  it('leaves a comma readable, because every coordinate pair is one', () => {
    expect(routeToParam('/search?center=4.9,52.3')).toContain('4.9,52.3')
  })

  it('encodes the nested query separator, so host and widget params stay distinguishable', () => {
    expect(routeToParam('/search?a=1&b=2')).toBe('/search%3Fa%3D1%26b%3D2')
  })

  it('encodes an accented slug rather than emitting raw non-ASCII', () => {
    expect(routeToParam('/be/liège')).toBe('/be/li%C3%A8ge')
  })
})

describe('routeFromParam', () => {
  it('reads our parameter and ignores the host’s', () => {
    expect(routeFromParam('?p=123&atlas=/nl/amsterdam&utm=x')).toBe('/nl/amsterdam')
  })

  it('round-trips everything routeToParam produces', () => {
    // The pairing that matters: anything we write must read back identically, or a shared link
    // opens somewhere other than where it was copied from.
    for (const route of [
      '/',
      '/nl/amsterdam/1204',
      '/search?center=4.9,52.3',
      '/search?a=1&b=2',
      '/be/liège',
      '/search?q=a+b',
    ]) {
      expect(routeFromParam(`?${ROUTE_PARAM}=${routeToParam(route)}`)).toBe(route)
    }
  })

  // ⚠ The internal path is DECODED, so running an already-decoded route back through the encoder
  // would yield `%25C3`. This is the case that breaks accented slugs, and `path.test.ts` pins the
  // same shape for `webPath`.
  it('does not double-decode', () => {
    expect(routeFromParam(`?${ROUTE_PARAM}=/be/li%25C3%25A8ge`)).toBe('/be/li%C3%A8ge')
  })

  it('is undefined when the parameter is absent', () => {
    expect(routeFromParam('?p=123')).toBeUndefined()
    expect(routeFromParam('')).toBeUndefined()
    expect(routeFromParam(null)).toBeUndefined()
  })

  // Ported verbatim from hash.test.ts. This value rides on a link somebody clicked, which makes it
  // the MORE likely of the app's two route sources to be adversarial.
  it.each([
    ['//evil.example', 'protocol-relative'],
    ['/\\evil.example', 'a leading backslash, which browsers normalise to a slash'],
    ['/\t/evil.example', 'TAB, which the URL parser strips before parsing'],
    ['/\n/evil.example', 'LF'],
    ['/\r/evil.example', 'CR'],
    ['https://evil.example', 'absolute'],
    ['javascript:alert(1)', 'a scheme'],
    ['relative/path', 'not site-relative'],
  ])('refuses %j (%s)', (value) => {
    expect(routeFromParam(`?${ROUTE_PARAM}=${encodeURIComponent(value)}`)).toBeUndefined()
  })

  it('never throws on a malformed query string', () => {
    expect(() => routeFromParam('?%')).not.toThrow()
  })
})

describe('hrefFor', () => {
  it('returns an absolute URL on the host’s origin', () => {
    expect(hrefFor(HOST, '/nl/amsterdam')).toBe('https://host.example/classes?atlas=/nl/amsterdam')
  })

  // WordPress's default permalink is `/?p=123`, and this feature exists for WordPress hosts.
  it('preserves the host’s own parameters', () => {
    expect(hrefFor('https://host.example/?p=123', '/nl')).toBe(
      'https://host.example/?p=123&atlas=/nl',
    )
  })

  it('replaces our parameter rather than appending a second', () => {
    const once = hrefFor(`${HOST}?atlas=/gb`, '/nl')

    expect(once).toBe(`${HOST}?atlas=/nl`)
    expect(once.match(/atlas=/g)).toHaveLength(1)
  })

  it('writes the parameter even for the root route', () => {
    // Omitting it would make "no parameter" mean two things — the embed's default and the root —
    // with no way for a reader to tell which.
    expect(hrefFor(HOST, '/')).toBe(`${HOST}?atlas=/`)
  })

  it('keeps the host’s fragment', () => {
    expect(hrefFor(`${HOST}#respond`, '/nl')).toBe(`${HOST}?atlas=/nl#respond`)
  })

  // A host served at a doubled path has `pathname === '//classes'`; a RELATIVE href built from
  // that would read as protocol-relative and leave the origin on middle-click.
  it('cannot emit a protocol-relative href from a doubled host path', () => {
    const href = hrefFor('https://host.example//classes', '/nl')

    expect(href.startsWith('https://host.example//classes')).toBe(true)
  })

  it('returns an empty string rather than throwing on an unparseable page URL', () => {
    expect(hrefFor('not a url', '/nl')).toBe('')
  })
})

describe('mountDecision', () => {
  it('takes the route already in the page’s URL over the embed default', () => {
    expect(mountDecision({ routing: 'query', search: '?atlas=/nl', route: '/gb' })).toMatchObject({
      mode: 'query',
      path: '/nl',
    })
  })

  it('falls back to the embed default, then to the root', () => {
    expect(mountDecision({ routing: 'query', search: '', route: '/gb' }).path).toBe('/gb')
    expect(mountDecision({ routing: 'query', search: '' }).path).toBe('/')
  })

  it('refuses a hostile route in the page URL and falls through to the default', () => {
    expect(
      mountDecision({ routing: 'query', search: '?atlas=//evil.example', route: '/gb' }).path,
    ).toBe('/gb')
  })

  // A route we cannot write is a route nobody can link to, and mounting a query router over a URL
  // that refuses writes would fail on the visitor's first click rather than at boot.
  it('degrades to memory when the URL cannot be written', () => {
    expect(mountDecision({ routing: 'query', search: '', urlWritable: false }).mode).toBe('memory')
  })

  it('assumes writable when nobody probed', () => {
    expect(mountDecision({ routing: 'query', search: '' }).mode).toBe('query')
  })

  // `path` is accepted and not yet honoured. Silently behaving as query is how a host concludes
  // their server configuration is working when nothing is using it.
  describe('routing=path', () => {
    it('falls back to query', () => {
      expect(mountDecision({ routing: 'path', search: '' }).mode).toBe('query')
    })

    it('carries a warning naming what happened', () => {
      const { warning } = mountDecision({ routing: 'path', search: '' })

      expect(warning).toMatch(/routing=path/)
      expect(warning).toMatch(/query routing/)
    })

    it('says nothing when query was what was asked for', () => {
      expect(mountDecision({ routing: 'query', search: '' }).warning).toBeUndefined()
    })
  })
})
