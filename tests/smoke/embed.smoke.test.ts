import { describe, expect, test } from 'vitest'

import { appPreviewHost } from '../../scripts/assert-preview-host.mjs'
import { appWorkerName } from '../../scripts/_wrangler-config.mjs'
import { findLiveSiteKeys, findTestSiteKeys } from '../../scripts/turnstile-release-guard.mjs'
import { CHALLENGE_PATH } from '../../src/lib/turnstile-frame'

import { PREVIEW_URL, fetchPreview, skipWithoutPreview } from './_helpers/preview'

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

/**
 * Runs `crawl` once and shares the result, keeping only a CLEAN one.
 *
 * A broken chunk or a thrown fetch clears the memo, so each retry crawls again rather than
 * replaying the same transient 5xx (see `fetchEmbed`). Shared by both crawls below, because
 * two copies of this would be two chances to get the clearing wrong.
 */
function cacheCleanCrawl<T extends { broken: string[] }>(crawl: () => Promise<T>) {
  let cached: Promise<T> | undefined

  return () =>
    (cached ??= crawl().then(
      (result) => {
        if (result.broken.length > 0) cached = undefined

        return result
      },
      (err) => {
        cached = undefined
        throw err
      },
    ))
}

/**
 * Fetches one chunk, and decides whether the deploy really served it.
 *
 * ⚠ Status alone proves nothing: `assets.not_found_handling` serves the SPA shell with a
 * **200 `text/html`** for any path that is not a built asset, so a check on `res.status` would
 * pass for exactly the failure these crawls exist to catch. The content type is what tells a
 * real chunk from the fallback, and it is the lane's own invariant (`docs/testing.md`) — so it
 * has one implementation, read by both crawls.
 *
 * A chunk that failed is stored with an EMPTY body rather than omitted, so a spec reading the
 * bodies back cannot mistake a 404 for a chunk that genuinely carries nothing.
 */
async function fetchChunk(path: string, bodies: Map<string, string>, broken: string[]) {
  // Uses GET, not HEAD. The body serves both as the assertion and as the next frontier to
  // crawl. The whole deploy is roughly 440 KiB gzipped, and this lane runs separately from
  // the PR gate.
  const res = await fetchPreview(path)
  const type = res.headers.get('content-type') ?? ''

  if (res.status === 200 && /javascript|ecmascript/i.test(type)) {
    bodies.set(path, await res.text())

    return true
  }

  bodies.set(path, '')
  broken.push(`${path} → ${res.status} ${type}`)

  return false
}

/** Every chunk `auto.js` can reach, crawled once and shared by the specs below. */
const crawlDeploy = cacheCleanCrawl(crawlFromLoader)

async function crawlFromLoader() {
  const { body } = await fetchEmbed()

  // `auto.js` and `embed.js` are unhashed and mutable. The chunks they name are
  // hashed. A host or a proxy holding a stale copy can request names the deploy no
  // longer contains, and the widget then never appears. This spec catches the
  // deploy-side half of that mismatch: a loader published without the graph behind
  // it. The loader's body is already in hand, so it seeds the walk rather than
  // being fetched a second time.
  return crawlFrom([], new Map([['/auto.js', body]]))
}

/**
 * Walks a JavaScript graph on the deploy, from `seeds` plus anything already in hand.
 *
 * This matches every relative `.js` literal, not only the static-import shape. A missing lazy
 * chunk is the same broken deploy, found one interaction later.
 *
 * ⚠ **The crawl is transitive, not one level deep.** The whole widget sits behind one dynamic
 * import from the loader, so a one-level crawl from `auto.js` would reach `embed.js` and stop,
 * missing every chunk the widget needs. The views behind a lazy seam load from a chunk that
 * names them, not from the entry file: a one-level crawl stopped covering the calendar,
 * registration and share chunks the moment those moved behind `React.lazy` (issue #96).
 * Following each body in turn makes the found set the whole graph the widget can ever request,
 * however deep the seam goes — which is why the challenge page's own entry is walked through
 * this same function rather than read once.
 *
 * ⚠ **Backticks matter as much as the transitive crawl.** rolldown's minifier emits dynamic
 * specifiers as template literals, for example `import(\`./CalendarView-<hash>.js\`)`. A pattern
 * matching only `"` and `'` catches the static imports and silently skips every lazy chunk.
 */
