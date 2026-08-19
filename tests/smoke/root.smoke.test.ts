import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deployed Cloudflare Pages preview actually serve the app?
// This is the minimal "is the deploy alive" check — it fetches the root page and
// asserts the SPA shell is returned. It catches a broken build, a missing
// `_redirects` fallback, or a dead deploy. Deeper interaction coverage (clicking
// the map, entity routes, locales) is tracked for follow-up.

describe('root page', () => {
  test.skipIf(skipWithoutPreview)('serves the SPA shell at /', async () => {
    const res = await fetchPreview('/')

    expect(res.status).toBe(200)

    const html = await res.text()

    // The standalone build mounts into <div id="syatlas"> and puts the scope class on <html>
    // (see index.html). Two structural markers, deliberately NOT the page title: this spec used
    // to pin `<title>Sahaj Atlas`, which made a de-branding change (#156) fail a check that was
    // only ever trying to prove "this is our shell rather than an error page". A brand string is
    // the wrong anchor for that, and the worst kind — one that breaks precisely when the product
    // is doing what it set out to do.
    expect(html).toContain('id="syatlas"')
    expect(html).toContain('sy-atlas')
    expect(html).toMatch(/<title>[^<]+<\/title>/i)
  })
})
