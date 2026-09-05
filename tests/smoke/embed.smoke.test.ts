import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy serve the file a host installs?
//
// The other two specs in this lane fetch the standalone page (`index.html`), the dev
// and demo surface. The real product is the embed. Since #149, the file a host installs
// is `auto.js`, the loader, and it fetches `embed.js` on demand. So the crawl below
// starts at the loader instead of the widget. Starting at `embed.js` would still prove
// the widget deployed, but it would miss the one file every host actually references. A
// broken embed next to a healthy standalone page would otherwise pass a green Smoke
// check (issue #99).
//
// This lane stays fetch-level only, by design (`docs/testing.md`). Running the widget
// in a real browser belongs to local Playwright verification, not CI.

/**
 * The embed bundle, fetched once and shared. Both specs need the same body, and
 * `retry: 2` in the smoke config would otherwise triple the round trips. This stays
 * lazy instead of a `beforeAll`, so a run with no preview URL skips without touching
 * the network.
 *
 * A failure is not cached. Caching one would defeat the retry it exists to save on.
 * The preview is an edge deploy published seconds earlier, and that is exactly when a
 * transient 5xx or a dropped connection tends to happen. Re-awaiting a settled
 * rejection would make all three retries identical and instant instead of independent.
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

    // Two markers together show the file is the loader, not an SPA-fallback HTML page
    // served with a 200. A bare status check misses that failure mode. This spec
    // learned that lesson the hard way.
    expect(body).toContain('sahaj-atlas')
    expect(body).toContain('embed.js')

    // The whole split depends on this seam, and this spec checks it against the
    // deployed artifact, not only in the build. The widget must load through a
    // dynamic import. If someone changes it to a static import, the loader stops
    // being a loader. Every host would then pay the full payload on every page view
    // again, and nothing else here would notice.
    expect(body).toMatch(/import\(/)

    // A loader that is not small is not a loader. This limit is generous enough to
    // survive a minifier change, and tight enough that the widget graph could not
    // hide inside it.
    expect(body.length).toBeLessThan(20_000)
  })

  test.skipIf(skipWithoutPreview)('serves every chunk the loader can reach', async () => {
    const { body } = await fetchEmbed()

    // `auto.js` and `embed.js` are unhashed and mutable. The chunks they name are
    // hashed. A host or a proxy holding a stale copy can request names the deploy no
    // longer contains, and the widget then never appears. This spec catches the
    // deploy-side half of that mismatch: a loader published without the graph behind
    // it.
    //
    // This matches every relative `.js` literal, not only the static-import shape. A
    // missing lazy chunk is the same broken deploy, found one interaction later.
    //
    // The crawl is transitive, not one level deep, and that matters more now than
    // before. The whole widget sits behind one dynamic import from the loader. A
    // one-level crawl from `auto.js` would reach `embed.js` and stop, missing every
    // chunk the widget needs. The views behind a lazy seam load from a chunk that
    // names them, not from the entry file. A one-level crawl stopped covering the
    // calendar, registration, and share chunks the moment those moved behind
    // `React.lazy` (issue #96). Following each body in turn makes the found set the
    // whole deploy the widget can ever request, however deep the seam goes.
    //
    // Backticks matter as much as the transitive crawl. rolldown's minifier emits
    // dynamic specifiers as template literals, for example
    // `import(\`./CalendarView-<hash>.js\`)`. A pattern that matches only `"` and `'`
    // catches the static imports and silently skips every lazy chunk in the build.
    const RELATIVE_JS = /["'`](\.\/[^"'`]+\.js)["'`]/g
    // Chunks reference each other relative to their own directory. `embed.js` sits at
    // the root and points into `./assets/`. Everything under `assets/` points at its
    // siblings.
    const resolveFrom = (path: string, spec: string) =>
      `${path.slice(0, path.lastIndexOf('/'))}/${spec.replace(/^\.\//, '')}`

    // Status alone proves nothing here. `public/_redirects` sets `/* /index.html
    // 200`, so a missing chunk also answers 200 as the SPA shell. A check on
    // `res.status` would pass for exactly the failure this spec exists to catch. The
    // content type is what tells a real chunk apart from the fallback HTML.
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

        // Uses GET, not HEAD. The body serves both as the assertion and as the next
        // frontier to crawl. The whole deploy is roughly 440 KiB gzipped, and this
        // lane runs separately from the PR gate.
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
