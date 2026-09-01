import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy actually resist direct indexing (issue #106)?
//
// Every part of that answer is a deploy-time fact the unit lane cannot reach.
// `public/robots.txt` and `public/_headers` are inert files in the repo until
// Cloudflare Pages reads them out of the build output, and `_headers` in
// particular is a platform behaviour we assert rather than code we wrote.

/**
 * The static tag in index.html. Attribute-order-free on purpose: the assertion is
 * "this document says noindex", not "rolldown emitted the attributes in our order".
 */
const NOINDEX_META = /<meta[^>]*\brobots\b[^>]*\bnoindex\b/i

describe('indexing directives', () => {
  test.skipIf(skipWithoutPreview)('serves robots.txt with a site-wide Disallow', async () => {
    const res = await fetchPreview('/robots.txt')

    // Content type, not status — see `CLAUDE.md § Testing`. `_redirects` is
    // `/* /index.html 200`, so a robots.txt missing from the build comes back as
    // the SPA shell with a 200, which is the failure this spec exists to catch.
    expect(res.headers.get('content-type')).toMatch(/text\/plain/i)

    const body = await res.text()

    expect(body).toMatch(/^User-agent:\s*\*$/im)
    expect(body).toMatch(/^Disallow:\s*\/$/im)

    // The link-preview allowance is load-bearing, not decoration: ShareView hands out
    // `event.webUrl ?? window.location.href`, so a gated event IS shared as a
    // sahajatlas URL. Dropping this group turns those cards into bare links.
    expect(body).toMatch(/^User-agent:\s*redditbot$/im)
  })

  // `/` is backed by a real file; `/search` is a route only the `_redirects` SPA
  // fallback resolves. Both return the same shell, so this is not testing the header
  // rule's path matching — it is testing that a rewrite doesn't drop either signal on
  // the routes people are actually linked to.
  test.skipIf(skipWithoutPreview).each(['/', '/search'])(
    'serves noindex at %s, as a header and in the shell',
    async (path) => {
      const res = await fetchPreview(path)

      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
      expect(await res.text()).toMatch(NOINDEX_META)
    },
  )

  test.skipIf(skipWithoutPreview)('serves noindex on the non-document URLs too', async () => {
    // This is the whole reason the header layer exists: embed.js carries no document,
    // so no <meta> can reach it, and it is a fetchable URL of its own. If this fails,
    // `/*` has stopped covering anything the meta doesn't already cover.
    const res = await fetchPreview('/embed.js')

    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
    // Not the SPA shell wearing a 200 — the same guard as the robots.txt case.
    expect(res.headers.get('content-type')).toMatch(/javascript|ecmascript/i)
  })

  test.skipIf(skipWithoutPreview)('adds the header without displacing the CORS rules', async () => {
    // The regression this PR could realistically cause. `_headers` already carried
    // `/assets/*` and `/locales/*` CORS rules (issue #91 — a font is always fetched in
    // CORS mode, and blocked locale JSON renders every string as its raw key). Adding
    // `/*` is only safe because Pages applies EVERY matching rule; this asserts that
    // rather than trusting the doc quote in the comment there.
    const res = await fetchPreview('/locales/en/common.json')

    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
  })
})
