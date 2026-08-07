import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy serve the thing a HOST installs?
//
// The other two specs fetch the standalone page (`index.html`), which is the dev
// and demo surface. The product is `embed.js` — the `<sahaj-atlas>` custom
// element — and nothing exercised it until this file: a build or deploy that
// emitted a broken embed while keeping the standalone page healthy would have
// shipped past a green Smoke check (issue #99).
//
// Fetch-level only, deliberately: this lane is fetch-based by design
// (`.claude/rules/tests.md`), and booting the widget in a real browser belongs
// to local Playwright verification, not CI.

describe('embed bundle', () => {
  test.skipIf(skipWithoutPreview)('serves embed.js with the widget registration', async () => {
    const res = await fetchPreview('/embed.js')

    expect(res.status).toBe(200)

    const js = await res.text()

    expect(js.length).toBeGreaterThan(0)

    // The registration itself: src/Widget.tsx ends in
    // `customElements.define('sahaj-atlas', …)`. Both survive minification, and
    // together they say the file is our widget rather than an SPA-fallback HTML
    // page served with a 200 — the failure mode a bare status check misses.
    expect(js).toContain('customElements.define')
    expect(js).toContain('sahaj-atlas')
  })

  test.skipIf(skipWithoutPreview)('serves every chunk embed.js statically imports', async () => {
    const js = await (await fetchPreview('/embed.js')).text()

    // `embed.js` is unhashed and mutable while the chunks it imports are hashed,
    // so a host (or proxy) holding a stale embed.js can ask for chunk names the
    // CDN no longer serves — a hard 404 with no fallback, and the widget simply
    // never appears. Asserting the graph resolves catches the deploy-side half
    // of that skew: an embed.js published without its own chunks.
    const chunks = [...js.matchAll(/from\s*["'](\.\/[^"']+\.js)["']/g)].map((m) => m[1])

    expect(chunks.length).toBeGreaterThan(0)

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetchPreview(`/${chunk.replace(/^\.\//, '')}`)

        return { chunk, status: res.status }
      }),
    )

    expect(results.filter((r) => r.status !== 200)).toEqual([])
  })
})
