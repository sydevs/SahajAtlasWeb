import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { currentChannel, supportedChannels } from '../../scripts/emit-versioned-entry.mjs'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

/**
 * Read straight from package.json, then handed to the same `supportedChannels` the build
 * uses. Hardcoding a channel here would let a version bump move the emitted paths while
 * this spec kept proving an old one — which it would still "prove", as the SPA shell.
 */
const VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version

/**
 * Every relative `.js` specifier in a built module, deduped.
 *
 * BACKTICKS matter as much as the shape. rolldown's minifier emits dynamic specifiers as
 * template literals — `import(\`./CalendarView-<hash>.js\`)` — so a class of only `"` and
 * `'` matched the static imports and silently skipped every lazy chunk in the build.
 *
 * `\.\.?/` covers `../` as well as `./`: chunks under `assets/` reference siblings, but the
 * versioned entry climbs out of its channel directory (issue #94), and one regex for both
 * describes is one fewer place for that claim to drift.
 */
const specifiersIn = (source: string) => [
  ...new Set([...source.matchAll(/["'`](\.\.?\/[^"'`]+\.js)["'`]/g)].map(([, s]) => s)),
]

/**
 * Resolve a specifier against the path of the module that named it. `new URL` rather than
 * string surgery, so `./` and `../` are handled by the same rule the browser uses — the
 * origin is a throwaway, only the pathname is read.
 */
const resolveFrom = (path: string, specifier: string) =>
  new URL(specifier, `https://smoke.invalid${path}`).pathname

/**
 * One GET per URL for the whole file. `retry: 2` in `vitest.smoke.config.ts` re-runs a
 * whole failing spec, so an unmemoized fetch is really three, and several specs here read
 * the same two entry files. Lazy rather than a `beforeAll`, so a run with no preview URL
 * skips without ever touching the network.
 *
 * A failure is NOT cached. Caching one would quietly defeat the retry it was written to
 * economise on: the preview is an edge deploy published seconds earlier, which is exactly
 * when a transient 5xx or a dropped connection happens, and re-awaiting a settled rejection
 * makes all three attempts identical and instant.
 */
const responses = new Map<string, Promise<{ status: number; type: string; body: string }>>()

function fetchOnce(path: string) {
  let pending = responses.get(path)

  if (!pending) {
    pending = fetchPreview(path)
      .then(async (res) => {
        if (res.status !== 200) responses.delete(path)

        return {
          status: res.status,
          type: res.headers.get('content-type') ?? '',
          body: await res.text(),
        }
      })
      .catch((err) => {
        responses.delete(path)
        throw err
      })

    responses.set(path, pending)
  }

  return pending
}

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
    const { status, body } = await fetchOnce('/embed.js')

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
    const { body } = await fetchOnce('/embed.js')

    // `embed.js` is unhashed and mutable while the chunks it names are hashed,
    // so a host (or proxy) holding a stale embed.js can ask for names the deploy
    // no longer contains, and the widget simply never appears. This catches the
    // deploy-side half of that skew: an embed.js published without its chunks.
    //
    // Every relative `.js` literal, not just the static-import shape: a lazy
    // chunk going missing is the same broken deploy, one interaction later.
    //
    // TRANSITIVE, not one level. `embed.js` names only its own imports, and the views
    // behind a lazy seam are reached from a chunk it names rather than from the entry —
    // so a one-level crawl stopped covering the calendar, registration and share chunks
    // the moment those moved behind `React.lazy` (issue #96). Following each body means
    // the set is the whole deploy the widget can ever ask for, however deep the seam.
    //
    // `specifiersIn` / `resolveFrom` are shared with the versioned-channel describe below,
    // so the specifier shape and the path arithmetic have one definition each.

    const broken: string[] = []
    const seen = new Set<string>()
    const queue = ['/embed.js']
    const bodies = new Map<string, string>([['/embed.js', body]])

    while (queue.length) {
      const path = queue.pop() as string
      const source = bodies.get(path)

      if (!source) continue

      for (const spec of specifiersIn(source)) {
        const next = resolveFrom(path, spec)

        if (seen.has(next)) continue

        seen.add(next)

        // GET, not HEAD: the body is both the assertion and the next frontier. The whole
        // deploy is ~440 KiB gzipped, and this lane runs separately from the PR gate.
        const { status, type, body: text } = await fetchOnce(next)

        if (status === 200 && /javascript|ecmascript/i.test(type)) {
          bodies.set(next, text)
          queue.push(next)
        } else {
          bodies.set(next, '')
          broken.push(`${next} → ${status} ${type}`)
        }
      }
    }

    const chunks = [...seen]

    expect(chunks.length).toBeGreaterThan(0)

    expect(broken).toEqual([])
  })
})

// The versioned channels (issue #94). `embed.js` above is the mutable URL every host
// shares; these are the per-major paths whose presence lets a host declare which major they
// integrated against. Each is a COPY of the entry with its specifiers rebased one directory
// up, and nothing local can prove that rebase is right: the bytes are identical either way,
// so `pnpm build` and `pnpm size` both stay green while every chunk import 404s.
//
// EVERY supported channel, not just the current one. A release that stopped emitting an
// older major would take a pinned host's widget away silently — `_redirects` answers the
// missing path with the SPA shell at 200 — and a spec that only checked the current channel
// would stay green right through it.
describe('versioned embed channels', () => {
  const channels = supportedChannels(VERSION)

  test.skipIf(skipWithoutPreview)(`publishes ${channels.join(', ')}`, async () => {
    expect(channels).toContain(currentChannel())

    const notServed: string[] = []

    for (const channel of channels) {
      const { type, body } = await fetchOnce(`/${channel}/embed.js`)

      // Content type, not status. `_redirects` is `/* /index.html 200`, so an unpublished
      // channel comes back as the SPA shell with a 200 — the exact failure this spec exists
      // to catch would pass a status check. The registration from src/Widget.tsx then says
      // it is the widget rather than some other JavaScript.
      const ok =
        /javascript|ecmascript/i.test(type) &&
        body.includes('customElements.define') &&
        body.includes('sahaj-atlas')

      if (!ok) notServed.push(`${channel} → ${type || 'no content-type'}`)
    }

    expect(notServed).toEqual([])
  })

  // The rebase, and the fact that both paths came out of ONE build.
  //
  // There is deliberately no fetch of the channel's chunks here. They resolve to the very
  // `/assets/…` URLs the crawl above already fetched and asserted — a strict subset — so
  // re-requesting them would spend a round trip each to re-learn the same thing. What is
  // genuinely unproven is textual: that the specifiers CLIMB (a copy that kept `./assets/…`
  // would ask for `/<channel>/assets/…`, which the SPA shell answers at 200), and that the
  // set matches the mutable entry's, which is what makes them one build rather than a copy
  // taken from some other deploy.
  test.skipIf(skipWithoutPreview)('climbs to the same chunks as the mutable entry', async () => {
    const mutable = await fetchOnce('/embed.js')
    const expected = specifiersIn(mutable.body).map((s) => resolveFrom('/embed.js', s))

    expect(expected.length).toBeGreaterThan(0)

    for (const channel of channels) {
      const { body } = await fetchOnce(`/${channel}/embed.js`)
      const specifiers = specifiersIn(body)

      expect(specifiers.filter((s) => !s.startsWith('../'))).toEqual([])
      expect(specifiers.map((s) => resolveFrom(`/${channel}/embed.js`, s))).toEqual(expected)
    }
  })
})
