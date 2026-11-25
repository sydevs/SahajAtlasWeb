import type { Plugin } from 'vite'

import { fileURLToPath } from 'url'

import { defineConfig } from 'vite'

import circleFlags from '../scripts/circle-flags.mjs'
import { CHALLENGE_PAGE, CHALLENGE_PATH } from '../src/mocks/challenge-page'

// Ladle runs its own Vite and React (SWC) plugin, and it sets Vite's
// `root` to its own app directory. This breaks vite-tsconfig-paths: it
// cannot find our tsconfig.json from there. So the app's usual `@/*`
// alias will not work here. Instead, this file resolves `@/` directly to
// the repo's `src/`. Ladle merges this alias array with its own msw and
// axe-core aliases, so both sets survive.
//
// The Tailwind/PostCSS pipeline still loads automatically from the root
// `postcss.config.js`. This file deliberately skips the production
// css-injected-by-js plugin and the app's multi-entry build config. Radix
// ships unstyled, so there is nothing of its own for Vite to auto-detect.
// The decorator imports `globals.css` directly instead.
const srcDir = fileURLToPath(new URL('../src', import.meta.url))

// `react-map-gl/mapbox` is Ladle's own wrapper, which never reuses a map (its docblock says why),
// and `ladle:react-map-gl` is the package's own ESM entry, for the wrapper alone to import.
const reactMapGl = fileURLToPath(new URL('./react-map-gl.tsx', import.meta.url))
const reactMapGlEntry = fileURLToPath(
  new URL('../node_modules/react-map-gl/dist/mapbox.js', import.meta.url),
)

/**
 * The Turnstile challenge, served at the path the app frames it on. A frame is a navigation, which
 * `backend.ts`'s `fetch` cannot answer, and without a challenge the interface's probe fails the
 * widget. Answered by the dev server, and emitted as `.html` for the static build, which Workers
 * serve at the bare path.
 */
function challengePage(): Plugin {
  return {
    name: 'sy-ladle-challenge',
    configureServer(server) {
      server.middlewares.use(CHALLENGE_PATH, (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html')
        res.end(CHALLENGE_PAGE)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${CHALLENGE_PATH.slice(1)}.html`,
        source: CHALLENGE_PAGE,
      })
    },
  }
}

export default defineConfig({
  plugins: [circleFlags(), challengePage()],
  // Ladle's own origin stands in for SahajCloud's: `backend.ts` answers every read sent there,
  // and the plugin above serves the challenge frame. Read at runtime, so the static build works
  // wherever it is deployed.
  define: { 'import.meta.env.VITE_SAHAJCLOUD_URL': 'globalThis.location.origin' },
  // Give Ladle its own dependency-optimization cache. Ladle force-includes
  // react, react-dom, and its own dependencies in optimizeDeps. So its
  // `configHash` differs from `pnpm dev`'s. Under rolldown-vite (Vite 8),
  // whichever server boots second re-optimizes and rewrites the shared
  // `node_modules/.vite` cache. The browser then mixes react and react-dom
  // chunks from two different passes ("require_react is not a function").
  // A separate cacheDir keeps the two caches apart.
  cacheDir: 'node_modules/.vite-ladle',
  // Vite serves optimized dependencies as `immutable, max-age=1yr`, under
  // a `?v=` hash. That hash comes from the config and the lockfile, not
  // from the file content. So the same URL can serve different bytes
  // after a re-optimization. A browser that cached a bad chunk, as
  // happened while the two servers shared a cacheDir, then pins that
  // chunk forever: the page fails with "Invalid hook call" or duplicate
  // React, the server log shows nothing, and no server-side fix can evict
  // the cached chunk. `no-cache` still allows a 304 revalidation, so the
  // only cost is a conditional request, not a full re-download.
  server: { headers: { 'Cache-Control': 'no-cache' } },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^react-map-gl\/mapbox$/, replacement: reactMapGl },
      { find: /^ladle:react-map-gl$/, replacement: reactMapGlEntry },
    ],
  },
})
