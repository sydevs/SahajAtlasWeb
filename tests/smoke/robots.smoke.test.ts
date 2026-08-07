import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy actually resist direct indexing (issue #106)?
//
// Every part of that answer is a deploy-time fact the unit lane cannot reach.
// `public/robots.txt` and `public/_headers` are inert files in the repo until
// Cloudflare Pages reads them out of the build output, and `_headers` in
// particular is a platform behaviour we assert rather than code we wrote.

/** The static tag in index.html. Attribute order is rolldown's, so match loosely. */
const NOINDEX_META = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i

describe('indexing directives', () => {
  test.skipIf(skipWithoutPreview)('serves robots.txt with a site-wide Disallow', async () => {
    const res = await fetchPreview('/robots.txt')

    // Content type, not status — see `.claude/rules/tests.md`. `_redirects` is
    // `/* /index.html 200`, so a robots.txt missing from the build comes back as
    // the SPA shell with a 200, which is the failure this spec exists to catch.
    expect(res.headers.get('content-type')).toMatch(/text\/plain/i)

    const body = await res.text()

    expect(body).toMatch(/^User-agent:\s*\*$/im)
    expect(body).toMatch(/^Disallow:\s*\/$/im)

    // The link-preview allowance is load-bearing, not decoration: the standalone
    // build deliberately keeps its OG tags and JSON-LD, and ShareView can hand out
    // a sahajatlas URL (`event.webUrl ?? window.location.href`). Dropping this group
    // would leave us serving preview metadata no compliant scraper may fetch.
    expect(body).toMatch(/^User-agent:\s*facebookexternalhit$/im)
  })

  // `/` is backed by a real file; `/search` is a route only the `_redirects` SPA
  // fallback resolves. Both matter and they are different paths through Pages: the
  // second proves the `/*` header rule is matched against the REQUEST path, so a
  // rewrite does not drop it. Without it every URL but `/` could be crawlable with
  // the lane still green.
  test.skipIf(skipWithoutPreview).each(['/', '/search'])(
    'serves noindex at %s, as a header and in the shell',
    async (path) => {
      const res = await fetchPreview(path)

      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
      expect(await res.text()).toMatch(NOINDEX_META)
    },
  )
})
