import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy actually resist direct indexing? (issue #106)
//
// Every part of that answer is a deploy-time fact, and the unit lane cannot reach it.
// `public/robots.txt` and `public/_headers` are inert files in the repo until the
// platform reads them out of the build output — Workers on the preview, Pages on
// `sahajatlas.com` until #266's last child moves the domain. `_headers` in particular
// asserts platform behavior, not code this repo wrote.

/**
 * The static tag in index.html. This pattern ignores attribute order on purpose. The
 * assertion is "this document says noindex", not "rolldown emitted the attributes in
 * our order".
 */
const NOINDEX_META = /<meta[^>]*\brobots\b[^>]*\bnoindex\b/i

describe('indexing directives', () => {
  test.skipIf(skipWithoutPreview)('serves robots.txt with a site-wide Disallow', async () => {
    const res = await fetchPreview('/robots.txt')

    // Checks content type, not status. See `docs/testing.md`. `_redirects` sets `/*
    // /index.html 200`, so a missing robots.txt also answers 200 as the SPA shell.
    // That is the failure this spec exists to catch.
    expect(res.headers.get('content-type')).toMatch(/text\/plain/i)

    const body = await res.text()

    expect(body).toMatch(/^User-agent:\s*\*$/im)
    expect(body).toMatch(/^Disallow:\s*\/$/im)

    // The link-preview allowance does real work, it is not decoration. ShareView
    // shares `event.webUrl ?? window.location.href`, so people do share a gated event
    // as a sahajatlas URL. Removing this group would turn those shared links into
    // bare URLs with no preview card.
    expect(body).toMatch(/^User-agent:\s*redditbot$/im)
  })

  // A real file backs `/`. Only the `_redirects` SPA fallback resolves `/search`.
  // Both return the same shell. This test does not check the header rule's path
  // matching. It checks that the rewrite keeps both noindex signals on the routes
  // people actually link to.
  test.skipIf(skipWithoutPreview).each(['/', '/search'])(
    'serves noindex at %s, as a header and in the shell',
    async (path) => {
      const res = await fetchPreview(path)

      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
      expect(await res.text()).toMatch(NOINDEX_META)
    },
  )

  test.skipIf(skipWithoutPreview)('serves noindex on the non-document URLs too', async () => {
    // This is the whole reason the header layer exists. `embed.js` carries no
    // document, so no `<meta>` tag can reach it, and it is a fetchable URL on its
    // own. If this test fails, the `/*` rule has stopped covering anything the meta
    // tag does not already cover.
    const res = await fetchPreview('/embed.js')

    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
    // Guards against the SPA shell answering with a 200, the same check as the
    // robots.txt case.
    expect(res.headers.get('content-type')).toMatch(/javascript|ecmascript/i)
  })

  test.skipIf(skipWithoutPreview)('adds the header without displacing the CORS rules', async () => {
    // This is the regression this change could realistically cause. CORS is a rendering
    // requirement (issue #91: a font always fetches in CORS mode), and the `/*` rule now
    // carries both it and the noindex header. This test asserts that one rule really serves
    // both, instead of trusting the comment in `_headers`.
    //
    // It pins `embed.js` since #198 removed the `/locales/*` rule this used to read. That is
    // the better subject anyway: it is the one file every host loads by a hardcoded URL, and
    // its own rule's `Cache-Control` is what the `/*` rule could displace.
    const res = await fetchPreview('/embed.js')

    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/i)
  })
})
