import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Smoke test: does the deploy fetch from ITSELF, or from somebody's laptop?
//
// This lane's other specs ask whether files were deployed. This one asks whether the
// deployed files point anywhere real — a different failure, and one that had been shipping
// silently on every preview in this repo until it was found by hand.
//
// **What went wrong.** `VITE_HOST` is baked into the bundle at build time and composes the
// absolute URL the locale JSON is fetched from. Production sets it in the Pages dashboard;
// the Preview environment had nothing, so every preview inherited `.env`'s
// `http://localhost:5174` and shipped it to a `pages.dev` origin. Each locale fetch then
// became a cross-origin request to the REVIEWER's own machine, refused as a private-network
// access.
//
// **Why nothing caught it.** The failure does not degrade into missing strings, which is the
// shape you would expect and the shape a spec would look for. i18next's `init` never
// resolves, so every component reading a translation suspends forever and the widget renders
// NOTHING — no canvas, no content, no readiness marker. Meanwhile every existing smoke spec
// passed, because `_redirects`, `_headers`, `robots.txt`, `auto.js` and `index.html` were all
// deployed perfectly. "The specs ran" stayed true; it just could not mean "the widget works".
//
// **Why this is still fetch-only.** Booting a browser in CI would catch more, and this lane
// is deliberately fetch-based (`.claude/rules/tests.md`, and the note at the top of
// `embed.smoke.test.ts`). It does not need one: the defect is a STRING IN THE BUNDLE, so
// reading the bundle back is a direct observation of it rather than an inference. That also
// makes the test deterministic — it cannot pass because a runner happened to have something
// listening on 5174.

/** The `assets/*.js` the standalone entry pulls in up front — its `<script>` + modulepreloads. */
const ASSET_REF = /(?:src|href)="(\/assets\/[^"]+\.js)"/g

/**
 * A host that means "this build was configured for a developer's machine". Loopback and the
 * RFC1918 ranges: none of them can be reached from a visitor's browser, and a build that names
 * one has taken a `.env` default it should have overridden.
 */
const PRIVATE_HOST =
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?/

/**
 * The two origins this build will actually make requests to, each found by the path it is
 * composed with: `${VITE_HOST}/locales/…` and `${VITE_SAHAJCLOUD_URL}/api`.
 *
 * ⚠ **Targeted rather than a sweep for any private host, and the difference is a false
 * positive that a first draft of this spec hit.** react-router carries a literal
 * `http://localhost` of its own as the base for `createURL` when there is no
 * `window.location`; a blanket scan flags it on a perfectly healthy deploy. What matters is
 * not whether the string appears but whether an origin the app FETCHES FROM is one a
 * visitor's browser can reach, and those two are nameable.
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
 * fourteen round trips. Lazy, so a run with no preview URL never touches the network, and a
 * failure is NOT cached — the preview is an edge deploy published seconds earlier, which is
 * exactly when a transient 5xx happens and where re-awaiting a settled rejection would make
 * all three attempts identical and instant. Same reasoning as `embed.smoke.test.ts`.
 */
let graph: Promise<{ path: string; body: string }[]> | undefined

function fetchGraph() {
  graph ??= (async () => {
    const index = await fetchPreview('/')

    expect(index.status).toBe(200)

    const html = await index.text()
    const paths = [...new Set([...html.matchAll(ASSET_REF)].map((m) => m[1]))]

    // The entry plus its modulepreloads. If this ever comes back empty the assertions below
    // would all vacuously pass, so it is a failure in its own right.
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
 * Read each request origin back out of the shipped bundle.
 *
 * Fails rather than returns nothing when one cannot be found: an origin that stops matching —
 * a minifier change, a refactor that composes the URL differently — would otherwise make every
 * assertion below vacuously true, which is the failure mode this lane's own rules warn is
 * hardest to notice because nothing about it looks like one.
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

      // Names the variable, not just the string, because "which env var produced this" is
      // always the next question and the answer is what someone has to go and set.
      expect(offenders).toEqual([])
    },
  )

  test.skipIf(skipWithoutPreview)(
    'serves the locale JSON from the origin the bundle will actually request',
    async () => {
      // Read the origin out of the bundle rather than assuming it is the preview's own. Both
      // answers are legitimate — production bakes in `sahajatlas.com`, a preview its own
      // deployment host — so what has to hold is that whatever was baked in RESOLVES.
      //
      // ⚠ **This is NOT the guard for a localhost origin, and must never be treated as one.**
      // Dialling the baked origin is environment-dependent: anyone running `pnpm dev` has
      // something answering on 5174, so against the very deploy that shipped this bug it
      // passed on a developer's machine and would only have failed on a runner. Verified,
      // not supposed. That case belongs to the private-host test above, which READS the
      // string rather than dialling it and so cannot be fooled by what is listening locally.
      // What this test owns is the other half: an origin that is public and simply wrong —
      // a typo, a retired host — which no amount of string inspection would catch.
      const locale = (await requestOrigins()).find((o) => o.label.startsWith('locale'))!
      const res = await fetch(`${locale.origin}/locales/en/common.json`)

      expect(res.status).toBe(200)

      // Parsed, not just 200: `_redirects` is `/* /index.html 200`, so a missing file answers
      // 200 `text/html` and only the body can tell the difference. The lane's second
      // invariant — status is not a result.
      const common = JSON.parse(await res.text())

      expect(common.widget?.label).toBeTruthy()
    },
  )

  test.skipIf(skipWithoutPreview)(
    'reaches its own translations, so the widget can finish booting',
    async () => {
      // The deploy must also SERVE them, independently of what the bundle asks for — a bundle
      // pointing somewhere valid and a deploy missing `public/locales/` are different faults
      // with the same blank-page symptom.
      for (const ns of ['common', 'events']) {
        const res = await fetchPreview(`/locales/en/${ns}.json`)

        expect(res.status).toBe(200)
        // Parsed, for the same reason as above: the SPA fallback answers 200 `text/html` for
        // a file that is not there, so only the body distinguishes the two.
        expect(Object.keys(JSON.parse(await res.text())).length).toBeGreaterThan(0)
      }
    },
  )

  test.skipIf(skipWithoutPreview)('serves those translations CORS-open', async () => {
    // Embedded, the widget runs on the host's page and fetches locales cross-origin, so the
    // `/locales/*` rule in `public/_headers` is what stands between a working embed and one
    // rendering every string as its raw dotted key (issue #91). `robots.smoke.test.ts` pins
    // that rule against displacement; this pins that it is doing its job on the real file.
    const res = await fetchPreview('/locales/en/common.json')

    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
