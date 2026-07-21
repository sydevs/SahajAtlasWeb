import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: hashed-asset serving on the deployed preview. A request for an
// /assets file that doesn't exist (e.g. a chunk hash from a superseded
// deployment) must be a real 404 — guarded by functions/assets/[[path]].js —
// not the `_redirects` SPA fallback serving index.html with 200, which browsers
// reject as a module MIME mismatch and CDNs can cache under the asset URL.
// Real chunks must keep serving as JavaScript through that same function.

describe('hashed assets', () => {
  test.skipIf(skipWithoutPreview)('missing chunk is a 404, not the SPA shell', async () => {
    const res = await fetchPreview('/assets/no-such-chunk-Xy12Ab34.js')

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type') || '').not.toContain('text/html')
  })

  test.skipIf(skipWithoutPreview)('current chunks serve as JavaScript', async () => {
    const shell = await (await fetchPreview('/')).text()
    // Anchor to a real resource attribute so a stray /assets string in a
    // comment or inlined JSON can't become the fetched URL.
    const [, chunk] = shell.match(/(?:src|href)="(\/assets\/[^"]+\.js)"/) ?? []

    // The SPA shell always references at least one hashed chunk.
    expect(chunk).toBeTruthy()

    const res = await fetchPreview(chunk!)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') || '').toMatch(/javascript/)
  })
})
