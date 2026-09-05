import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the Cloudflare Pages preview serve the SPA shell for a deep link that is
// not the root? The standalone build uses BrowserRouter, so a direct GET /search only returns
// the app if the `public/_redirects` fallback (`/* /index.html 200`) is deployed — this
// guards that fix (from PR #3). The embeddable widget uses HashRouter and does not depend on
// the fallback.

describe('SPA deep-link fallback', () => {
  test.skipIf(skipWithoutPreview)('serves the SPA shell at a deep link (/search)', async () => {
    const res = await fetchPreview('/search')

    expect(res.status).toBe(200)

    const html = await res.text()

    // Same shell as the root page — _redirects rewrote /search to index.html.
    expect(html).toContain('id="syatlas"')
  })
})
