import { describe, expect, it } from 'vitest'

import { FILTER_PARAM_KEYS } from './filters'
import { SEARCH_COUNTRY_PARAM } from './path'
import { SORT_PARAM } from './sort'
import {
  ROUTE_PARAM,
  WIDGET_PARAMS,
  hrefFor,
  mountDecision,
  mountPrefix,
  pathHrefFor,
  routeFromParam,
  routeFromPathname,
  routeToParam,
} from './routing'

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
  describe('fromPage — whose route it is', () => {
    // `path` alone cannot tell a visitor who deep-linked from a host who configured a default
    // view, and only the first may open the compact card's surface on mount: otherwise every
    // host with a default region gets a full-screen overlay over their content on every load.
    it('is true when the page URL carries the route', () => {
      expect(mountDecision({ routing: 'query', search: '?atlas=/gb/london' })).toMatchObject({
        path: '/gb/london',
        fromPage: true,
      })
    })

    it('is false when the route is the embed default', () => {
      expect(mountDecision({ routing: 'query', search: '', route: '/nl' })).toMatchObject({
        path: '/nl',
        fromPage: false,
      })
    })

    it('is false when there is no route at all', () => {
      expect(mountDecision({ routing: 'query', search: '' })).toMatchObject({
        path: '/',
        fromPage: false,
      })
    })

    it('is false for a page route the path guard rejected', () => {
      // `safePath` refuses `//evil.example`, and a route we refuse to honour must not also
      // mount eagerly and open itself.
      expect(mountDecision({ routing: 'query', search: '?atlas=//evil.example' })).toMatchObject({
        path: '/',
        fromPage: false,
      })
    })

    it('survives the memory degradation', () => {
      // A sandboxed frame still deep-links; it just cannot write the URL afterwards.
      expect(
        mountDecision({ routing: 'query', search: '?atlas=/gb', urlWritable: false }),
      ).toMatchObject({ mode: 'memory', fromPage: true })
    })
  })

  describe('routing=path', () => {
    const PATH = {
      routing: 'path',
      search: '',
      pathname: '/map/gb/london',
      prefix: '/map',
    } as const

    it('mounts in path mode once a prefix is known', () => {
      const decision = mountDecision(PATH)

      expect(decision.mode).toBe('path')
      expect(decision.routing).toBe('path')
      expect(decision.path).toBe('/gb/london')
      expect(decision.prefix).toBe('/map')
      expect(decision.warning).toBeUndefined()
    })

    it('reads the root of the subtree as the root route', () => {
      expect(mountDecision({ ...PATH, pathname: '/map' }).path).toBe('/')
      expect(mountDecision({ ...PATH, pathname: '/map/' }).path).toBe('/')
    })

    it('carries the widget’s own params through, and leaves the host’s alone', () => {
      const decision = mountDecision({
        ...PATH,
        pathname: '/map/search',
        search: '?utm_source=news&center=4.9,52.3',
      })

      expect(decision.path).toBe('/search?center=4.9,52.3')
    })

    // ⚠ Without a prefix path mode cannot be honoured at all — the record has not arrived, or the
    // client has no canonical embed. Falling back silently is the failure this whole branch of
    // `mountDecision` exists to avoid.
    it('falls back to query, loudly, when no prefix is available', () => {
      const decision = mountDecision({ routing: 'path', search: '', pathname: '/map' })

      expect(decision.mode).toBe('query')
      expect(decision.routing).toBe('query')
      expect(decision.warning).toMatch(/canonical embed/)
    })

    // ⚠ #92's blank widget in its second form: react-router renders `null` on a basename miss,
    // silently. We refuse to enter path mode instead, and say which prefix we expected.
    it('falls back to query, loudly, when the page is outside the prefix', () => {
      const decision = mountDecision({ ...PATH, pathname: '/blog/post' })

      expect(decision.mode).toBe('query')
      expect(decision.warning).toContain('/map')
    })

    it('refuses a prefix that only looks like a match at the string level', () => {
      // `/mapped` is not inside `/map`. A prefix has to land on a segment boundary.
      expect(mountDecision({ ...PATH, pathname: '/mapped/gb' }).mode).toBe('query')
    })

    // Memory is a degradation of the URL itself, so it outranks a mode that needs to write one.
    it('is outranked by an unwritable URL', () => {
      expect(mountDecision({ ...PATH, urlWritable: false }).mode).toBe('memory')
    })

    it('says nothing when query was what was asked for', () => {
      expect(mountDecision({ routing: 'query', search: '' }).warning).toBeUndefined()
    })
  })
})

