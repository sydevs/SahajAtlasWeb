import type { Plugin } from 'vite'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'path'

import flattenEntryImports from './scripts/flatten-entry-imports.mjs'

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
  ],
  // `build.target` is intentionally left at the Vite 8 default (Baseline Widely
  // Available 2026-01-01: Chrome/Edge 111, Firefox 114, Safari 16.4) — see #45.
  // The map already requires modern browsers, so we accept the raised floor
  // rather than pinning an older one.
  build: {
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
