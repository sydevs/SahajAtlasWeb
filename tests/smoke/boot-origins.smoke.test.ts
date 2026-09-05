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
 * The two origins this build actually requests from. Each pattern finds one by the path
 * it composes: `${VITE_HOST}/locales/…` and `${VITE_SAHAJCLOUD_URL}/api`.
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
  { label: 'locale JSON (VITE_HOST)', pattern: /(https?:\/\/[^"'`\s\\)]+?)\/locales\// },
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

  test.skipIf(skipWithoutPreview)(
    'serves the locale JSON from the origin the bundle will actually request',
    async () => {
      // Reads the origin out of the bundle. It does not assume the origin is the
      // preview's own. Both answers are valid: production bakes in `sahajatlas.com`,
      // and a preview bakes in its own deployment host. What must hold is that
      // whatever origin was baked in actually resolves.
      //
      // Warning: this is not a guard against a localhost origin. Do not treat it as
      // one. Calling the baked origin depends on the local environment. Anyone running
      // `pnpm dev` has something answering on port 5174. Against the deploy that
      // shipped this bug, this call would have passed on a developer's machine and
      // failed only on a CI runner. This test verifies the call. It does not assume
      // the result. The private-host test above owns that case: it reads the string
      // instead of calling it, so a locally listening port cannot fool it. This test
      // owns a different half: an origin that is public but wrong, such as a typo or a
      // retired host. No amount of string inspection can catch that case.
      const locale = (await requestOrigins()).find((o) => o.label.startsWith('locale'))!
      const res = await fetch(`${locale.origin}/locales/en/common.json`)

      expect(res.status).toBe(200)

      // This is parsed, not just checked for a 200 status. `_redirects` sets `/*
      // /index.html 200`, so a missing file also answers 200 with `text/html`. Only
      // the body can tell the two cases apart. This is the lane's second invariant: a
      // status code alone is not a result.
      const common = JSON.parse(await res.text())

      expect(common.widget?.label).toBeTruthy()
    },
  )

  test.skipIf(skipWithoutPreview)(
    'reaches its own translations, so the widget can finish booting',
    async () => {
      // The deploy must also serve the translation files, apart from what the bundle
      // requests. A bundle that points somewhere valid and a deploy missing
      // `public/locales/` are different faults with the same blank-page symptom.
      for (const ns of ['common', 'events']) {
        const res = await fetchPreview(`/locales/en/${ns}.json`)

        expect(res.status).toBe(200)
        // Parsed for the same reason as above. The SPA fallback answers 200
        // `text/html` for a missing file, so only the body tells the two cases apart.
        expect(Object.keys(JSON.parse(await res.text())).length).toBeGreaterThan(0)
      }
    },
  )

  test.skipIf(skipWithoutPreview)('serves those translations CORS-open', async () => {
    // When embedded, the widget runs on the host's page and fetches locales
    // cross-origin. The `/locales/*` rule in `public/_headers` is what makes that
    // fetch succeed. Without it, the widget renders every string as its raw dotted key
    // (issue #91). `robots.smoke.test.ts` pins the rule itself against displacement.
    // This spec pins that the rule works on the real deployed file.
    const res = await fetchPreview('/locales/en/common.json')

    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
