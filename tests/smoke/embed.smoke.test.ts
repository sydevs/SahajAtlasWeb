import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { channelFor } from '../../scripts/emit-versioned-entry.mjs'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

/**
 * The channel directory the deploy is expected to publish, derived from the SAME function
 * the build derives it from (issue #94). Hardcoding `v0` here would let a version bump
 * move the emitted path while this spec kept proving the old one was still served — which
 * it would be, as the SPA shell, with a 200.
 */
const CHANNEL = channelFor(
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
)

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
    //
    // TRANSITIVE, not one level. `embed.js` names only its own imports, and the views
    // behind a lazy seam are reached from a chunk it names rather than from the entry —
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
    const queue = ['/embed.js']
    const bodies = new Map<string, string>([['/embed.js', body]])

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

// The versioned channel (issue #94). `embed.js` above is the mutable URL every host shares;
// this is the per-major path a host installs to keep a major bump from arriving unannounced.
// It is emitted as a COPY of the entry with its specifiers rebased one directory up, and
// nothing local can prove that rebase is right: the bytes are identical either way, so
// `pnpm size` and `pnpm build` both stay green while every chunk import 404s.
describe(`versioned embed channel (/${CHANNEL})`, () => {
  /** Relative specifiers in a built module, in source order. */
  const specifiersIn = (source: string) => [
    ...new Set([...source.matchAll(/["'`](\.\.?\/[^"'`]+\.js)["'`]/g)].map(([, s]) => s)),
  ]

  test.skipIf(skipWithoutPreview)('serves the versioned entry as the widget', async () => {
    const res = await fetchPreview(`/${CHANNEL}/embed.js`)

    // Content type, not status. `_redirects` is `/* /index.html 200`, so an unpublished
    // channel comes back as the SPA shell with a 200 — the exact failure this spec exists
    // to catch would pass a status check.
    expect(res.headers.get('content-type') ?? '').toMatch(/javascript|ecmascript/i)

    const body = await res.text()

    // Not a stub or a redirect page: the custom-element registration from src/Widget.tsx.
    expect(body).toContain('customElements.define')
    expect(body).toContain('sahaj-atlas')
  })

  test.skipIf(skipWithoutPreview)('resolves its chunks from the channel directory', async () => {
    const body = await (await fetchPreview(`/${CHANNEL}/embed.js`)).text()
    const specifiers = specifiersIn(body)

    expect(specifiers.length).toBeGreaterThan(0)

    // Every one must CLIMB. A copy that kept `./assets/…` would ask for
    // `/<channel>/assets/…`, which does not exist — and would be answered by the SPA shell
    // with a 200, so only the content type below can tell.
    expect(specifiers.filter((s) => !s.startsWith('../'))).toEqual([])

    const broken: string[] = []

    for (const specifier of specifiers) {
      const res = await fetchPreview(`/${CHANNEL}/${specifier}`.replace(/\/[^/]+\/\.\.\//, '/'))
      const type = res.headers.get('content-type') ?? ''

      if (!(res.status === 200 && /javascript|ecmascript/i.test(type))) {
        broken.push(`${specifier} → ${res.status} ${type}`)
      }
    }

    expect(broken).toEqual([])
  })

  // One build, two entry paths — not a post-build copy taken from some other deploy. If
  // these sets ever diverge, the pinned path is serving an entry whose chunks belong to a
  // different build, which is the cache-skew failure the channel exists to make avoidable.
  test.skipIf(skipWithoutPreview)('names the same chunks as the mutable entry', async () => {
    const [versioned, mutable] = await Promise.all(
      [`/${CHANNEL}/embed.js`, '/embed.js'].map(async (p) => (await fetchPreview(p)).text()),
    )

    const normalize = (specifiers: string[]) =>
      specifiers.map((s) => s.replace(/^\.\.?\//, '')).sort()

    expect(normalize(specifiersIn(versioned))).toEqual(normalize(specifiersIn(mutable)))
  })
})