describe('mountPrefix', () => {
  const HOST = 'wemeditate.com'

  it('takes the path half of a mount key', () => {
    expect(mountPrefix('wemeditate.com/map', HOST)).toBe('/map')
  })

  it('tolerates a pasted full URL, because that is the obvious operator mistake', () => {
    expect(mountPrefix('https://wemeditate.com/map', HOST)).toBe('/map')
  })

  it('normalises a trailing slash away, so the prefix never doubles the route’s own', () => {
    expect(mountPrefix('wemeditate.com/map/', HOST)).toBe('/map')
  })

  it('reads an explicit root mount as the empty prefix', () => {
    // `splitMountKey` writes at least the pathname's `/`, so this is the shape a real root mount
    // arrives in — and `''` genuinely means "mount at the root".
    expect(mountPrefix('wemeditate.com/', HOST)).toBe('')
  })

  // ⚠ The sharp one. `''` disables `routeFromPathname`'s segment-boundary check, so a prefix that
  // reaches `''` BY ACCIDENT makes the #92 basename-miss guard unable to fire — and path mode then
  // adopts the host's entire URL space, rewriting whatever page it is on. A root mount has to be
  // spelled with the slash; everything slashless is a malformed key.
  it.each(['wemeditate.com', 'map', 'not a url', 'javascript:alert(1)'])(
    'refuses a slashless value rather than claiming the whole origin: %j',
    (embed) => {
      expect(mountPrefix(embed, HOST)).toBeUndefined()
    },
  )

  it('is absent for an absent or blank embed', () => {
    expect(mountPrefix(undefined, HOST)).toBeUndefined()
    expect(mountPrefix(null, HOST)).toBeUndefined()
    expect(mountPrefix('   ', HOST)).toBeUndefined()
  })

  // The record names the page the widget is mounted on. Being somewhere else is not a
  // canonical-ownership question — it is the only thing confining path mode to a subtree.
  it('refuses a mount key for a different host', () => {
    expect(mountPrefix('wemeditate.com/map', 'evil.example')).toBeUndefined()
    expect(mountPrefix('wemeditate.com/map', undefined)).toBeUndefined()
  })

  it('matches the host case-insensitively', () => {
    expect(mountPrefix('WeMeditate.com/map', HOST)).toBe('/map')
  })

  // ⚠ A mount key keeps the port (`splitMountKey` records `url.host`), and a colon before the
  // first slash is exactly what a too-eager scheme strip mistakes for a scheme. Loosening that
  // regex to also match a scheme without `//` left host `5173` here, and only a browser showed it.
  it('handles a host with a port, which is what a mount key actually carries', () => {
    expect(mountPrefix('localhost:5173/pathmode', 'localhost:5173')).toBe('/pathmode')
    expect(mountPrefix('http://localhost:5173/pathmode', 'localhost:5173')).toBe('/pathmode')
  })

  // The mount ends up in an `<a href>`, so it takes the same guard every other server-provided
  // path takes — and BEFORE the trailing-slash strip, or `host//` normalises to `''` and reaches
  // the root-mount answer without ever meeting it.
  it.each(['//evil.com', '/\\evil.com', '/\tevil', '//'])(
    'refuses a mount path that is not safe: %j',
    (path) => {
      expect(mountPrefix(`${HOST}${path}`, HOST)).toBeUndefined()
    },
  )
})

describe('routeFromPathname', () => {
  it('strips the prefix', () => {
    expect(routeFromPathname('/map/gb/london', '/map')).toBe('/gb/london')
  })

  it('works with an empty prefix (a root mount)', () => {
    expect(routeFromPathname('/gb/london', '')).toBe('/gb/london')
  })

  it('is undefined outside the prefix, never a best guess', () => {
    expect(routeFromPathname('/blog', '/map')).toBeUndefined()
    expect(routeFromPathname('/mapped/gb', '/map')).toBeUndefined()
  })

  it('picks up only the widget’s own query params', () => {
    expect(routeFromPathname('/map/search', '/map', '?utm=x&sort=distance&q=Lille')).toBe(
      '/search?sort=distance&q=Lille',
    )
  })
})