async function crawlFrom(seeds: string[], prefetched = new Map<string, string>()) {
  const RELATIVE_JS = /["'`](\.\/[^"'`]+\.js)["'`]/g
  // Chunks reference each other relative to their own directory. `embed.js` sits at the root
  // and points into `./assets/`. Everything under `assets/` points at its siblings.
  const resolveFrom = (path: string, spec: string) =>
    `${path.slice(0, path.lastIndexOf('/'))}/${spec.replace(/^\.\//, '')}`

  const broken: string[] = []
  const bodies = new Map(prefetched)
  const seen = new Set<string>()
  const queue = [...prefetched.keys()]

  for (const path of seeds) {
    if (seen.has(path)) continue

    seen.add(path)

    if (await fetchChunk(path, bodies, broken)) queue.push(path)
  }

  while (queue.length) {
    const path = queue.pop() as string
    const source = bodies.get(path)

    if (!source) continue

    for (const [, spec] of source.matchAll(RELATIVE_JS)) {
      const next = resolveFrom(path, spec)

      if (seen.has(next)) continue

      seen.add(next)

      if (await fetchChunk(next, bodies, broken)) queue.push(next)
    }
  }

  return { seen: [...seen], broken, bodies }
}

/**
 * The Turnstile challenge page's own graph, crawled once and shared.
 *
 * It is a SECOND entry, not reachable from the loader: `challenge.html` is framed at runtime
 * by a URL the widget composes, so no `import()` names it and the crawl above cannot find it
 * (#343). Its chunks are where the site key now lives, which is why the key spec below reads
 * both maps.
 *
 * ⚠ **Transitive from the page's own scripts, not one level deep.** A one-level crawl is the
 * defect #96 recorded against the loader: it reads the entry and stops, so a chunk named only
 * by another chunk goes unchecked. `crawlFrom` is the same walk the loader uses, seeded with
 * the page's own `src` and `modulepreload` paths instead of `auto.js`.
 */
const crawlChallenge = cacheCleanCrawl(crawlChallengePage)

async function crawlChallengePage() {
  const res = await fetchPreview(CHALLENGE_PATH)
  const html = await res.text()
  // Vite emits the entry as a `<script type="module" src>` plus `modulepreload` links. Both
  // shapes are matched, because which chunks get a preload hint is the bundler's choice and
  // the key could be inlined into any of them.
  const seeds = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(([, path]) => path)
  const crawled = await crawlFrom(seeds)

  return { ...crawled, html, status: res.status, type: res.headers.get('content-type') ?? '' }
}

describe('turnstile challenge page', () => {
  // Every registration and every issue report frames this page. A deploy that does not serve
  // it answers the SPA shell with a 200 instead, so the frame loads the whole widget inside
  // itself, never sends a handshake, and the eager check fails the embed ten seconds later —
  // on every host at once.
  test.skipIf(skipWithoutPreview)('serves the challenge page, not the SPA shell', async () => {
    const { html, status, type } = await crawlChallenge()

    expect(status).toBe(200)
    expect(type).toMatch(/text\/html/)
    expect(html).toContain('id="challenge"')
    // The shell's own mount point. `assets.not_found_handling` serves it for any path the
    // deploy lacks, which is exactly the failure this case exists to catch.
    expect(html).not.toContain('id="syatlas"')
  })

  test.skipIf(skipWithoutPreview)('serves every chunk the challenge page names', async () => {
    const { broken, bodies } = await crawlChallenge()

    expect(bodies.size).toBeGreaterThan(0)
    expect(broken).toEqual([])
  })
})

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
    const { seen, broken } = await crawlDeploy()

    expect(seen.length).toBeGreaterThan(0)

    expect(broken).toEqual([])
  })
})

// The live half of #259's release guard: the build refuses a production build on the test key,
// and this reads what production actually serves, so a bypassed build gate still goes red.
//
// ⚠ The one spec in this lane whose expectation depends on the host, because the committed
// `.env` key IS correct on a preview — no real key validates on a `workers.dev` host. Only an
// address `assert-preview-host.mjs` accepts as the app Worker's preview may carry it; every
// other host, `sahajatlas.com` among them, is held to production's standard. The preview half is
// what keeps the production half honest: the same patterns must FIND the test key there, so a
// minifier change that hid the literal fails the PR gate instead of greening production.
//
// Both patterns come from the guard, so what this reads back is what the gate passes. Defining
// "a real key" a second time here, stricter, reddens production over a key the gate accepted.

describe('turnstile site key', () => {
  test.skipIf(skipWithoutPreview)(
    'ships the test key only on a preview, and a real key everywhere else',
    async () => {
      const loader = await crawlDeploy()
      const page = await crawlChallenge()

      // A chunk that failed to fetch is stored with an empty body, so a 404 on the chunk
      // carrying the key would read here as an unset build variable. The sibling cases above
      // own that failure and name it correctly.
      if (loader.broken.length > 0 || page.broken.length > 0) return

      // ⚠ Both graphs, because the key moved out of the widget's own into the challenge
      // page's when the challenge moved to a frame (#343) — and a key found in EITHER is a
      // key production serves. Reading only the loader's graph would report production as
      // carrying no key at all, and reading only the page's would miss a key re-inlined into
      // the widget.
      const bodies = [...loader.bodies, ...page.bodies]
      const where = (find: (body: string) => string[]) =>
        bodies.flatMap(([path, body]) => find(body).map((key) => `${path}: ${key}`))

      const testKeys = where(findTestSiteKeys)
      // A real key is public, but it stays out of CI logs: named by prefix only.
      const liveKeys = where((body) => findLiveSiteKeys(body).map((key) => `${key.slice(0, 7)}…`))

      if (appPreviewHost(PREVIEW_URL as string, appWorkerName())) {
        expect(
          testKeys.length,
          'no Turnstile test key found on a preview — moved, or renamed?',
        ).toBeGreaterThan(0)

        return
      }

      expect(
        testKeys,
        'production serves the Turnstile TEST key: set VITE_TURNSTILE_SITE_KEY as a Workers Builds build variable (docs/environment.md)',
      ).toEqual([])
      expect(
        liveKeys.length,
        'production serves no Turnstile site key at all: VITE_TURNSTILE_SITE_KEY is unset on its build',
      ).toBeGreaterThan(0)
    },
  )
})
