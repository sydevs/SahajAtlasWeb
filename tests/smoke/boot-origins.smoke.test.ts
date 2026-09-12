import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy fetch from itself, or from a developer machine?
//
// The other specs in this lane ask whether files were deployed. This spec asks whether
// the deployed files point at a real origin. That is a different failure. It shipped
// silently on every preview in this repo until someone found it by hand.
//
// **What went wrong.** The build bakes `VITE_HOST` into the bundle. The bundle uses it
// to compose the absolute URL for the locale JSON fetch. Production sets `VITE_HOST` in
// the Pages dashboard. The Preview environment set nothing, so every preview inherited
// `.env`'s `http://localhost:5174` and shipped it to a `pages.dev` origin. Each locale
// fetch then became a cross-origin request to the reviewer's own machine. The browser
// refused it as a private-network access.
//
// **Why nothing caught it.** The failure does not degrade into missing strings. Missing
// strings is the shape a spec would expect and check for. Instead, i18next's `init`
// never resolves, so every component that reads a translation suspends forever. The
// widget renders nothing: no canvas, no content, no readiness marker. Meanwhile every
// existing smoke spec passed, because `_redirects`, `_headers`, `robots.txt`, `auto.js`,
// and `index.html` all deployed correctly. "The specs ran" stayed true. It did not mean
// "the widget works".
//
// **Why this spec still only fetches.** Running a browser in CI would catch more
// failures, and `docs/testing.md` explains why this lane fetches instead (see also the
// note at the top of `embed.smoke.test.ts`). A browser is not needed here. The defect is
// a string in the bundle, so reading the bundle observes it directly instead of
// inferring it. Reading the string also makes the test deterministic. It cannot pass
// only because a runner happens to have something listening on port 5174.

/** The `assets/*.js` files the standalone entry loads immediately: its `<script>` tag and its modulepreloads. */
const ASSET_REF = /(?:src|href)="(\/assets\/[^"]+\.js)"/g

/**
 * A host pattern that flags a build configured for a developer's machine. It matches
 * loopback addresses and the RFC1918 private ranges. A visitor's browser cannot reach
 * any of them. A build that names one kept a `.env` default it should have overridden.
 */
const PRIVATE_HOST =
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?/

/**
 * The origin this build actually requests from, found by the path it composes:
 * `${VITE_SAHAJCLOUD_URL}/api`.
 *
 * ⚠ **This was two origins until #198.** The other was `${VITE_HOST}/locales/…`, and it is the
 * one the original defect was about — but the widget no longer fetches locale JSON at all. Every
 * string now comes from SahajCloud, over the same origin checked below, and an English snapshot
 * is compiled in. The class of failure this spec exists for has not gone away, though: it just
 * has one door left instead of two, and that door is now load-bearing for copy as well as data.
 *
 * Warning: this check targets those two origins. It does not sweep for any private
 * host. A first draft of this spec swept broadly and produced a false positive.
 * react-router carries its own literal `http://localhost` as the base for `createURL`
 * when `window.location` is absent. A blanket scan flags that string on a healthy
 * deploy. What matters is not whether the string appears. What matters is whether an
 * origin the app fetches from is reachable from a visitor's browser, and this spec can
 * name those two origins directly.
 */
const REQUEST_ORIGINS = [
  {
    label: 'SahajCloud API (VITE_SAHAJCLOUD_URL)',
    pattern: /(https?:\/\/[^"'`\s\\)]+?)\/api["'`]/,
  },
] as const

/**
 * The eager graph, fetched once. `retry: 2` in the smoke config would otherwise triple
 * fourteen round trips.
 *
 * This stays lazy. A run with no preview URL never touches the network. A failure is
 * not cached. The preview is an edge deploy published seconds earlier, and that is
 * exactly when a transient 5xx is most likely to happen. Caching a failed promise would
 * make all three retries identical and instant instead of independent. `embed.smoke.test.ts`
 * uses the same reasoning.
 */
let graph: Promise<{ path: string; body: string }[]> | undefined

function fetchGraph() {
  graph ??= (async () => {
    const index = await fetchPreview('/')

    expect(index.status).toBe(200)

    const html = await index.text()
    const paths = [...new Set([...html.matchAll(ASSET_REF)].map((m) => m[1]))]

    // The entry script plus its modulepreloads. An empty list would make every
    // assertion below pass vacuously, so this check catches that failure on its own.
    expect(paths.length).toBeGreaterThan(0)

    return Promise.all(
      paths.map(async (path) => {
        const res = await fetchPreview(path)

        expect(res.status).toBe(200)

        return { path, body: await res.text() }
      }),
    )
  })().catch((err) => {
    graph = undefined
    throw err
  })

  return graph
}

/**
 * Reads each request origin from the shipped bundle.
 *
 * This fails when it cannot find an origin. It does not return an empty result. A
 * minifier change, or a refactor that composes the URL differently, could stop the
 * pattern from matching. That would make every assertion below pass vacuously.
 * `docs/testing.md` warns that this failure mode is the hardest to notice, because
 * nothing about it looks like a failure.
 */
async function requestOrigins() {
  const graph = await fetchGraph()

  return REQUEST_ORIGINS.map(({ label, pattern }) => {
    const hits = [
      ...new Set(
        graph.flatMap(({ path, body }) => {
          const found = body.match(new RegExp(pattern, 'g')) ?? []

          return found.map((hit) => ({ path, origin: hit.match(pattern)![1] }))
        }),
      ),
    ]

    expect(
      hits.length,
      `no ${label} origin found in the eager graph — has it moved?`,
    ).toBeGreaterThan(0)

    return { label, origin: hits[0].origin, chunk: hits[0].path }
  })
}

describe('boot origins', () => {
  test.skipIf(skipWithoutPreview)(
    'requests only origins a visitor can actually reach',
    async () => {
      const offenders = (await requestOrigins())
        .filter(({ origin }) => PRIVATE_HOST.test(origin))
        .map(({ label, origin, chunk }) => `${label} → ${origin} (${chunk})`)

      // Names the variable, not just the string. "Which env var produced this" is
      // always the next question, and naming the variable gives the answer someone
      // must set.
      expect(offenders).toEqual([])
    },
  )
})
