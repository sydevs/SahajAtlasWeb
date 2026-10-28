import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the published preview serve the SPA shell for a deep link that is
// not the root?
//
// The standalone build uses BrowserRouter. A direct GET /search only returns the app if
// the deploy has a fallback for an unbuilt path. On the Worker that is
// `assets.not_found_handling: "single-page-application"`; `public/_redirects`'s
// `/* /index.html 200` was it on Pages, until #283 deleted both. This spec guards that fix
// (from PR #3).
//
// The embeddable widget routes through the host page's own URL instead: a `?atlas=`
// query parameter by default, or the host page's pathname under `routing=path`. That
// routing never sends a deep-link request to this deploy, so the embeddable widget
// does not depend on the fallback.

describe('SPA deep-link fallback', () => {
  test.skipIf(skipWithoutPreview)('serves the SPA shell at a deep link (/search)', async () => {
    const res = await fetchPreview('/search')

    expect(res.status).toBe(200)

    const html = await res.text()

    // Same shell as the root page. The fallback rewrote /search to index.html.
    expect(html).toContain('id="syatlas"')
  })
})
