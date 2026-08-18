import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: are the caching rules on the unhashed entry files actually applied? (#148)
//
// This is a deploy-time fact the unit lane cannot reach twice over. `public/_headers` is an
// inert text file in the repo until Cloudflare Pages reads it out of the build output, and the
// thing being asserted is a platform behaviour rather than code we wrote.
//
// It is also a REGRESSION test for a defect that shipped, and shipped invisibly. `_headers` said
// in a comment that `embed.js` "must stay revalidated", and nothing enforced it — so the platform
// default applied, and the default is per-host: `sahajatlas.com` served `max-age=14400` while
// `*.pages.dev` served `max-age=0`. Every check anyone had run was against the second, so a
// four-hour staleness window on the production domain went unnoticed. A comment stating an
// intention is not a mechanism; this is the mechanism.
//
// Why four hours matters: these files are unhashed and mutable, and they import content-hashed
// chunks by name. A browser holding a stale copy asks for chunk names the deploy no longer
// serves, and `docs/embedding.md` states the consequence plainly — those 404s kill the widget
// with no fallback.

/** The unhashed files at the dist root. Hosts hardcode the first; the loader fetches the second. */
const ENTRY_FILES = ['/auto.js', '/embed.js']

/** Seconds a cached copy may be reused without asking. Anything above this is the #148 defect. */
const MAX_FRESHNESS_SECONDS = 60

describe('entry-file caching', () => {
  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)(
    '%s revalidates rather than going stale',
    async (path) => {
      const res = await fetchPreview(path)

      // Content type, not status. `_redirects` is `/* /index.html 200`, so a file missing from
      // the build comes back as the SPA shell with a 200 and every header assertion below would
      // then be describing an HTML page. This is the lane's second invariant.
      expect(res.headers.get('content-type')).toMatch(/javascript|ecmascript/i)

      const cacheControl = res.headers.get('cache-control') ?? ''

      expect(cacheControl).toBeTruthy()

      // The assertion is on the NUMBER, not on the exact header string: what matters is that a
      // browser cannot reuse a copy for long without asking, and a future rule might reasonably
      // say `no-cache` or add `s-maxage`. Parsing the value is what keeps this honest about the
      // property rather than the spelling.
      const maxAge = /max-age=(\d+)/i.exec(cacheControl)

      expect(maxAge, `no max-age in "${cacheControl}"`).not.toBeNull()
      expect(Number(maxAge?.[1])).toBeLessThanOrEqual(MAX_FRESHNESS_SECONDS)

      // The rule these files are deliberately NOT under. If one ever picks up the `/assets/*`
      // immutable cache, a host's browser would hold it for a year.
      expect(cacheControl).not.toMatch(/immutable/i)
    },
  )

  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)('%s is readable cross-origin', async (path) => {
    const res = await fetchPreview(path)

    // A `type="module"` script is fetched in CORS mode, so this is a rendering requirement
    // and not a nicety — the same argument the font and locale rules already make. Pages
    // supplies it by default today; pinning it means the widget does not depend on that.
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // Pages applies EVERY matching rule and joins repeated values with a comma, so a new rule can
  // silently collide with an existing one. `/*` sets `X-Robots-Tag` and the entry rules set
  // disjoint names, which is what makes them safe together — asserted rather than assumed,
  // exactly as `robots.smoke.test.ts` does for the CORS half.
  test.skipIf(skipWithoutPreview).each(ENTRY_FILES)(
    '%s still carries the site-wide noindex header',
    async (path) => {
      const res = await fetchPreview(path)

      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
      expect(res.headers.get('cache-control')).not.toMatch(/,\s*public.*,\s*public/i)
    },
  )
})
