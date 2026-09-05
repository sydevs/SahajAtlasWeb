#!/usr/bin/env node
/**
 * A post-build gate: proves no source map reaches the deployed output (#130).
 *
 * `vite.config.ts` emits `sourcemap: 'hidden'` when a build is credentialed
 * to upload to Sentry, and `@sentry/vite-plugin` deletes the maps once they
 * are uploaded. This asserts the RESULT on the emitted bytes, rather than
 * trusting the option that produced it — the same standard
 * `assert-css-scoped.mjs` holds the PostCSS pass to, and for the same
 * reason: an option renamed in a future major would otherwise start
 * publishing our source with every gate still green.
 *
 * What a leak would cost, so the severity is not re-litigated: `public/_headers` serves
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
 * **It runs on BOTH deploy targets, and it has to be pointed at each of them.** This repo
 * ships two Cloudflare Pages projects: `sahajatlas` builds `pnpm build` → `dist/`, and
 * `sahajatlas-design` builds `pnpm ladle:build` → `build/`. `pnpm ladle:build` never runs
 * `pnpm build`, and Ladle builds through `.ladle/vite.config.ts` — which does not load
 * this repo's root config, so neither `build.sourcemap` nor the plugin exists there. The
 * playground therefore cannot emit a map *today*. It is wired up anyway, because Ladle
 * stories import the app's real `src/` tree, so anyone who adds `build: { sourcemap: true }`
 * to debug a story would publish that tree under the same `_headers` (`public/` is copied
 * into both outputs) with no gate anywhere in the pipeline. Hence the directory argument.
 *
 * It is also the reason an upload failure is allowed to be non-fatal — but for a narrower
 * reason than it looks. Deletion runs in `writeBundle`'s `finally` whether the upload threw
 * or not, so a failed UPLOAD leaves nothing behind. What passing `errorHandler` genuinely
 * disarms is the plugin's own rethrow on a failed DELETION, and that is the single path by
 * which a map could reach the output. This gate is what closes it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// The output directory to check, relative to this module (not the cwd — matching the other
// scripts here — so the gate can't pass or fail on where it happened to be invoked from).
// Defaults to the app's `dist/`. `pnpm ladle:build` passes `../build`.
const OUT_DIR = fileURLToPath(new URL(process.argv[2] ?? '../dist', import.meta.url))

// Only the files a browser is served. `.map` is matched by NAME rather than
// read, and everything else here is text this script scans for an inline
// map.
export const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html']

/**
 * The whole audit, as a pure function of a file listing and a reader.
 *
 * This is separated from the filesystem, so both checks can be driven from
 * a spec: their failure mode is that they stop firing, which is invisible
 * on a build that has nothing to find. `assert-no-sourcemaps.test.ts` pins
 * each one, and the `scanned` count with them.
 *
 * @param {string[]} names Paths relative to the output directory.
 * @param {(name: string) => string | undefined} read Contents, or `undefined` if unreadable.
 * @param {string} [secret] A value that must not appear in the output (the Sentry auth token).
 * @returns {{ failures: string[], scanned: number }}
 */
export function auditOutput(names, read, secret) {
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

    // Deliberately the bare token, not the `//#` comment form. An inline
    // map, a dangling reference, and a `/*# … */` CSS comment are all worth
    // failing on, and none of our own source has any business containing
    // the string — which the gate passing today asserts.
    if (source.includes('sourceMappingURL')) {
      failures.push(
        `${name} references a source map (\`sourceMappingURL\`).\n` +
          "  Usually this means `build.sourcemap` is no longer `'hidden'` or `false`: an\n" +
          '  INLINE map embeds every original source file in the shipped JS, where no\n' +
          '  .map-file check can see it.\n' +
          '  It can also be a dependency that merely embeds the literal string (it is\n' +
          '  ordinary content in stack-trace and source-map libraries). Confirm which by\n' +
          '  reading the match; if it is a dependency, exempt that file by name here\n' +
          '  rather than weakening the check for everything.',
      )
    }

    // This is belt-and-braces on the one secret this build reads. Vite
    // cannot inline a variable without a `VITE_` prefix, so this should be
    // unreachable — but "should be" is what this whole file exists to
    // replace, and a leaked auth token is worse than a leaked map. It costs
    // nothing on an uncredentialed build, where there is no secret to look
    // for.
    if (secret && source.includes(secret)) {
      failures.push(
        `${name} contains the value of SENTRY_AUTH_TOKEN.\n` +
          '  A build-time secret has reached the public bundle. Revoke that token before\n' +
          '  doing anything else, then find what put it there.',
      )
    }
  }

  // A gate that scanned nothing passes for the wrong reason — the same
  // silent-green failure mode `assert-css-scoped.mjs` guards with its
  // `sheets === 0` check.
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
  if (!existsSync(OUT_DIR)) {
    fail(`no ${OUT_DIR}/ — run the build first`)
  }

  const { failures, scanned } = auditOutput(
    readdirSync(OUT_DIR, { recursive: true, encoding: 'utf8' }),
    (name) => {
      // `readdirSync({ recursive: true })` lists directories too, and a
      // directory named `foo.js` would throw EISDIR here, rather than
      // failing the check it belongs to.
      try {
        return readFileSync(join(OUT_DIR, name), 'utf8')
      } catch {
        return undefined
      }
    },
    process.env.SENTRY_AUTH_TOKEN,
  )

  if (failures.length > 0) fail(failures.join('\n\n  '))

  console.log(
    `✓ assert-no-sourcemaps: no maps and no sourceMappingURL across ${scanned} emitted file(s)`,
  )
}
