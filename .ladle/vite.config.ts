import type { Plugin } from 'vite'

import { fileURLToPath } from 'url'
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'

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
const challengeHtml = fileURLToPath(new URL('../challenge.html', import.meta.url))

/**
 * Serves `/challenge.html` here too, so both form stories render a live challenge (#343).
 *
 * The forms frame that page on the bundle's own origin, which on this site is
 * `design.sahajatlas.com`. Ladle builds none of the app's entries by design — see the note
 * above — so the page was absent, the SPA fallback answered with the Ladle shell, and both
 * stories sat `blocked` with Submit disabled once the handshake timed out.
 *
 * ⚠ The page cannot simply be an input or a `public/` file. Ladle sets Vite's `root` to its own
 * app directory, so the page's `/src/challenge.ts` resolves from neither — hence `/@fs` while
 * serving, and an emitted chunk while building.
 */
function challengePage(): Plugin {
  const page = () => readFileSync(challengeHtml, 'utf8')
  const script = '/src/challenge.ts'
  let chunk = ''

  return {
    name: 'sy-ladle-challenge-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || new URL(req.url, 'http://ladle').pathname !== '/challenge.html') {
          next()

          return
        }

        server
          .transformIndexHtml(req.url, page().replace(script, `/@fs${srcDir}/challenge.ts`))
          .then((html) => {
            // The status is set explicitly: Vite's own html fallback has already parked a 404
            // on the response by the time this runs, and the frame would read that as a
            // refused page rather than a served one.
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
          }, next)
      })
    },
    buildStart() {
      chunk = this.emitFile({ type: 'chunk', id: `${srcDir}/challenge.ts`, name: 'challenge' })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'challenge.html',
        source: page().replace(script, `/${this.getFileName(chunk)}`),
      })
    },
  }
}

export default defineConfig({
  plugins: [challengePage()],
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
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
})
