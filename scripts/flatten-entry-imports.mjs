/**
 * Give a JS entry the discovery coverage an HTML entry gets for free (issue #96).
 *
 * Vite writes a `<link rel="modulepreload">` for the entry's WHOLE transitive static
 * closure into the HTML shell, so `dist/index.html` lets a browser discover every eager
 * chunk from one parse. `embed.js` has no shell — nothing writes HTML for someone else's
 * page — so a host discovers only what the entry itself imports, and everything deeper
 * costs an extra round trip. Measured on this build before the fix: `embed.js` imported
 * 7 of its 10 chunks directly, and the three it missed included `shared`, the single
 * largest chunk in the eager payload. A third of the embed's bytes arrived one RTT late.
 *
 * The fix has to be a static import, not an injected `<link>`. A module's static imports
 * are fetched AND evaluated before its body runs, so any preload hint written from inside
 * `embed.js` executes after the very graph it would have hinted at — runtime injection
 * cannot, even in principle, be early. Appending the missing chunks to the entry's own
 * import list is the same information in the only place a host reads it in time.
 *
 * Two properties are load-bearing:
 *
 *   1. **Appended AFTER the existing imports.** ES modules evaluate depth-first in import
 *      order, so every chunk already reachable through an earlier import is evaluated
 *      exactly when it was before, and these trailing specifiers resolve to
 *      already-evaluated modules. They add fetch parallelism, never a reorder.
 *   2. **Only an entry whose filename carries no content hash.** This rewrites
 *      `chunk.code` in `generateBundle`, which runs AFTER rolldown has hashed the output
 *      — so flattening an `assets/[name]-[hash].js` entry would ship bytes that no longer
 *      match the hash in their own filename, and break cache-busting. `embed.js` is safe
 *      because `entryFileNames` pins it to that literal name.
 */

/**
 * Every chunk reachable from `entry` through STATIC imports, `entry`'s own direct imports
 * included. `chunk.imports` is rolldown's own record of static (never dynamic) imports, so
 * this is exactly the eager graph `scripts/check-bundle-size.mjs` budgets.
 *
 * A `Set` walked with `for…of` visits values appended during iteration, so the traversal
 * needs no separate worklist.
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
 * The `import "…";` lines to append to an entry, for every chunk in its closure it does
 * not already import directly. Specifiers are relative to the ENTRY's own directory, not
 * the output root — `embed.js` sits at the root today, but `entryFileNames` is free to
 * move it.
 *
 * @param {Record<string, {type: string, imports?: string[]}>} bundle
 * @param {{fileName: string, imports?: string[]}} entry
 * @returns {{ missing: string[], code: string }}
 */
export function flattenedImports(bundle, entry) {
  const direct = new Set(entry.imports ?? [])
  const missing = [...importClosure(bundle, entry)].filter((f) => !direct.has(f)).sort()

  // POSIX semantics regardless of host OS: these are URL-ish module specifiers, and on
  // Windows `path.relative` would hand back backslashes that no browser resolves.
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
 * The Vite plugin. `entryName` is the `rolldownOptions.input` KEY (not the emitted
 * filename), so the coupling is to the config a few lines away rather than to a hash.
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

      // The second clause is the narrowing `Array.prototype.find` cannot carry out of its
      // own predicate, not a second condition — an asset can never match `name`/`isEntry`.
      if (!entry || entry.type !== 'chunk') {
        // `error`, not `warn`: a warning is as invisible as silence here. `pnpm build` has
        // no `onwarn` override and Vite does not fail on rollup warnings, and `pnpm size`
        // cannot catch it either — flattening changes DISCOVERY, not bytes, so the budget
        // is identical whether this ran or not. Renaming the input key would otherwise
        // revert the whole optimization with every gate still green.
        this.error(
          `flattenEntryImports: no entry chunk named "${entryName}". Update the name to ` +
            'match the `rolldownOptions.input` key in vite.config.ts.',
        )

        return
      }

      // Enforce the invariant the docblock calls load-bearing, rather than trusting a
      // ternary in another file to keep holding. Rewriting a hash-named entry would ship
      // bytes that do not match the hash in their own filename — into a path `_headers`
      // marks `immutable, max-age=31536000`, i.e. a URL promising content-addressing while
      // serving something else. `pnpm size` cannot see it: flattening changes discovery,
      // not bytes.
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
