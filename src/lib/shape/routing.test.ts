import { describe, expect, it } from 'vitest'

import {
  ROUTE_PARAM,
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

  // A host served at a doubled path has `pathname === '//classes'`. A relative
  // href built from that would read as protocol-relative, and leave the
  // origin on middle-click.
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

  describe('fromPage — whose route it is', () => {
    // `path` alone cannot tell a visitor who deep-linked from a host who
    // configured a default view. Only the first may open the compact card's
    // surface on mount. Otherwise every host with a default region gets a
    // full-screen overlay over their content on every load.
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
      // A sandboxed frame still deep-links. It just cannot write the URL afterwards.
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

    it('reads the route’s query out of ?atlas=, and leaves the host’s params alone', () => {
      const decision = mountDecision({
        ...PATH,
        pathname: '/map/search',
        search: '?utm_source=news&atlas=center=4.9,52.3',
      })

      expect(decision.path).toBe('/search?center=4.9,52.3')
    })

    // A leading slash means a query-mode route sitting in a path-mode URL — a stale link, or a
    // host mid-switch. Reading it as a query string would produce nonsense, so it is refused.
    it('ignores a query-mode ?atlas= value it finds in a path-mode URL', () => {
      expect(mountDecision({ ...PATH, search: '?atlas=/nl/amsterdam' }).path).toBe('/gb/london')
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

  // ⚠ This is the sharp one. `''` disables `routeFromPathname`'s
  // segment-boundary check, so a prefix that reaches `''` by accident makes
  // the #92 basename-miss guard unable to fire. Path mode then adopts the
  // host's entire URL space, rewriting whatever page it is on. A root mount
  // has to be spelled with the slash. Everything slashless is a malformed key.
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

  // The mount ends up in an `<a href>`, so it takes the same guard every
  // other server-provided path takes. This runs before the trailing-slash
  // strip, or `host//` normalises to `''` and reaches the root-mount answer
  // without ever meeting it.
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

  it('reads the route’s query from ?atlas=, ignoring the host’s own parameters', () => {
    expect(routeFromPathname('/map/search', '/map', '?utm=x&atlas=sort=distance%26q=Lille')).toBe(
      '/search?sort=distance&q=Lille',
    )
  })

  it('is just the path when there is no ?atlas=', () => {
    expect(routeFromPathname('/map/search', '/map', '?utm=x')).toBe('/search')
  })
})

// Both of these went in when `hrefFor`/`pathHrefFor` moved onto `query.ts`, and both were checked
// by reintroducing their defect against the suite as it stood: the whole 457-test lane stayed
// green for each, so neither property was covered before.
describe('hrefFor and pathHrefFor on the shared query editor', () => {
  /**
   * ⚠ This is the trap the move had to avoid, and the reason `hrefFor` calls
   * `searchWith` (the string editor), instead of `hrefWith` (the URL wrapper).
   *
   * `hrefWith` answers `''` when the value is already there. Its two callers,
   * `publishLocale` and `clearFeedback`, both mean "leave the URL alone" by
   * it. `hrefFor` feeds `createHref` for every `<Link>`, and a link to the
   * route already on screen is the commonest case in the whole app. So `''`
   * there blanks the href of every self-link on the page.
   */
  it('still returns a URL when the route is already the current one', () => {
    const href = 'https://host.example/p?atlas=/gb/london'

    expect(hrefFor(href, '/gb/london')).toBe(href)
    expect(pathHrefFor('https://host.example/m/gb', '/gb', '/m')).toBe('https://host.example/m/gb')
  })

  /**
   * The improvement the move buys. The old `readable()` pass ran `%2F`→`/`
   * and `%2C`→`,` over the whole query to repair `searchParams.set`'s
   * re-serialization. That pass also rewrote a host's own pairs, and never
   * recovered their `%20`, which `set` had already turned into `+`.
   */
  it('leaves the host’s own encoding byte-identical, `%20` and `%2F` alike', () => {
    expect(hrefFor('https://host.example/p?keep=a%20b&path=x%2Fy', '/gb/london')).toBe(
      'https://host.example/p?keep=a%20b&path=x%2Fy&atlas=/gb/london',
    )
    expect(pathHrefFor('https://host.example/m/gb?keep=a%20b', '/nl?sort=soonest', '/m')).toBe(
      'https://host.example/m/nl?keep=a%20b&atlas=sort%3Dsoonest',
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

  it('writes the route’s query into ?atlas=, replacing any previous value', () => {
    const href = pathHrefFor(
      'https://host.example/m/search?atlas=sort=distance',
      '/search?sort=soonest',
      '/m',
    )

    expect(href).toContain('atlas=sort%3Dsoonest')
    expect(href).not.toContain('distance')
  })

  it('drops the parameter entirely when the new route carries no query', () => {
    expect(pathHrefFor('https://host.example/m/search?atlas=q=Lille', '/nl', '/m')).not.toContain(
      'atlas=',
    )
  })

  // ⚠ The whole point of the change: a host's parameters are not ours in EITHER mode now. The
  // previous design claimed twelve names on their pages, and got the list wrong.
  it.each(['q', 'sort', 'region', 'format', 'days', 'locale', 'utm_source', 'p'])(
    'leaves the host’s ?%s= alone',
    (key) => {
      expect(pathHrefFor(`https://host.example/m/gb?${key}=x`, '/nl', '/m')).toContain(`${key}=x`)
    },
  )

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

  it('carries a filter through ?atlas=, without touching a host param of the same name', () => {
    const href = pathHrefFor(
      'https://host.example/m/search?format=online',
      '/search?format=weekly',
      '/m',
    )

    // Ours is inside the parameter. Theirs is left exactly where it was.
    expect(href).toContain('atlas=format%3Dweekly')
    expect(href).toContain('format=online')
  })
})
