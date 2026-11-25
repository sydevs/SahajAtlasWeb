import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Serves the `circle-flags` package's country SVGs (MIT) at `/flags/<code>.svg` — emitted into
 * the build output, answered by the dev server — so `react-circle-flags` can point its `cdnUrl`
 * at our own origin rather than its default `react-circle-flags.pages.dev`, which anyone could
 * re-register if its owner let it lapse (#283's class). Nothing is committed: the version is
 * pinned in package.json. The licence ships beside the images.
 *
 * Only the two-letter ISO 3166-1 files are copied, not the package's subnational and language
 * sets. `src/lib/flag-cdn.ts` holds the matching client side.
 */
export default function circleFlags() {
  const pkgDir = dirname(createRequire(import.meta.url).resolve('circle-flags/package.json'))
  const flagsDir = join(pkgDir, 'flags')

  /** @returns {Promise<Map<string, Buffer>>} file name to bytes, the licence last */
  const load = async () => {
    const files = new Map()
    const names = (await readdir(flagsDir)).filter((name) => /^[a-z]{2}\.svg$/.test(name))

    for (const name of names) files.set(name, await readFile(join(flagsDir, name)))
    files.set('LICENSE.md', await readFile(join(pkgDir, 'LICENSE.md')))

    return files
  }

  return {
    name: 'sy-circle-flags',
    async generateBundle() {
      for (const [name, source] of await load()) {
        this.emitFile({ type: 'asset', fileName: `flags/${name}`, source })
      }
    },
    async configureServer(server) {
      const files = await load()

      server.middlewares.use('/flags/', (req, res, next) => {
        const file = files.get((req.url ?? '').split('?')[0].slice(1))

        if (!file) return next()
        // ⚠ Explicit: Ladle's server is Koa, which presets 404 before any middleware runs, so the
        // flags arrived as 404s and the browser drew none.
        res.statusCode = 200
        res.setHeader('Content-Type', req.url?.includes('.svg') ? 'image/svg+xml' : 'text/markdown')
        res.end(file)
      })
    },
  }
}
