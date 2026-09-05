import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does Cloudflare actually apply the caching rules on the unhashed entry
// files? (#148)
//
// This is a deploy-time fact, and the unit lane cannot reach it in two ways.
// `public/_headers` is an inert text file in the repo until Cloudflare Pages reads it
// out of the build output. The thing under test is platform behavior, not code this
// repo wrote.
//
// This is also a regression test. The defect it guards against shipped invisibly.
// `_headers` carried a comment saying `embed.js` "must stay revalidated", but nothing
// enforced it, so the platform default applied. That default differs by host:
// `sahajatlas.com` served `max-age=14400`, while `*.pages.dev` served `max-age=0`.
// Every check anyone ran used the second host, so a four-hour staleness window on the
// production domain went unnoticed. A comment stating an intention is not a mechanism.
// This test is the mechanism.
//
// Four hours matters because these files are unhashed and mutable, and they import
// content-hashed chunks by name. A browser holding a stale copy requests chunk names
// the deploy no longer serves. `docs/embedding.md` states the result plainly: those
// 404 errors kill the widget with no fallback.

/** The unhashed files at the dist root. Hosts hardcode the first. The loader fetches the second. */
const ENTRY_FILES = ['/auto.js', '/embed.js']

/** Seconds a cached copy may be reused without asking. Anything above this is the #148 defect. */
const MAX_FRESHNESS_SECONDS = 60

describe('entry-file caching', () => {
  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)(
    '%s revalidates rather than going stale',
    async (path) => {
      const res = await fetchPreview(path)

      // Checks content type, not status. `_redirects` sets `/* /index.html 200`, so
      // a file missing from the build also answers 200 as the SPA shell. Every header
      // assertion below would then describe an HTML page instead. This is the lane's
      // second invariant.
      expect(res.headers.get('content-type')).toMatch(/javascript|ecmascript/i)

      const cacheControl = res.headers.get('cache-control') ?? ''

      expect(cacheControl).toBeTruthy()

      // This checks the number, not the exact header string. What matters is that a
      // browser cannot reuse a copy for long without asking. A future rule might
      // reasonably add `no-cache` or `s-maxage`. Parsing the value keeps this test
      // honest about the property, instead of the exact spelling.
      const maxAge = /max-age=(\d+)/i.exec(cacheControl)

      expect(maxAge, `no max-age in "${cacheControl}"`).not.toBeNull()
      expect(Number(maxAge?.[1])).toBeLessThanOrEqual(MAX_FRESHNESS_SECONDS)

      // These files must never carry this rule. If one ever inherited the
      // `/assets/*` immutable cache, a host's browser would hold it for a year.
      expect(cacheControl).not.toMatch(/immutable/i)
    },
  )

  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)('%s is readable cross-origin', async (path) => {
    const res = await fetchPreview(path)

    // A `type="module"` script fetches in CORS mode, so this header is a rendering
    // requirement, not a nicety. The font and locale rules make the same argument.
    // Pages supplies this header by default today. Pinning it here means the widget
    // does not depend on that default.
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // Pages applies every matching rule, and joins repeated header values with a comma.
  // A new rule can silently collide with an existing one. The `/*` rule sets
  // `X-Robots-Tag`, and the entry rules set different header names, so the two stay
  // safe together. This test asserts that, instead of assuming it, the same way
  // `robots.smoke.test.ts` asserts the CORS half.
  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)(
    '%s still carries the site-wide noindex header',
    async (path) => {
      const res = await fetchPreview(path)

      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
      expect(res.headers.get('cache-control')).not.toMatch(/,\s*public.*,\s*public/i)
    },
  )
})
