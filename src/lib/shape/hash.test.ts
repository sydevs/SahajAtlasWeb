import { describe, expect, it } from 'vitest'

import { HASH_BASE, mountRoute } from './hash'

// The three-way decision the embedded widget makes once, at mount (issue #92). It is a
// pure function precisely so these cases — a WordPress comment anchor, a hostile deep
// link — can be pinned here rather than only in a browser.

describe('mountRoute', () => {
  describe('an unclaimed fragment', () => {
    it('claims a clean URL and boots at the root', () => {
      expect(mountRoute('')).toEqual({ router: 'hash', path: '/', write: '#!' })
    })

    it('treats a bare `#` as clean — it is a top-of-page link, not an anchor', () => {
      expect(mountRoute('#')).toEqual({ router: 'hash', path: '/', write: '#!' })
    })

    it('writes the host-declared base path when there is one', () => {
      expect(mountRoute('', '/507/register')).toEqual({
        router: 'hash',
        path: '/507/register',
        write: '#!/507/register',
      })
    })

    it('rejects a base path that is not site-relative', () => {
      // `base-path` is a host-supplied attribute, so it goes through `safePath` before it
      // can reach react-router — the same guard `webPath` gets.
      expect(mountRoute('', '//evil.example')).toEqual({ router: 'hash', path: '/', write: '#!' })
      expect(mountRoute('', 'https://evil.example')).toEqual({
        router: 'hash',
        path: '/',
        write: '#!',
      })
    })
  })

  describe('a rootish widget hash', () => {
    // `#!` and `#!/` both route to `/`, so with nothing to apply there is nothing to write:
    // the URL the visitor is looking at stays exactly as it is. `#/!` is the SAME hash in
    // react-router's own spelling — see the `raw` comment in hash.ts.
    it.each(['#!', '#!/', '#/!', '#/!/'])('leaves %s alone when there is no base path', (hash) => {
      expect(mountRoute(hash)).toEqual({ router: 'hash', path: '/', write: undefined })
    })

    it.each(['#!', '#!/', '#/!', '#/!/'])('applies the base path over %s', (hash) => {
      expect(mountRoute(hash, '/507/register')).toEqual({
        router: 'hash',
        path: '/507/register',
        write: '#!/507/register',
      })
    })
  })

  describe('a widget route already in the hash', () => {
    // Both spellings, because the widget writes `#!…` at boot and react-router writes
    // `#/!…` for every navigation after it. `hash.router.test.tsx` proves that pairing
    // against the real router; these pin the classification.
    it.each(['#!/gb/london', '#/!/gb/london'])('%s wins over the base path', (hash) => {
      // The visitor navigated here, or deep-linked to it — re-applying `base-path` would
      // teleport them away from the page they asked for.
      expect(mountRoute(hash, '/507/register')).toEqual({
        router: 'hash',
        path: '/gb/london',
        write: undefined,
      })
    })

    it('keeps the query string with the route', () => {
      expect(mountRoute('#!/search?center=4.35,50.85')).toEqual({
        router: 'hash',
        path: '/search?center=4.35,50.85',
        write: undefined,
      })
    })
  })

  describe('a hostile widget hash', () => {
    // Ours by prefix, but not a route we will hand to react-router. Normalised back to
    // the base path rather than left in place — it IS our namespace.
    it.each([
      '#!//evil.example',
      '#!/\\evil.example',
      '#!/\tevil.example',
      '#!javascript:alert(1)',
      '#!https://evil.example',
      '#!foo',
    ])('%s boots at the base path instead', (hash) => {
      expect(mountRoute(hash, '/507/register')).toEqual({
        router: 'hash',
        path: '/507/register',
        write: '#!/507/register',
      })
    })
  })

  describe("the host page's own anchor", () => {
    // The blank-widget bug (ship-blocker #2): react-router's hash history reads these as a
    // location outside the `!` basename and renders null. The widget now routes in memory
    // and writes NOTHING, so the host's anchor — and its on-load scroll — survive.
    it.each(['#respond', '#comment-123', '#contact', '#tab-2'])('%s routes in memory', (hash) => {
      expect(mountRoute(hash)).toEqual({ router: 'memory', path: '/' })
    })

    it('still honours the base path for where to boot, and asks for no write', () => {
      expect(mountRoute('#respond', '/507/register')).toEqual({
        router: 'memory',
        path: '/507/register',
      })
    })
  })

  it('tolerates a missing hash', () => {
    expect(mountRoute(null)).toEqual({ router: 'hash', path: '/', write: `#${HASH_BASE}` })
    expect(mountRoute(undefined)).toEqual({ router: 'hash', path: '/', write: `#${HASH_BASE}` })
  })
})
