import type { Plugin } from 'vite'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { readdir, rm } from 'node:fs/promises'
import { posix, resolve } from 'path'

/**
 * Give the widget entry the discovery coverage `index.html` gets for free (issue #96).
 *
 * Vite writes a `<link rel="modulepreload">` for the entry's WHOLE transitive static
 * closure into the HTML shell, so the standalone page discovers every eager chunk from
 * one parse. `embed.js` has no shell — nothing writes HTML for a host page — so a host
 * discovers only what the entry itself imports, and everything deeper costs an extra
 * round trip. Measured on this build before the fix: embed.js imported 7 of its 10
 * chunks directly, and the three it did not include `shared` — the single largest chunk
 * in the eager payload. A third of the embed's bytes arrived one RTT late.
 *
 * The fix has to be a static import, not an injected `<link>`. A module's own static
 * imports are fetched AND evaluated before its body runs, so any preload hint written
 * from inside `embed.js` executes after the very graph it would have hinted at — the
 * runtime-injection approach the ticket floated cannot, even in principle, be early.
 * Appending the missing chunks to the entry's import list is the same information in the
 * only place a host will read it in time.
 *
 * Appended AFTER the existing imports, which is what makes it inert: ES modules evaluate
 * depth-first in import order, so the chunks already reachable through the earlier
 * imports are evaluated exactly when they were before and these trailing specifiers
 * resolve to already-evaluated modules. They add fetch parallelism, never a reorder.
 */
function flattenEntryImports(entryName: string): Plugin {
  return {
    name: 'sy-flatten-entry-imports',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (c) => c.type === 'chunk' && c.isEntry && c.name === entryName,
      )

      if (entry?.type !== 'chunk') {
        // Not a warning to be tidy: silence here would mean the embed quietly lost its
        // preload coverage because an entry was renamed, which is invisible in every gate.
        this.warn(`flattenEntryImports: no entry chunk named "${entryName}" — nothing flattened.`)

        return
      }

      // Breadth-first over the static import graph. `chunk.imports` is rolldown's own
      // record of static (never dynamic) imports, so this closure is exactly the eager
      // graph `scripts/check-bundle-size.mjs` budgets.
      const closure = new Set<string>(entry.imports)
      const queue = [...entry.imports]

      while (queue.length) {
        const next = bundle[queue.pop() as string]

        if (next?.type !== 'chunk') continue

        for (const dep of next.imports) {
          if (closure.has(dep)) continue
          closure.add(dep)
          queue.push(dep)
        }
      }

      const direct = new Set(entry.imports)
      const missing = [...closure].filter((f) => !direct.has(f)).sort()

      if (!missing.length) return

      // Specifiers are relative to the ENTRY's own directory, not the output root —
      // `embed.js` sits at the root today, but `entryFileNames` is free to move it.
      const from = posix.dirname(entry.fileName)
      const lines = missing.map((f) => {
        const rel = posix.relative(from, f)

        return `import "${rel.startsWith('.') ? rel : `./${rel}`}";`
      })

      entry.code += `\n${lines.join('\n')}\n`
      entry.imports = [...entry.imports, ...missing]
    },
  }
}

/**
 * Keep Finder's `.DS_Store` out of `dist/` (readiness report §1.1 housekeeping).
 *
 * Vite copies `publicDir` wholesale, so a `.DS_Store` a macOS dev created in `public/`
 * is deployed to the CDN — it is gitignored, which is precisely why nobody sees it in
 * review. Swept after the copy rather than filtered during it: `publicDir` has no
 * ignore option, and this also catches anything else that wrote one into the outDir.
 */
function stripDsStore(): Plugin {
  let outDir = 'dist'

  return {
    name: 'sy-strip-ds-store',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async closeBundle() {
      const root = resolve(outDir)

      const sweep = async (dir: string): Promise<void> => {
        for (const item of await readdir(dir, { withFileTypes: true })) {
          const path = resolve(dir, item.name)

          if (item.isDirectory()) await sweep(path)
          else if (item.name === '.DS_Store') await rm(path, { force: true })
        }
      }

      await sweep(root)
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
