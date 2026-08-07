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

/**
 * The embed bundle, fetched once and shared. Both specs need the same body, and
 * `retry: 2` in the smoke config would otherwise triple the round trips. Lazy
 * rather than a `beforeAll`, so a run with no preview URL skips without ever
 * touching the network.
 *
 * A failure is NOT cached. Caching one would quietly defeat the retry it was
 * written to economise on: the preview is an edge deploy published seconds
 * earlier, which is exactly when a transient 5xx or a dropped connection
 * happens, and re-awaiting a settled rejection makes all three attempts
 * identical and instant.
 */
let embed: Promise<{ status: number; body: string }> | undefined

function fetchEmbed() {
  embed ??= fetchPreview('/embed.js')
    .then(async (res) => {
      if (res.status !== 200) embed = undefined

      return { status: res.status, body: await res.text() }
    })
    .catch((err) => {
      embed = undefined
      throw err
    })

  return embed
}

describe('embed bundle', () => {
  test.skipIf(skipWithoutPreview)('serves embed.js with the widget registration', async () => {
    const { status, body } = await fetchEmbed()

    expect(status).toBe(200)
    expect(body.length).toBeGreaterThan(0)

    // The registration itself: src/Widget.tsx ends in
    // `customElements.define('sahaj-atlas', …)`. Both survive minification, and
    // together they say the file is our widget rather than an SPA-fallback HTML
    // page served with a 200 — the failure mode a bare status check misses.
    expect(body).toContain('customElements.define')
    expect(body).toContain('sahaj-atlas')
  })

  test.skipIf(skipWithoutPreview)('serves every chunk embed.js references', async () => {
    const { body } = await fetchEmbed()

    // `embed.js` is unhashed and mutable while the chunks it names are hashed,
    // so a host (or proxy) holding a stale embed.js can ask for names the deploy
    // no longer contains, and the widget simply never appears. This catches the
    // deploy-side half of that skew: an embed.js published without its chunks.
    //
    // Every relative `.js` literal, not just the static-import shape: a lazy
    // chunk going missing is the same broken deploy, one interaction later.
    const chunks = [...new Set([...body.matchAll(/["'](\.\/[^"']+\.js)["']/g)].map((m) => m[1]))]

    expect(chunks.length).toBeGreaterThan(0)

    // The status alone proves nothing here. `public/_redirects` is
    // `/* /index.html 200`, so a chunk the deploy is missing comes back as the
    // SPA shell with a 200 — a check on `res.status` would pass for precisely
    // the failure this spec exists to catch. The content type is what
    // distinguishes a real chunk from the fallback HTML.
    const broken = await Promise.all(
      chunks.map(async (chunk) => {
        // HEAD: only the headers matter, and the bodies are ~440 KiB gzipped.
        const path = `/${chunk.replace(/^\.\//, '')}`
        const res = await fetchPreview(path, { method: 'HEAD' })
        const type = res.headers.get('content-type') ?? ''
        const served = res.status === 200 && /javascript|ecmascript/i.test(type)

        return served ? null : `${path} → ${res.status} ${type}`
      }),
    )

    expect(broken.filter(Boolean)).toEqual([])
  })
})
