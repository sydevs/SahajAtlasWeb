import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy actually resist direct indexing (issue #106)?
//
// Both halves of that answer are deploy-time facts the unit lane cannot reach.
// `public/robots.txt` and `public/_headers` are inert files in the repo until
// Cloudflare Pages reads them out of `dist/`, and `_headers` in particular is a
// platform behaviour we are asserting rather than code we wrote: that a `/*` rule
// still applies to a path only the `_redirects` SPA fallback resolves.

describe('indexing directives', () => {
  test.skipIf(skipWithoutPreview)('serves robots.txt with a site-wide Disallow', async () => {
    const res = await fetchPreview('/robots.txt')

    // The content type is the assertion, not the status. `public/_redirects` is
    // `/* /index.html 200`, so a robots.txt missing from the build comes back as
    // the SPA shell with a 200 and `text/html` — `expect(res.status).toBe(200)`
    // would pass for exactly the failure this spec exists to catch
    // (`.claude/rules/tests.md`, "status is not a result").
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

  test.skipIf(skipWithoutPreview)('serves noindex on the page and its header', async () => {
    const res = await fetchPreview('/')

    // The `/*` rule in public/_headers.
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)

    const html = await res.text()

    // The static tag in index.html — the signal for a crawler that fetches the
    // page but never executes the bundle that would inject a Helmet one.
    expect(html).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i)
  })

  test.skipIf(skipWithoutPreview)('serves noindex on a deep link too', async () => {
    // The route a visitor is most likely to be linked to is one no file backs:
    // `_redirects` rewrites it to index.html. This asserts the rewrite keeps both
    // signals — the header (matched against the REQUEST path, so `/*` still covers
    // it) and the shell's static meta. Without it, every URL but `/` could be
    // crawlable while the smoke lane stayed green.
    const res = await fetchPreview('/search')

    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
    expect(await res.text()).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i)
  })
})
