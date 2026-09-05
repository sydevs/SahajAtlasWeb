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
 * Gives a Cloudflare preview deploy its own origin as `VITE_HOST`.
 *
 * `VITE_HOST` has exactly one reader: `config/i18n.ts`'s `loadPath`. It
 * composes the absolute URL the locale JSON fetches from. The URL must be
 * absolute. An embedded widget runs on the host's page, but its
 * translations live wherever the bundle was served from. A relative path
 * would resolve against the host's origin, and return a 404.
 *
 * Production sets this value in the Pages dashboard, and this code
 * leaves it untouched — an explicit value always wins. That is also why
 * `pnpm dev`, CI, and every local build keep `.env`'s `localhost:5174`.
 * Preview deploys had no value set. So they inherited that localhost
 * default, and shipped it to a `pages.dev` origin. Every locale fetch
 * then became a cross-origin request to the reviewer's own machine,
 * blocked as a private-network access. i18next's `init` never resolved.
 * Every component reading a translation suspended forever. The widget
 * rendered nothing at all. This was not a missing-string problem. It was
 * a blank preview, on every PR.
 *
 * `CF_PAGES_URL` is Cloudflare's own answer: the URL of the current
 * deployment. Cloudflare documents it for exactly this case, "allowing
 * build tools to know the URL the page will be deployed at." Reading it
 * here, instead of asking someone to add a dashboard variable, also means
 * the value cannot go stale. Each preview gets its own per-deployment
 * host, and this approach works on a fork too.
 */
if (!process.env.VITE_HOST && process.env.CF_PAGES_URL) {
  process.env.VITE_HOST = process.env.CF_PAGES_URL
}

/**
 * Does this command upload source maps to Sentry? (#130)
 *
 * Two conditions gate this, and both matter.
 *
 * The token is the only signal that uploading is intended here. A
 * contributor's `pnpm build`, CI's build job, and every forked PR run
 * without a token. All of them must behave exactly as before: no upload
 * attempt, no warning, no failure. The token gates `build.sourcemap` as
 * well as the plugin. That pairing is the point — only the build that is
 * about to upload and then delete the maps ever writes them. Emitting
 * maps unconditionally would leave a copy of this repo's source in the
 * directory Cloudflare deploys, guarded only by a plugin that is not
 * running.
 *
 * `command === 'build'` matters because Vite evaluates this module for
 * every command, not only builds. Without this check, the half-config
 * throw below also fired on `vite dev` and `vite preview` (verified: both
 * commands died with "failed to load config"). A contributor with an
 * ambient `SENTRY_AUTH_TOKEN` from another Sentry-instrumented project
 * could not even start the dev server. The error talked about uploading
 * source maps, on a command that uploads nothing. The throw exists to
 * stop a deploy going green with every frame minified, and that risk
 * exists only for a build.
 */
const uploadsSourcemaps = (command: 'build' | 'serve') =>
  command === 'build' && Boolean(process.env.SENTRY_AUTH_TOKEN)

/**
 * Uploads the maps to Sentry, then deletes them. They must never reach
 * `dist/`.
 *
 * Most maps would land under `public/_headers`'s `/assets/*` rule:
 * `Access-Control-Allow-Origin: *` plus a one-year immutable cache. That
 * rule would make a shipped `.map` file a CORS-open copy of our
 * unminified source, and the content-hashed URL stays cached for a year,
 * so nothing could ever recall it. `embed.js.map` is the one exception
 * worth knowing. It sits at the dist root, outside that rule, so it
 * would only be public, not permanently public. That changes how long
 * the mistake lasts. It does not change whether it is a mistake.
 *
 * Two mechanisms stop this, and only the second one is a guarantee.
 * `filesToDeleteAfterUpload` is the plugin's own deletion step.
 * `pnpm assert:maps` then reads the built output back, and fails the
 * build if a single `.map` file survived. So a renamed plugin option in a
 * future major version turns the build red, instead of quietly
 * publishing source.
 *
 * Two plugin defaults are overridden here, because both reach outside
 * the widget:
 *
 *  - `release.inject` defaults to true, and it would write
 *    `window.SENTRY_RELEASE` onto the host page. The installed plugin
 *    source confirms the snippet: `var e = window…;
 *    e.SENTRY_RELEASE={id:"…"}`. Issue #108 refused this mirror hazard.
 *    It pinned `release: undefined`, so a host's own global could not
 *    stamp our events. Injecting our own release would let us stamp
 *    theirs instead, since a site running its own Sentry reads that
 *    global by default. Frames resolve by debug ID instead, which needs
 *    no release at all. See the `release` option in `src/lib/report.ts`.
 *  - `telemetry` defaults to true, and it posts build data to Sentry
 *    from inside the deploy's critical path. Nothing in that data is
 *    secret, but an outbound call from the deploy path is still a
 *    decision worth making on purpose.
 *
 * This config DOES write two things onto the host page, and accepts that
 * on purpose. Refusing `release.inject` for writing a global would be
 * dishonest, because debug-ID injection also writes two globals of its
 * own, at module evaluation, before any privacy flag is read:
 * `window._sentryDebugIds` and `window._sentryDebugIdIdentifier`. This
 * config accepts both. No plugin option keeps debug-ID upload while
 * dropping debug-ID injection — they are one mechanism. Their shape is
 * also benign where `SENTRY_RELEASE` is not. `_sentryDebugIds` only adds
 * entries, keyed by stack string, so it cannot displace a host's own
 * entries. A host running Sentry may see our debug IDs on events where
 * our frames appear, which is accurate, not wrong.
 * `_sentryDebugIdIdentifier` is a plain overwrite, but nothing reads it
 * at runtime. Only the bundler reads it, from the artifact on disk.
 */
