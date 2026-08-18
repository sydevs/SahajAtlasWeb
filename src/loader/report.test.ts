import type { DetectionSignals } from './detect'

import { describe, expect, it } from 'vitest'

import { fingerprint } from './detect'
import { buildReport, mountParts } from './report'

const observed = fingerprint({ topLevel: true, urlWritable: true, paramPersisted: true }, 'query')

describe('mountParts', () => {
  it('splits a URL into the origin and path the endpoint takes separately', () => {
    expect(mountParts('https://sahajayoga.nl/locatelessons/')).toEqual({
      origin: 'https://sahajayoga.nl',
      pathname: '/locatelessons/',
    })
  })

  it('keeps the port on the origin and never a trailing slash', () => {
    expect(mountParts('https://host.example:8443/x?y=1')).toEqual({
      origin: 'https://host.example:8443',
      pathname: '/x',
    })
    expect(mountParts('https://host.example')?.origin).toBe('https://host.example')
  })

  /**
   * The property this whole module exists to guarantee.
   *
   * A host's query string can carry a password-reset token, an email address or an OAuth code,
   * and their fragment can carry an `#access_token`. `hostPageUrl()` strips exactly this before
   * anything reaches Sentry and Fathom is loaded `auto: false` on the same grounds — this is the
   * third time the repo has ruled that way, and a reporting endpoint added for our own
   * convenience is not the place to start making an exception.
   */
  it.each([
    ['https://host.example/page?reset_token=secret', '/page'],
    ['https://host.example/page#access_token=secret', '/page'],
    ['https://host.example/page?a=1&b=2#frag', '/page'],
    ['https://host.example/page?q=meditation+near+me', '/page'],
  ])('strips the query and fragment from %s', (href, pathname) => {
    expect(mountParts(href)?.pathname).toBe(pathname)
  })

  /**
   * The one carve-out, and the direction that makes it a carve-out rather than a hole (#153).
   *
   * WordPress default permalinks make every page `/?p=<id>`, so discarding the query collapses a
   * whole site onto one mount and the page an operator needs to name as canonical cannot be named
   * at all. A post id is not seeker input; everything else still is, so a permalink with anything
   * appended is refused whole rather than trimmed back to its first parameter.
   */
  describe('the WordPress permalink carve-out', () => {
    it.each([
      ['https://site.com/?p=123', '/?p=123'],
      ['https://site.com/?p=7', '/?p=7'],
      ['https://site.com/index.php?p=42', '/index.php?p=42'],
      // The fragment goes, the permalink stays — the two rules are independent.
      ['https://site.com/?p=123#respond', '/?p=123'],
    ])('preserves the bare permalink in %s', (href, pathname) => {
      expect(mountParts(href)?.pathname).toBe(pathname)
    })

    it.each([
      ['?p=123 with a tracker appended', 'https://site.com/?p=123&utm_source=newsletter'],
      ['a tracker before it', 'https://site.com/?utm_source=x&p=123'],
      ['a non-numeric id', 'https://site.com/?p=abc'],
      ['an empty id', 'https://site.com/?p='],
      ['a different parameter', 'https://site.com/?page_id=123'],
    ])('discards %s', (_case, href) => {
      expect(mountParts(href)?.pathname).toBe('/')
    })

    // Two distinct posts must stay two distinct mounts — the collapse this carve-out exists to
    // undo is the reason the record could not name a canonical page in the first place.
    it('keeps two posts on one site apart', () => {
      expect(mountParts('https://site.com/?p=1')).not.toEqual(mountParts('https://site.com/?p=2'))
    })
  })

  // A report is a diagnostic, and no diagnostic is worth a throw in someone else's page.
  it.each([null, undefined, '', 'not a url', 'about:blank#x'])(
    'returns undefined rather than throwing for %s',
    (href) => {
      expect(() => mountParts(href)).not.toThrow()
    },
  )

  // A sandboxed document serialises its origin as the literal "null", which is not a mount
  // anybody could point a canonical at.
  it('refuses an opaque origin', () => {
    expect(mountParts('null')).toBeUndefined()
  })
})

describe('buildReport', () => {
  it('carries the fingerprint alongside the split mount', () => {
    const report = buildReport(observed, 'https://host.example/classes?q=1')

    expect(report).toEqual({
      ...observed,
      origin: 'https://host.example',
      pathname: '/classes',
    })
  })

  // `mount` was one field until #153; the endpoint takes the halves and rebuilds it, so sending
  // the joined string is a 400 on every report.
  it('sends no joined `mount` field', () => {
    expect(buildReport(observed, 'https://host.example/x')).not.toHaveProperty('mount')
  })

  it('is undefined when the page has no reportable mount', () => {
    expect(buildReport(observed, 'not a url')).toBeUndefined()
  })

  it('reports the measured signals rather than an idealised set', () => {
    const framed = fingerprint(
      { topLevel: false, urlWritable: false, paramPersisted: false },
      'query',
    ) satisfies { topLevel: boolean } & DetectionSignals

    expect(buildReport(framed, 'https://host.example/x')).toMatchObject({
      mode: 'iframe',
      canonicalViable: false,
    })
  })
})
