import type { Plugin, PluginOption } from 'vite'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'path'

import flattenEntryImports from './scripts/flatten-entry-imports.mjs'

/**
 * Does this command upload source maps to Sentry? (#130)
 *
 * Two conditions, and BOTH are load-bearing.
 *
 * **The token**, because it is the only thing that means "uploading is intended here". A
 * contributor's `pnpm build`, CI's build job and every forked PR run without one, and all
 * of them must behave exactly as they did before this landed — no upload attempt, no
 * warning, no failure. It gates `build.sourcemap` as well as the plugin, and that pairing
 * is the point: maps are only ever WRITTEN by the build that is about to upload and then
 * delete them. Emitting them unconditionally would leave a copy of this repo's source in
 * the directory Cloudflare deploys, guarded only by a plugin that isn't running.
 *
 * **`command === 'build'`**, because this module is evaluated for EVERY Vite command, not
 * just builds. Without it the half-config throw below fired on `vite dev` and
 * `vite preview` too — verified, both died with "failed to load config" — so a
 * contributor with an ambient `SENTRY_AUTH_TOKEN` from any other Sentry-instrumented
 * project could not start the dev server, and the error talked about uploading source
 * maps on a command that uploads nothing. The justification for that throw (a deploy
 * going green with every frame minified) exists only for a build.
 */
const uploadsSourcemaps = (command: 'build' | 'serve') =>
  command === 'build' && Boolean(process.env.SENTRY_AUTH_TOKEN)

/**
 * Upload the maps to Sentry, then delete them. **They must never reach `dist/`.**
 *
 * Most of them would land under `public/_headers`' `/assets/*` rule —
 * `Access-Control-Allow-Origin: *` plus `max-age=31536000, immutable` — which makes a
 * shipped `.map` a CORS-open copy of our unminified source that cannot be recalled: the
 * URL is content-hashed and cached for a year. **`embed.js.map` is the exception worth
 * knowing**: it sits at the dist ROOT, outside that rule, so it would be merely public
 * rather than permanently public. That is a difference in how long the mistake lasts, not
 * in whether it is one.
 *
 * Two things keep that from happening, and only the second is a guarantee.
 * `filesToDeleteAfterUpload` is the plugin's own mechanism; `pnpm assert:maps` then reads
 * the built output back and fails the build if a single `.map` survived, so a renamed
 * option in a future major turns the build red instead of quietly publishing source.
 *
 * Two defaults are overridden, both because they reach OUT of the widget:
 *
 *  - **`release.inject` (defaults true) would write `window.SENTRY_RELEASE` onto the HOST
 *    page.** Verified in the installed source: the snippet is
 *    `var e = window…; e.SENTRY_RELEASE={id:"…"}`. That is the exact hazard #108 refused
 *    in the other direction — it pinned `release: undefined` so the host's global could
 *    not stamp OUR events — and injecting one would have us stamp THEIRS, since a site
 *    running its own Sentry reads that global by default. Frames resolve by debug ID
 *    instead, which needs no release at all; see the `release` option in `src/lib/report.ts`.
 *  - **`telemetry` (defaults true)** posts build data to Sentry from inside the deploy's
 *    critical path. Nothing about it is secret, but an outbound call is a decision here.
 *
 * **What we DO write onto the host page, and accept.** Refusing `release.inject` on the
 * grounds that it writes a global would be dishonest without saying that debug-ID
 * injection writes two of its own, at module evaluation, before any privacy flag is read:
 * `window._sentryDebugIds` and `window._sentryDebugIdIdentifier`. They are accepted
 * because there is no option that keeps debug-ID UPLOAD while dropping debug-ID
 * INJECTION — they are one mechanism — and because the shape is benign where
 * `SENTRY_RELEASE` is not. `_sentryDebugIds` is additive and keyed by stack string, so it
 * cannot displace a host's own entries (a host running Sentry may see our debug IDs on
 * their events where our frames appear, which is accurate rather than wrong);
 * `_sentryDebugIdIdentifier` is a plain overwrite but nothing reads it at runtime — only
 * the bundler reads it, off the artifact on disk.
 */
