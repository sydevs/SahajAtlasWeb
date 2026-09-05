/**
 * Gives a JS entry the same discovery coverage an HTML entry gets for free
 * (issue #96).
 *
 * Vite writes a `<link rel="modulepreload">` hint into the HTML shell, for
 * the entry's WHOLE transitive static closure. `dist/index.html` lets a
 * browser discover every eager chunk from a single parse. `embed.js` has
 * no shell — nothing writes HTML for a page this widget does not own — so
 * a host discovers only what the entry itself imports directly, and
 * everything deeper costs an extra round trip. Measured on this build
 * before the fix: `embed.js` imported 7 of its 10 chunks directly. The
 * three it missed included `shared`, the single largest chunk in the
 * eager payload. A third of the embed's bytes arrived one round trip late.
 *
 * The fix has to be a static import, not an injected `<link>` tag. A
 * module's static imports get fetched AND evaluated before its body runs.
 * So a preload hint written from inside `embed.js` would execute after the
 * very graph it hints at — runtime injection cannot be early, even in
 * principle. Appending the missing chunks to the entry's own import list
 * puts the same information in the one place a host reads it in time.
 *
 * Two properties are load-bearing here:
 *
 *   1. **The missing chunks get appended AFTER the existing imports.** ES
 *      modules evaluate depth-first, in import order. Every chunk already
 *      reachable through an earlier import still evaluates exactly when
 *      it did before. These trailing specifiers resolve to
 *      already-evaluated modules. They only add fetch parallelism. They
 *      never reorder evaluation.
 *   2. **This only rewrites an entry whose filename carries no content
 *      hash.** The rewrite happens to `chunk.code` inside
 *      `generateBundle`, which runs AFTER rolldown has already hashed the
 *      output. Flattening an `assets/[name]-[hash].js` entry would ship
 *      bytes that no longer match the hash in their own filename, and
 *      that would break cache-busting. `embed.js` is safe, because
 *      `entryFileNames` pins it to that one literal name.
 */

/**
 * Every chunk reachable from `entry` through STATIC imports, including
 * `entry`'s own direct imports. `chunk.imports` is rolldown's own record
 * of static imports — it never records dynamic ones. So this is exactly
 * the eager graph `scripts/check-bundle-size.mjs` budgets.
 *
 * A `Set` walked with `for…of` visits values appended during the same
 * iteration. So this traversal needs no separate worklist.
 *
 * @param {Record<string, {type: string, imports?: string[]}>} bundle
 * @param {{imports?: string[]}} entry
 * @returns {Set<string>}
 */
export function importClosure(bundle, entry) {
  const closure = new Set(entry.imports ?? [])

  for (const file of closure) {
    const chunk = bundle[file]

    if (chunk?.type !== 'chunk') continue

    for (const dep of chunk.imports ?? []) closure.add(dep)
  }

  return closure
}

/**
 * The `import "…";` lines to append to an entry, one for every chunk in
 * its closure that it does not already import directly. Each specifier is
 * relative to the ENTRY's own directory, not the output root — `embed.js`
 * sits at the output root today, but `entryFileNames` is free to move it.
 *
 * @param {Record<string, {type: string, imports?: string[]}>} bundle
 * @param {{fileName: string, imports?: string[]}} entry
 * @returns {{ missing: string[], code: string }}
 */
export function flattenedImports(bundle, entry) {
  const direct = new Set(entry.imports ?? [])
  const missing = [...importClosure(bundle, entry)].filter((f) => !direct.has(f)).sort()

  // This uses POSIX path semantics regardless of the host OS. These are
  // URL-ish module specifiers. On Windows, `path.relative` would return
  // backslashes, and no browser can resolve those.
  const from = entry.fileName.includes('/') ? entry.fileName.replace(/\/[^/]*$/, '') : ''
  const specifier = (file) => {
    if (!from) return `./${file}`

    const segments = from.split('/')
    const target = file.split('/')
    let shared = 0

    while (shared < segments.length && segments[shared] === target[shared]) shared += 1

    const up = '../'.repeat(segments.length - shared)
    const rest = target.slice(shared).join('/')

    return up ? `${up}${rest}` : `./${rest}`
  }

  return { missing, code: missing.map((f) => `import "${specifier(f)}";`).join('\n') }
}

/**
 * The Vite plugin. `entryName` is the `rolldownOptions.input` KEY, not the
 * emitted filename. This couples the plugin to the config a few lines
 * away, instead of to a content hash.
 *
 * @param {string} entryName
 * @returns {import('vite').Plugin}
 */
export default function flattenEntryImports(entryName) {
  return {
    name: 'sy-flatten-entry-imports',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (c) => c.type === 'chunk' && c.isEntry && c.name === entryName,
      )

      // The second clause here narrows the type. `Array.prototype.find`
      // cannot carry that narrowing out of its own predicate function. It
      // is not really a second condition — an asset can never match `name`
      // and `isEntry` together.
      if (!entry || entry.type !== 'chunk') {
        // This calls `error`, not `warn`. A warning here would be as
        // invisible as silence. `pnpm build` has no `onwarn` override, and
        // Vite does not fail the build on rollup warnings. `pnpm size`
        // cannot catch this either — flattening changes DISCOVERY, not
        // bytes, so the size budget stays identical whether this plugin
        // ran or not. Renaming the input key would otherwise silently
        // revert this whole optimization, with every gate still green.
        this.error(
          `flattenEntryImports: no entry chunk named "${entryName}". Update the name to ` +
            'match the `rolldownOptions.input` key in vite.config.ts.',
        )

        return
      }

      // This enforces the invariant this file's header docblock calls
      // load-bearing. It does not trust a ternary elsewhere in the
      // codebase to keep holding. Rewriting a hash-named entry would ship
      // bytes that do not match the hash in their own filename. `_headers`
      // marks that path `immutable, max-age=31536000`, so the URL would
      // promise content-addressing while serving something else. `pnpm
      // size` cannot see this failure, because flattening changes
      // discovery, not bytes.
      if (/-[A-Za-z0-9_-]{8}\.js$/.test(entry.fileName)) {
        this.error(
          `flattenEntryImports: refusing to rewrite hash-named "${entry.fileName}" — ` +
            'generateBundle runs after hashing, so the emitted bytes would no longer match ' +
            'the hash. Give this entry a stable name via `entryFileNames` first.',
        )

        return
      }

      const { missing, code } = flattenedImports(bundle, entry)

      if (!missing.length) return

      entry.code += `\n${code}\n`
      entry.imports = [...(entry.imports ?? []), ...missing]
    },
  }
}
