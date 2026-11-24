import { setTimeout as wait } from 'node:timers/promises'

import { describe, expect, test } from 'vitest'

import { auditBridge } from '../../scripts/assert-classic-bridge.mjs'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy serve the file a host installs?
//
// The other two specs in this lane fetch the standalone page (`index.html`), the dev
// and demo surface. The real product is the embed. A host installs `auto.js`, a
// classic-script bridge that starts `loader.js`, which fetches `embed.js` on demand
// (#149). So the crawl below starts at `auto.js` instead of the widget. Starting at
// `embed.js` would still prove
// the widget deployed, but it would miss the one file every host actually references. A
// broken embed next to a healthy standalone page would otherwise pass a green Smoke
// check (issue #99).
//
// This lane stays fetch-level only, by design (`docs/testing.md`). Running the widget
// in a real browser is the browser lane's job (`tests/browser/`), against this commit's
// build rather than the deploy.

/**
 * `auto.js`, fetched once and shared. Two specs need the same body, and
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

/**
 * How long the crawl waits out a 5xx before it calls a chunk broken.
 *
 * A 5xx is never how a MISSING chunk answers: `assets.not_found_handling` serves the SPA
 * shell with 200 `text/html`, which the content-type check below reports with no waiting
 * at all. What a 5xx does mean is a version uploaded seconds ago that has not finished
 * serving its own assets — measured on PR #466, where four chunks answered 500 for about
 * 25 seconds and 200 after. The lane's own `retry: 2` cannot buy that time, because each
 * retry re-crawls from scratch and so races the same window again.
 *
 * ⚠ Keep `SETTLE_ROUNDS` × `SETTLE_WAIT_MS` above that window. Under it the lane is back to
 * depending on the retry, which is the defect this replaced.
 */
const SETTLE_ROUNDS = 10
const SETTLE_WAIT_MS = 3_000

async function crawlFromLoader() {
  const { body } = await fetchEmbed()

  // `auto.js`, `loader.js` and `embed.js` are unhashed and mutable. The chunks they name are
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
  // one-level crawl from `loader.js` would reach `embed.js` and stop, missing every
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

  // Status alone proves nothing here. The SPA fallback answers `/* /index.html
  // 200`, so a missing chunk also answers 200 as the shell. A check on
  // `res.status` would pass for exactly the failure this spec exists to catch. The
  // content type is what tells a real chunk apart from the fallback HTML.
  const broken: string[] = []
  const seen = new Set<string>()
  const queue = ['/auto.js']
  const bodies = new Map<string, string>([['/auto.js', body]])
  let unsettled = new Map<string, string>()

  const read = async (path: string) => {
    // Uses GET, not HEAD. The body serves both as the assertion and as the next
    // frontier to crawl. The whole deploy is roughly 440 KiB gzipped, and this
    // lane runs separately from the PR gate.
    const res = await fetchPreview(path)
    const type = res.headers.get('content-type') ?? ''

    if (res.status === 200 && /javascript|ecmascript/i.test(type)) {
      bodies.set(path, await res.text())
      queue.push(path)

      return
    }

    if (res.status >= 500) {
      unsettled.set(path, `${path} → ${res.status} ${type}`)

      return
    }

    broken.push(`${path} → ${res.status} ${type}`)
  }

  for (let round = 0; ; round += 1) {
    while (queue.length) {
      const path = queue.pop() as string
      const source = bodies.get(path)

      if (!source) continue

      for (const [, spec] of source.matchAll(RELATIVE_JS)) {
        const next = resolveFrom(path, spec)

        if (seen.has(next)) continue

        seen.add(next)
        await read(next)
      }
    }

    if (unsettled.size === 0) break

    if (round >= SETTLE_ROUNDS) {
      broken.push(...unsettled.values())
      break
    }

    const retrying = [...unsettled.keys()]

    unsettled = new Map()

    await wait(SETTLE_WAIT_MS)

    for (const path of retrying) await read(path)
  }

  return { seen: [...seen], broken }
}

describe('embed bundle', () => {
  // Wix executes `auto.js` as a classic script, where one `import` stops everything before
  // a line of ours runs. The build gate reads `dist/`; this reads the bytes hosts get,
  // including production's, which alone carry the Sentry debug-ID snippet.
  test.skipIf(skipWithoutPreview)(
    'serves auto.js as a bridge that runs as a classic script',
    async () => {
      const { status, body } = await fetchEmbed()

      expect(status).toBe(200)
      expect(auditBridge(body)).toEqual([])
    },
  )

  test.skipIf(skipWithoutPreview)('serves loader.js as a loader, not as the widget', async () => {
    const res = await fetchPreview('/loader.js')
    const body = await res.text()

    expect(res.status).toBe(200)
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

  // The timeout covers the crawl plus `SETTLE_ROUNDS` waits, and the lane's config budgets
  // 30s. A broken deploy still fails on the first pass, so this slack is spent only on an
  // edge that is still settling.
  test.skipIf(skipWithoutPreview)(
    'serves every chunk the loader can reach',
    async () => {
      const { seen, broken } = await crawlFromLoader()

      expect(seen.length).toBeGreaterThan(0)

      expect(broken).toEqual([])
    },
    90_000,
  )
})