function sentrySourcemapUpload(command: 'build' | 'serve'): PluginOption {
  if (!uploadsSourcemaps(command)) return []

  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT

  // Fail on a HALF-configured build rather than uploading nowhere. The silent version of
  // this — token set, org missing, plugin skipped — is the failure #130 exists to end, and
  // it would be invisible: the deploy goes green and every frame stays minified.
  if (!org || !project) {
    throw new Error(
      'SENTRY_AUTH_TOKEN is set but SENTRY_ORG and/or SENTRY_PROJECT are not. ' +
        'Set all three to upload source maps, or none to build without them.',
    )
  }

  return sentryVitePlugin({
    org,
    project,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    telemetry: false,
    // **All four, not just `create`** — verified against the installed plugin, because
    // `create: false` alone is not "no release work". `createRelease()` runs four
    // independent actions and each has its own default: `setCommits` fires unless it is
    // explicitly `false`, and `finalize` defaults true. A first pass set only `inject` and
    // `create`, and the build log still showed `sentry-cli releases finalize <sha>` — a
    // call needing release-write scope on a token we want scoped to upload alone, whose
    // failure would be reported as "source-map upload failed" when the maps had uploaded
    // fine. The maps still upload; they match by debug ID, which needs no release.
    release: { inject: false, create: false, finalize: false, setCommits: false },
    sourcemaps: {
      // Resolved against this file, not the cwd, matching `stripDsStore` below — the
      // deletion cannot depend on where the build was invoked from. `**` matches zero
      // segments, so this covers root-level `embed.js.map` as well as `assets/*.map`.
      //
      // One constraint on the absolute form: the plugin globs this pattern with no `cwd`,
      // so glob metacharacters in the CHECKOUT PATH — `(`, `[`, `{`, `!`, `+`, `@` — are
      // parsed as magic. A clone under `~/Projects (old)/` would match nothing. Deliberately
      // not escaped here: the failure mode is "deletes nothing", which `pnpm assert:maps`
      // then turns into a red build rather than a silent leak, so the gate IS the mitigation.
      filesToDeleteAfterUpload: [`${resolve(import.meta.dirname, 'dist')}/**/*.map`],
    },
    // **Availability may degrade the diagnostics; it may never degrade the safety.**
    // Left to its default the plugin THROWS on a failed upload, which would make every
    // deploy of this widget — evergreen, shipped almost daily — depend on Sentry's ingest
    // being reachable. A bug fix should not be blocked by a telemetry outage.
    //
    // **Passing this handler disarms more than the upload throw, and that is the real
    // reason `assert:maps` exists.** `handleRecoverableError` only rethrows in the branch
    // where no `errorHandler` was given, so supplying one ALSO downgrades a failed
    // `deleteArtifacts()` — which the plugin calls with `throwByDefault: true` — from
    // "fail the build" to "log and exit 0, maps still on disk". That is the one path by
    // which a map could reach `dist/`, and the gate is what closes it.
    //
    // Note the converse, so this comment doesn't overclaim in the other direction: the
    // gate is NOT what saves an upload failure, because deletion runs in `writeBundle`'s
    // `finally` regardless of whether the upload threw. Confirmed end-to-end — upload
    // failed, exit 0, zero `.map` files.
    errorHandler: (error) => {
      console.error(
        `\n✗ sentry: source-map upload failed — this build ships WITHOUT maps, so its stack\n` +
          `  frames will not symbolicate. The deploy proceeds unless the maps were also left\n` +
          `  behind, which \`pnpm assert:maps\` catches.\n  ${error.message}\n`,
      )
    },
  }) as PluginOption
}

/**
 * Keep Finder's `.DS_Store` out of `dist/` (readiness report §1.1 housekeeping).
 *
 * Vite copies `publicDir` wholesale and offers no ignore option, so a `.DS_Store` a macOS
 * dev created in `public/` lands in the output. Belt-and-braces for the Cloudflare deploy,
 * which builds from a git clone where a gitignored file cannot exist — it is the local and
 * any manual-upload path this protects.
 */
function stripDsStore(): Plugin {
  let outDir = ''

  return {
    name: 'sy-strip-ds-store',
    apply: 'build',
    configResolved(config) {
      // Resolved against the config ROOT, not the cwd: Vite keeps `build.outDir` relative
      // to `root`, so resolving it here is what makes this independent of where the build
      // was invoked from.
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      // A sub-build with `write: false` emits nothing; an unguarded readdir would then
      // reject and fail a build this plugin has no business failing.
      if (!existsSync(outDir)) return

      const entries = await readdir(outDir, { recursive: true, withFileTypes: true })

      await Promise.all(
        entries
          // `isFile()` matters: `rm` without `recursive` throws EISDIR on a directory that
          // happens to carry the name, and `force` only swallows ENOENT — so the rejection
          // would escape Promise.all and fail a build this has no business failing.
          .filter((entry) => entry.isFile() && entry.name === '.DS_Store')
          .map((entry) => rm(resolve(entry.parentPath, entry.name), { force: true })),
      )
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    cssInjectedByJsPlugin({
      // v5 deprecated `styleId` in favor of `attributes`; host sites key off
      // this exact style-tag id, so keep it stable.
      attributes: { id: 'sahaj-atlas-style' },
      relativeCSSInjection: true,
      dev: { enableDev: true },
    }),
    react(),
    tsconfigPaths(),
    // `widget` is the input key below, whose `entryFileNames` emits `embed.js`.
    flattenEntryImports('widget'),
    stripDsStore(),
    // Position in this array is NOT what orders this one: `sentryVitePlugin` returns
    // `enforce: 'pre'`, so Vite hoists it ahead of every plugin above regardless. What
    // makes that safe is the phase, not the order — it uploads and deletes in
    // `writeBundle`, reading files off disk after Rollup has written all of them, so no
    // earlier plugin's output can be missed. (`flattenEntryImports` only appends to the
    // tail of `embed.js` in `generateBundle`, which shifts no mappings before it.)
    sentrySourcemapUpload(command),
  ],
  // `build.target` is intentionally left at the Vite 8 default (Baseline Widely
  // Available 2026-01-01: Chrome/Edge 111, Firefox 114, Safari 16.4) — see #45.
  // The map already requires modern browsers, so we accept the raised floor
  // rather than pinning an older one.
  build: {
    // `'hidden'`, not `true`: the maps are written for the upload but NO
    // `//# sourceMappingURL=` comment is appended to the shipped JS, so nothing advertises
    // them even during the seconds they exist on disk — and a stray one left behind after
    // the deletion would be a dangling 404 rather than a signpost. Gated so that a build
    // which cannot upload does not write them at all (see `uploadsSourcemaps`).
    sourcemap: uploadsSourcemaps(command) ? 'hidden' : false,
    cssCodeSplit: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        widget: './src/Widget.tsx',
      },
      output: {
        entryFileNames: (assetInfo) => {
          return assetInfo.name === 'widget' ? 'embed.js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
}))
