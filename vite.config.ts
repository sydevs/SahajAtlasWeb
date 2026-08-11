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
 * Does this build upload source maps to Sentry? (#130)
 *
 * The gate is the TOKEN, not a flag, because the token is the only thing that means
 * "uploading is intended here". A contributor's `pnpm build`, CI's build job, `pnpm dev`
 * and every forked PR run without one, and all of them must behave exactly as they did
 * before this landed — no upload attempt, no warning, no failure.
 *
 * It gates `build.sourcemap` as well as the plugin, and that pairing is the point. Maps
 * are only ever WRITTEN by the build that is about to upload and then delete them, so on
 * every other machine `dist/` is byte-for-byte what it was. Emitting them unconditionally
 * would leave a copy of this repo's source in the directory Cloudflare deploys, guarded
 * only by a plugin that isn't running.
 */
const uploadsSourcemaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

/**
 * Upload the maps to Sentry, then delete them. **They must never reach `dist/`.**
 *
 * `public/_headers` serves `/assets/*` with `Access-Control-Allow-Origin: *` and a
 * one-year immutable cache, so a `.map` that ships is a CORS-open, permanently cached
 * copy of our unminified source, served from a host page we don't own. There is no
 * recalling it: the URL is content-hashed and cached for a year.
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
 * `release.create` follows `inject` off: with no release named or injected, a release
 * object created per deploy is one nothing would ever reference.
 */
function sentrySourcemapUpload(): PluginOption {
  if (!uploadsSourcemaps) return []

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
      // deletion cannot depend on where the build was invoked from.
      filesToDeleteAfterUpload: [`${resolve(import.meta.dirname, 'dist')}/**/*.map`],
    },
    // **Availability may degrade the diagnostics; it may never degrade the safety.**
    // Left to its default the plugin THROWS on a failed upload, which would make every
    // deploy of this widget — evergreen, shipped almost daily — depend on Sentry's ingest
    // being reachable. A bug fix should not be blocked by a telemetry outage. So an upload
    // failure is loud in the build log and the deploy proceeds WITHOUT maps for that
    // build, which is exactly the status quo this ticket improves on.
    //
    // The safety half is not traded away with it: if the maps are still in `dist/` when
    // `assert:maps` runs, that fails and nothing deploys at all.
    errorHandler: (error) => {
      console.error(
        `\n✗ sentry: source-map upload failed — this build ships WITHOUT maps, so its stack\n` +
          `  frames will not symbolicate. The deploy itself is unaffected.\n  ${error.message}\n`,
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
export default defineConfig({
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
    // Last: it reads the finished bundle and deletes out of the output directory, so it
    // must run after everything that writes there.
    sentrySourcemapUpload(),
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
    sourcemap: uploadsSourcemaps ? 'hidden' : false,
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
})