function sentrySourcemapUpload(command: 'build' | 'serve'): PluginOption {
  if (!uploadsSourcemaps(command)) return []

  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT

  // This fails on a half-configured build, rather than silently
  // uploading nowhere. The silent version — token set, org missing,
  // plugin skipped — is the exact failure issue #130 exists to end. It
  // would stay invisible: the deploy goes green, and every frame stays
  // minified.
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
    // All four fields are set to false, not only `create`. The installed
    // plugin confirms that `create: false` alone does not mean "no
    // release work". `createRelease()` runs four independent actions,
    // and each has its own default: `setCommits` fires unless set
    // explicitly to false, and `finalize` defaults to true. An earlier
    // version set only `inject` and `create`, and the build log still
    // showed `sentry-cli releases finalize <sha>`. That call needs
    // release-write scope, on a token meant to be scoped to upload
    // alone. A failure there would report as "source-map upload failed"
    // even when the maps had uploaded fine. Maps still upload with all
    // four false. They match by debug ID, which needs no release at all.
    release: { inject: false, create: false, finalize: false, setCommits: false },
    sourcemaps: {
      // This path resolves against this file, not the current
      // directory, matching `stripDsStore` below. So deletion never
      // depends on where the build was invoked from. `**` matches zero
      // segments too, so this pattern covers the root-level
      // `embed.js.map` as well as `assets/*.map`.
      //
      // One constraint on this absolute path: the plugin globs it with
      // no `cwd`. So glob metacharacters in the checkout path itself —
      // `(`, `[`, `{`, `!`, `+`, `@` — get parsed as glob syntax. A clone
      // under `~/Projects (old)/` would match nothing. This is
      // deliberately left unescaped. The failure mode is "deletes
      // nothing", and `pnpm assert:maps` turns that into a red build,
      // rather than a silent leak. The gate is the actual mitigation.
      filesToDeleteAfterUpload: [`${resolve(import.meta.dirname, 'dist')}/**/*.map`],
    },
    // A Sentry outage may degrade diagnostics. It may never degrade
    // safety. Left at its default, the plugin throws on a failed upload.
    // That would make every deploy of this widget, evergreen and shipped
    // almost daily, depend on Sentry's ingest being reachable. A bug fix
    // should never be blocked by a telemetry outage.
    //
    // This handler disarms more than the upload throw, which is the
    // real reason `assert:maps` exists. `handleRecoverableError` only
    // rethrows when no `errorHandler` was given. So supplying one also
    // downgrades a failed `deleteArtifacts()` call — which the plugin
    // makes with `throwByDefault: true` — from "fail the build" to "log
    // the error and exit 0, maps still on disk". That is the one path by
    // which a map could reach `dist/`, and the gate closes it.
    //
    // The converse also holds, so this comment does not overclaim. The
    // gate does not save an upload failure by itself. Deletion runs in
    // `writeBundle`'s `finally` block regardless of whether the upload
    // threw. This was confirmed end-to-end: upload failed, exit code 0,
    // zero `.map` files left behind.
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
 * Keeps Finder's `.DS_Store` file out of `dist/` (readiness report §1.1
 * housekeeping).
 *
 * Vite copies `publicDir` wholesale, with no ignore option. So a
 * `.DS_Store` file a macOS developer created in `public/` lands in the
 * output. The Cloudflare deploy builds from a git clone, where a
 * gitignored file cannot exist, so it needs no protection here. This
 * plugin protects the local build and any manual-upload path instead.
 */
