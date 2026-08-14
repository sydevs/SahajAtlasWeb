import type { DetectionSignals } from './detect'

import { describe, expect, it } from 'vitest'

import { fingerprint } from './detect'
import { buildReport, mountKey } from './report'

const observed = fingerprint(
  { topLevel: true, urlWritable: true, paramPersisted: true, mountMatches: false },
  'query',
)

describe('mountKey', () => {
  it('reduces a URL to origin + pathname', () => {
    expect(mountKey('https://sahajayoga.nl/locatelessons/')).toBe(
      'https://sahajayoga.nl/locatelessons/',
    )
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
    ['https://host.example/page?reset_token=secret', 'https://host.example/page'],
    ['https://host.example/page#access_token=secret', 'https://host.example/page'],
    ['https://host.example/page?a=1&b=2#frag', 'https://host.example/page'],
    ['https://host.example/?p=123', 'https://host.example/'],
    ['https://host.example:8443/x?y=1', 'https://host.example:8443/x'],
  ])('strips everything after the path in %s', (href, expected) => {
    expect(mountKey(href)).toBe(expected)
  })

  it('never returns a string containing a query or a fragment', () => {
    const key = mountKey('https://host.example/a/b?secret=1#tok')

    expect(key).not.toContain('?')
    expect(key).not.toContain('#')
    expect(key).not.toContain('secret')
    expect(key).not.toContain('tok')
  })

  // A report is a diagnostic, and no diagnostic is worth a throw in someone else's page.
  it.each([null, undefined, '', 'not a url', 'about:blank#x'])(
    'returns undefined rather than throwing for %s',
    (href) => {
      expect(() => mountKey(href)).not.toThrow()
    },
  )

  // A sandboxed document serialises its origin as the literal "null", which is not a mount
  // anybody could point a canonical at.
  it('refuses an opaque origin', () => {
    expect(mountKey('null')).toBeUndefined()
  })
})

describe('buildReport', () => {
  it('carries the fingerprint alongside the mount key', () => {
    const report = buildReport(observed, 'https://host.example/classes?q=1')

    expect(report).toEqual({ ...observed, mount: 'https://host.example/classes' })
  })

  it('is undefined when the page has no reportable mount', () => {
    expect(buildReport(observed, 'not a url')).toBeUndefined()
  })

  it('reports the measured signals rather than an idealised set', () => {
    const framed = fingerprint(
      { topLevel: false, urlWritable: false, paramPersisted: false, mountMatches: false },
      'query',
    ) satisfies { topLevel: boolean } & DetectionSignals

    expect(buildReport(framed, 'https://host.example/x')).toMatchObject({
      mode: 'iframe',
      canonicalViable: false,
    })
  })
})
