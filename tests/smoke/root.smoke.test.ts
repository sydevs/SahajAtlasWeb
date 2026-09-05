import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deployed Cloudflare Pages preview actually serve the app?
//
// This is the minimal "is the deploy alive" check. It fetches the root page and
// asserts that the SPA shell comes back. It catches a broken build, a missing
// `_redirects` fallback, or a dead deploy. Deeper interaction coverage, such as
// clicking the map, entity routes, and locales, is tracked for follow-up.

describe('root page', () => {
  test.skipIf(skipWithoutPreview)('serves the SPA shell at /', async () => {
    const res = await fetchPreview('/')

    expect(res.status).toBe(200)

    const html = await res.text()

    // The standalone build mounts into `<div id="syatlas">` and puts the scope class
    // on `<html>` (see index.html). These are two structural markers, and
    // deliberately not the page title. This spec used to pin `<title>Sahaj Atlas`,
    // and a de-branding change (#156) then failed a check meant only to prove "this
    // is our shell, not an error page". A brand string is the wrong anchor for that
    // proof. It is the worst kind of wrong anchor: it breaks precisely when the
    // product does what it set out to do.
    expect(html).toContain('id="syatlas"')
    expect(html).toContain('sy-atlas')
    expect(html).toMatch(/<title>[^<]+<\/title>/i)
  })
})