describe('pathHrefFor', () => {
  const PAGE = 'https://wemeditate.com/map/gb?utm_source=news'

  it('composes an absolute URL under the prefix', () => {
    expect(pathHrefFor(PAGE, '/nl/amsterdam', '/map')).toBe(
      'https://wemeditate.com/map/nl/amsterdam?utm_source=news',
    )
  })

  it('keeps the host’s foreign params — the audience for this feature runs WordPress', () => {
    expect(pathHrefFor('https://host.example/m/gb?p=123', '/nl', '/m')).toContain('p=123')
  })

  it('replaces our own params rather than appending them', () => {
    const href = pathHrefFor(
      'https://host.example/m/search?sort=distance',
      '/search?sort=soonest',
      '/m',
    )

    expect(href).toContain('sort=soonest')
    expect(href).not.toContain('sort=distance')
  })

  it('drops our params when the new route carries none', () => {
    expect(pathHrefFor('https://host.example/m/search?q=Lille', '/nl', '/m')).not.toContain('q=')
  })

  it('roots correctly at the prefix itself', () => {
    expect(pathHrefFor('https://wemeditate.com/map/gb', '/', '/map')).toBe(
      'https://wemeditate.com/map',
    )
  })

  it('returns empty for a URL that will not parse, like its query counterpart', () => {
    expect(pathHrefFor('not a url', '/nl', '/map')).toBe('')
  })

  // ⚠ `safePath` inspects the first two characters, so a CMS-authored `/../../wp-admin` is
  // "site-relative" by its rules — and the URL parser then resolves the dot segments and walks the
  // href out of the mount subtree onto an unrelated page of the host's own site.
  it.each(['/../../wp-admin', '/%2e%2e/%2e%2e/wp-admin', '/../'])(
    'refuses a route that escapes the mount subtree: %j',
    (route) => {
      expect(pathHrefFor('https://host.example/map/gb', route, '/map')).toBe('')
    },
  )

  it('still allows the prefix itself and everything genuinely under it', () => {
    expect(pathHrefFor('https://host.example/map/gb', '/', '/map')).toBe('https://host.example/map')
    expect(pathHrefFor('https://host.example/map/gb', '/nl/x', '/map')).toBe(
      'https://host.example/map/nl/x',
    )
  })

  // `locale` is the widget's parameter but only ever a PAGE one — nothing writes it back, so
  // claiming it would delete a visitor's language on the first click.
  it('leaves ?locale= alone', () => {
    expect(pathHrefFor('https://host.example/map?locale=fr&utm=x', '/gb', '/map')).toContain(
      'locale=fr',
    )
  })

  it('replaces a filter param rather than stacking a second copy', () => {
    const href = pathHrefFor(
      'https://host.example/m/search?format=online',
      '/search?format=weekly',
      '/m',
    )

    expect(href).toContain('format=weekly')
    expect(href).not.toContain('format=online')
  })
})

describe('WIDGET_PARAMS', () => {
  /**
   * ⚠ **Both ways of getting this wrong are silent, which is why it is asserted rather than read.**
   *
   * In `routing=path` the widget's state lives on the HOST page's real query string, so this set is
   * what the history lifts out on read and rewrites on navigate. A name MISSING from it is a filter
   * silently dropped on every navigation; a name wrongly IN it is one of the host's own parameters
   * silently stolen. Query mode is immune — it packs the whole route into one parameter — so
   * nothing else in the app would go red either way.
   *
   * The first draft was hand-listed and named a `filters` param that has never existed, while the
   * seven real filter names went unclaimed.
   */
  it('claims every name the URL-derived slices actually own', () => {
    for (const key of [SEARCH_COUNTRY_PARAM, SORT_PARAM, ...FILTER_PARAM_KEYS]) {
      expect(WIDGET_PARAMS.has(key)).toBe(true)
    }
  })

  it('claims the searched place, which has no constant of its own', () => {
    for (const key of ['q', 'center', 'bbox']) expect(WIDGET_PARAMS.has(key)).toBe(true)
  })

  // The route parameter is query mode's carrier and is never one of ours to lift in path mode.
  it('does not claim the route parameter itself', () => {
    expect(WIDGET_PARAMS.has(ROUTE_PARAM)).toBe(false)
  })

  it('claims nothing a host would plausibly own', () => {
    for (const key of ['utm_source', 'p', 'page', 'id', 's', 'lang', 'ref']) {
      expect(WIDGET_PARAMS.has(key)).toBe(false)
    }
  })
})