function stripDsStore(): Plugin {
  let outDir = ''

  return {
    name: 'sy-strip-ds-store',
    apply: 'build',
    configResolved(config) {
      // This path resolves against the config root, not the current
      // directory. Vite keeps `build.outDir` relative to `root`, so
      // resolving it here makes this step independent of where the
      // build was invoked from.
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      // A sub-build with `write: false` emits nothing. An unguarded
      // `readdir` call would then reject, and fail a build this plugin
      // has no business failing.
      if (!existsSync(outDir)) return

      const entries = await readdir(outDir, { recursive: true, withFileTypes: true })

      await Promise.all(
        entries
          // `isFile()` matters here. Without `recursive`, `rm` throws
          // `EISDIR` on a directory that happens to share the name, and
          // `force` only swallows `ENOENT`. So that rejection would
          // escape `Promise.all`, and fail a build this plugin has no
          // business failing.
          .filter((entry) => entry.isFile() && entry.name === '.DS_Store')
          .map((entry) => rm(resolve(entry.parentPath, entry.name), { force: true })),
      )
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Port 5174, not Vite's default 5173. WeMeditateWeb's dev server owns
  // port 5173, and the two servers run side by side when work touches
  // the `/map` embed. SahajCloud already assumes this port — see
  // `SAHAJATLAS_URL` in its `.env.example`.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174 },
  plugins: [
    cssInjectedByJsPlugin({
      // v5 deprecated `styleId` in favor of `attributes`. Host sites key
      // off this exact style-tag id. Keep it stable.
      attributes: { id: 'sahaj-atlas-style' },
      relativeCSSInjection: true,
      dev: { enableDev: true },
    }),
    react(),
    tsconfigPaths(),
    // `loader` is the input key below. Its `entryFileNames` setting
    // emits `auto.js`, the one script a host installs, and the entry
    // whose eager import graph is worth flattening. The host no longer
    // fetches `widget` (`embed.js`) directly. The loader imports it
    // dynamically once the element nears the viewport. So the browser
    // discovers its graph from that dynamic import, not from a
    // `<script>` tag parsed up front.
    flattenEntryImports('loader'),
    stripDsStore(),
    // This plugin's position in the array does not set its order.
    // `sentryVitePlugin` returns `enforce: 'pre'`, so Vite hoists it
    // ahead of every plugin above, regardless of array order. What makes
    // that safe is the build phase, not the order. It uploads and
    // deletes in `writeBundle`, after Rollup has already written every
    // file to disk. So no earlier plugin's output can be missed.
    // (`flattenEntryImports` only appends to the tail of `embed.js`,
    // inside `generateBundle`, which shifts no mappings before it.)
    sentrySourcemapUpload(command),
  ],
  // `build.target` deliberately stays at the Vite 8 default: Baseline
  // Widely Available 2026-01-01 (Chrome/Edge 111, Firefox 114, Safari
  // 16.4). See #45. The map already needs modern browsers, so this
  // config accepts that floor, instead of pinning an older one.
  build: {
    // This uses `'hidden'`, not `true`. Vite writes the maps for the
    // upload, but it adds no `//# sourceMappingURL=` comment to the
    // shipped JS. So nothing advertises the maps, even during the
    // seconds they exist on disk. A stray comment left behind after
    // deletion would point to a dangling 404 instead. This is gated, so
    // a build that cannot upload writes no maps at all (see
    // `uploadsSourcemaps`).
    sourcemap: uploadsSourcemaps(command) ? 'hidden' : false,
    cssCodeSplit: true,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // This is the one script a host installs. Nobody loads
        // `embed.js` directly any more — the loader imports it
        // dynamically. It stays an explicit entry so it keeps a stable,
        // unhashed filename. `pnpm size` measures it as its own graph,
        // and the smoke lane fetches it by name.
        loader: './src/loader/index.ts',
        widget: './src/Widget.tsx',
      },
      output: {
        // Both files stay unhashed, at the dist root. `auto.js` is the
        // URL hosts hardcode. `embed.js` is the name `auto.js` imports
        // by.
        entryFileNames: (assetInfo) => {
          if (assetInfo.name === 'loader') return 'auto.js'

          return assetInfo.name === 'widget' ? 'embed.js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
}))
