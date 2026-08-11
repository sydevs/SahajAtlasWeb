#!/usr/bin/env node
/**
 * Post-build gate: prove no source map reaches the deployed output (#130).
 *
 * `vite.config.ts` emits `sourcemap: 'hidden'` when a build is credentialed to upload to
 * Sentry, and `@sentry/vite-plugin` deletes the maps once they are uploaded. This asserts
 * the RESULT on the emitted bytes rather than trusting the option that produced it — the
 * same standard `assert-css-scoped.mjs` holds the PostCSS pass to, and for the same
 * reason: an option renamed in a future major would otherwise start publishing our source
 * with every gate still green.
 *
 * What a leak would cost, so the severity isn't re-litigated: `public/_headers` serves
 * `/assets/*` with `Access-Control-Allow-Origin: *` and `max-age=31536000, immutable`. A
 * `.map` that ships is a CORS-open, year-cached copy of this repo's unminified source,
 * fetchable by anyone from a host page we don't own. The URL is content-hashed, so it
 * cannot be recalled by fixing the build.
 *
 * TWO checks, because a map file is not the only way source ships:
 *
 *   1. **No `.map` file in `dist/`.** The obvious one.
 *   2. **No `sourceMappingURL` in any emitted file.** This is the check that catches what
 *      the first cannot. `sourcemap: 'inline'` writes the ENTIRE map as a base64 data URI
 *      inside the JS and emits no `.map` file at all — so a one-word change to the config
 *      would publish every original source file while check 1 stayed green. It also
 *      catches the reverse mistake, a plain `sourcemap: true`, whose comment would survive
 *      the deletion as a signpost to a 404.
 *
 * Run via `pnpm build`, so CI and both Cloudflare Pages builds gate on it. It is also the
 * reason an upload failure is allowed to be non-fatal: the plugin's `errorHandler` lets a
 * deploy proceed without maps, and this is what still stops it proceeding WITH them.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// Resolved against this module, not the cwd — matching the other scripts here — so the
// gate can't pass or fail on where it happened to be invoked from.
const DIST = fileURLToPath(new URL('../dist', import.meta.url))

// Only the files a browser is served. `.map` is matched by NAME rather than read, and
// everything else here is text we scan for an inline map.
export const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html']

/**
 * The whole audit, as a pure function of a file listing and a reader.
 *
 * Separated from the filesystem so both checks can be driven from a spec: their failure
 * mode is that they stop firing, which is invisible on a build that has nothing to find.
 * `assert-no-sourcemaps.test.ts` pins each one, and the `scanned` count with them.
 *
 * @param {string[]} names Paths relative to the output directory.
 * @param {(name: string) => string | undefined} read Contents, or `undefined` if unreadable.
 * @returns {{ failures: string[], scanned: number }}
 */
export function auditOutput(names, read) {
  const failures = []
  const maps = names.filter((name) => name.endsWith('.map'))

  if (maps.length > 0) {
    failures.push(
      `${maps.length} source map(s) survived into the build output: ${maps.join(', ')}\n` +
        '  These must be uploaded and deleted, never deployed — /assets/* is served\n' +
        '  CORS-open and cached immutably for a year, so shipping one publishes this\n' +
        "  repo's source irrevocably. Check `sourcemaps.filesToDeleteAfterUpload` in\n" +
        '  vite.config.ts, and whether the plugin renamed that option.',
    )
  }

  let scanned = 0

  for (const name of names) {
    if (!SCANNED_EXTENSIONS.some((ext) => name.endsWith(ext))) continue

    const source = read(name)

    if (source === undefined) continue

    scanned += 1

    // Deliberately the bare token, not the `//#` comment form. An inline map, a dangling
    // reference and a `/*# … */` CSS comment are all worth failing on, and none of our own
    // source has any business containing the string — which the gate passing today asserts.
    if (source.includes('sourceMappingURL')) {
      failures.push(
        `${name} references a source map (\`sourceMappingURL\`).\n` +
          "  `build.sourcemap` must stay `'hidden'` or `false` — never `true` or `inline`.\n" +
          '  An INLINE map embeds every original source file in the shipped JS, where no\n' +
          '  .map-file check can see it.',
      )
    }
  }

  // A gate that scanned nothing passes for the wrong reason — the same silent-green
  // failure mode `assert-css-scoped.mjs` guards with its `sheets === 0` check.
  if (scanned === 0) {
    failures.push('found no scannable output — the build emitted nothing this gate reads')
  }

  return { failures, scanned }
}

function fail(message) {
  console.error(`\n✗ assert-no-sourcemaps: ${message}\n`)
  process.exit(1)
}

// Importing this module for its exports (the spec) must not run the gate against a `dist/`
// that may not exist.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(DIST)) {
    fail(`no ${DIST}/ — run \`vite build\` first`)
  }

  const { failures, scanned } = auditOutput(
    readdirSync(DIST, { recursive: true, encoding: 'utf8' }),
    (name) => {
      // `readdirSync({ recursive: true })` lists directories too, and a directory named
      // `foo.js` would throw EISDIR here rather than failing the check it belongs to.
      try {
        return readFileSync(join(DIST, name), 'utf8')
      } catch {
        return undefined
      }
    },
  )

  if (failures.length > 0) fail(failures.join('\n\n  '))

  console.log(
    `✓ assert-no-sourcemaps: no maps and no sourceMappingURL across ${scanned} emitted file(s)`,
  )
}
