import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy serve the thing a HOST installs?
//
// The other two specs fetch the standalone page (`index.html`), which is the dev
// and demo surface. The product is the embed — and since #149 the file a host
// installs is `auto.js`, the loader, which fetches `embed.js` on demand. So the
// crawl below starts at the loader rather than the widget: starting at `embed.js`
// would still prove the widget deployed, while missing the one file every host
// actually references. A build or deploy that emitted a broken embed while keeping
// the standalone page healthy would otherwise ship past a green Smoke check
// (issue #99).
//
// Fetch-level only, deliberately: this lane is fetch-based by design
// (`docs/testing.md`), and booting the widget in a real browser belongs
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
  embed ??= fetchPreview('/auto.js')
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
  test.skipIf(skipWithoutPreview)('serves auto.js as a loader, not as the widget', async () => {
    const { status, body } = await fetchEmbed()

    expect(status).toBe(200)
    expect(body.length).toBeGreaterThan(0)

    // Two markers, and together they say the file is our loader rather than an
    // SPA-fallback HTML page served with a 200 — the failure mode a bare status check
    // misses, and the one `embed.smoke.test.ts` learned the hard way.
    expect(body).toContain('sahaj-atlas')
    expect(body).toContain('embed.js')

    // The seam the whole split rests on, asserted on the deployed artifact rather than
    // only in the build: the widget must be reached through a DYNAMIC import. If someone
    // makes it static, the loader stops being a loader — every host silently goes back to
    // paying the full payload on every page view, and nothing else here would notice.
    expect(body).toMatch(/import\(/)

    // A loader that is not small is not a loader. Generous enough not to fail on a
    // minifier change, tight enough that the widget graph could not hide inside it.
    expect(body.length).toBeLessThan(20_000)
  })

  test.skipIf(skipWithoutPreview)('serves every chunk the loader can reach', async () => {
    const { body } = await fetchEmbed()

    // `auto.js` and `embed.js` are unhashed and mutable while the chunks they name are
    // hashed, so a host (or proxy) holding a stale copy can ask for names the deploy no
    // longer contains, and the widget simply never appears. This catches the deploy-side
    // half of that skew: a loader published without the graph behind it.
    //
    // Every relative `.js` literal, not just the static-import shape: a lazy
    // chunk going missing is the same broken deploy, one interaction later.
    //
    // TRANSITIVE, not one level — and now more load-bearing than ever, because the whole
    // widget sits behind ONE dynamic import from the loader. A one-level crawl from
    // `auto.js` would reach `embed.js` and stop, missing every chunk the widget needs.
    // The views behind a lazy seam are reached from a chunk it names rather than the entry —
    // so a one-level crawl stopped covering the calendar, registration and share chunks
    // the moment those moved behind `React.lazy` (issue #96). Following each body means
    // the set is the whole deploy the widget can ever ask for, however deep the seam.
    // BACKTICKS matter as much as the transitivity. rolldown's minifier emits dynamic
    // specifiers as template literals — `import(\`./CalendarView-<hash>.js\`)` — so a class
    // of only `"` and `'` matched the static imports and silently skipped every lazy chunk
    // in the build. The comment above has claimed otherwise since this spec was written.
    const RELATIVE_JS = /["'`](\.\/[^"'`]+\.js)["'`]/g
    // Chunks reference each other relative to their OWN directory. `embed.js` sits at the
    // root and points into `./assets/`; everything under `assets/` points at siblings.
    const resolveFrom = (path: string, spec: string) =>
      `${path.slice(0, path.lastIndexOf('/'))}/${spec.replace(/^\.\//, '')}`

    // The status alone proves nothing here. `public/_redirects` is `/* /index.html 200`,
    // so a chunk the deploy is missing comes back as the SPA shell with a 200 — a check on
    // `res.status` would pass for precisely the failure this spec exists to catch. The
    // content type is what distinguishes a real chunk from the fallback HTML.
    const broken: string[] = []
    const seen = new Set<string>()
    const queue = ['/auto.js']
    const bodies = new Map<string, string>([['/auto.js', body]])

    while (queue.length) {
      const path = queue.pop() as string
      const source = bodies.get(path)

      if (!source) continue

      for (const [, spec] of source.matchAll(RELATIVE_JS)) {
        const next = resolveFrom(path, spec)

        if (seen.has(next)) continue

        seen.add(next)

        // GET, not HEAD: the body is both the assertion and the next frontier. The whole
        // deploy is ~440 KiB gzipped, and this lane runs separately from the PR gate.
        const res = await fetchPreview(next)
        const type = res.headers.get('content-type') ?? ''

        if (res.status === 200 && /javascript|ecmascript/i.test(type)) {
          const text = await res.text()

          bodies.set(next, text)
          queue.push(next)
        } else {
          bodies.set(next, '')
          broken.push(`${next} → ${res.status} ${type}`)
        }
      }
    }

    const chunks = [...seen]

    expect(chunks.length).toBeGreaterThan(0)

    expect(broken).toEqual([])
  })
})
