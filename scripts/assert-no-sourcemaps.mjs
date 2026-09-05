#!/usr/bin/env node
/**
 * A post-build gate. It proves no source map reaches the deployed output
 * (#130).
 *
 * `vite.config.ts` sets `sourcemap: 'hidden'` when a build holds Sentry
 * credentials. `@sentry/vite-plugin` then deletes each map after it
 * uploads. This gate checks the RESULT in the emitted bytes. It does not
 * trust the option that produced the result. `assert-css-scoped.mjs` holds
 * the PostCSS pass to the same standard, for the same reason: a future
 * major version could rename that option, and every gate would then stay
 * green while the build published our source.
 *
 * A leak has a real cost, so this states it plainly. `public/_headers`
 * serves `/assets/*` with `Access-Control-Allow-Origin: *` and a one-year
 * immutable cache. A shipped `.map` file becomes a CORS-open, year-cached
 * copy of this repo's unminified source. Anyone can fetch it from a host
 * page we do not own. The URL is content-hashed, so fixing the build
 * cannot recall it.
 *
 * This gate runs two checks, because a map file is not the only way
 * source can ship:
 *
 *   1. **No `.map` file in `dist/`.** The obvious check.
 *   2. **No `sourceMappingURL` in any emitted file.** This check catches
 *      what the first cannot. `sourcemap: 'inline'` writes the entire map
 *      as a base64 data URI inside the JS, and emits no `.map` file at
 *      all. A one-word config change could then publish every original
 *      source file while check 1 stayed green. This check also catches
 *      the reverse mistake, a plain `sourcemap: true`, whose
 *      `sourceMappingURL` comment would survive the deletion step and
 *      point at a 404.
 *
 * **This gate runs on both deploy targets, and each target needs its own
 * path.** This repo ships two Cloudflare Pages projects: `sahajatlas`
 * builds with `pnpm build`, into `dist/`, and `sahajatlas-design` builds
 * with `pnpm ladle:build`, into `build/`. `pnpm ladle:build` never runs
 * `pnpm build`. Ladle builds through `.ladle/vite.config.ts`, which does
 * not load this repo's root config, so neither `build.sourcemap` nor the
 * Sentry plugin exists in the Ladle build. The playground cannot emit a
 * map today.
 *
 * This gate still checks the playground, because Ladle stories import the
 * app's real `src/` tree. `public/` gets copied into both build outputs,
 * so both share the same `_headers` file. Someone could add
 * `build: { sourcemap: true }` to a Ladle config to debug a story. That
 * change would publish the whole `src/` tree, with no other gate in the
 * pipeline to catch it. The directory argument below exists for this
 * reason.
 *
 * This is also why an upload failure is allowed to be non-fatal, though
 * the reason is narrower than it looks. Deletion runs inside
 * `writeBundle`'s `finally` block, whether the upload succeeded or not, so
 * a failed UPLOAD leaves no map behind. Passing `errorHandler` only
 * disarms the plugin's own rethrow on a failed DELETION. A failed deletion
 * is the one path by which a map could reach the output. This gate closes
 * that path.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

// The output directory to check. This path resolves against this module,
// not the current working directory, matching the other scripts here, so
// the gate's result never depends on where someone runs it from. It
// defaults to the app's `dist/`. `pnpm ladle:build` passes `../build`
// instead.
const OUT_DIR = fileURLToPath(new URL(process.argv[2] ?? '../dist', import.meta.url))

// Only the file types a browser is actually served. This script matches
// `.map` files by name, not by content. It scans every other listed
// extension as text, to find an inline map.
export const SCANNED_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html']

/**
 * The whole audit, written as a pure function of a file listing and a
 * reader function.
 *
 * This design separates the audit from the filesystem, so a test spec can
 * drive both checks directly. Each check's failure mode is that it
 * silently stops firing. That failure is invisible on a build with nothing
 * to find. `assert-no-sourcemaps.test.ts` pins both checks, and it pins
 * the `scanned` count too.
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

    // This checks for the bare token, not the `//#` comment form. An
    // inline map, a dangling reference, and a `/*# … */` CSS comment are
    // all worth failing on. None of our own source has any reason to
    // contain this string. Today's passing gate proves that.
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

    // This is extra protection for the one secret this build reads. Vite
    // cannot inline a variable without a `VITE_` prefix, so this check
    // should never trigger. But this whole file exists to replace "should
    // be" with a proof, and a leaked auth token is worse than a leaked
    // map. This check costs nothing on an uncredentialed build, where
    // there is no secret to look for.
    if (secret && source.includes(secret)) {
      failures.push(
        `${name} contains the value of SENTRY_AUTH_TOKEN.\n` +
          '  A build-time secret has reached the public bundle. Revoke that token before\n' +
          '  doing anything else, then find what put it there.',
      )
    }
  }

  // A gate that scanned nothing passes for the wrong reason.
  // `assert-css-scoped.mjs` guards the same silent-green failure with its
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

// A test spec imports this module only for its exports. That import must
// not run the gate against a `dist/` directory that may not exist.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(OUT_DIR)) {
    fail(`no ${OUT_DIR}/ — run the build first`)
  }

  const { failures, scanned } = auditOutput(
    readdirSync(OUT_DIR, { recursive: true, encoding: 'utf8' }),
    (name) => {
      // `readdirSync({ recursive: true })` lists directories, not only
      // files. A directory named `foo.js` would otherwise throw `EISDIR`
      // here. This try block turns that throw into the correct check
      // failure instead.
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
