/**
 * Emit a version-channel copy of the JS entry, beside the mutable one (issue #94).
 *
 * `embed.js` is the one URL hosts hardcode, and it is deliberately unhashed and mutable:
 * every deploy replaces it, so every embed upgrades at once. That is fine for a fix and
 * unacceptable for a breaking change — a host has no way to say "the version I wrote my
 * page against", and we have no way to ship a v2 without breaking v1 the same instant.
 *
 * This plugin gives them one: the same entry is ALSO written to `v<major>/embed.js`, so a
 * host can install a path whose major cannot change under them. `embed.js` is untouched —
 * it is emitted by `entryFileNames` exactly as before, and existing embeds keep working.
 *
 * ## What the channel does and does not promise
 *
 * `v1/embed.js` is a **compatibility channel, not an immutable artifact.** Every deploy
 * rewrites it, so it carries the latest build of that major — patches and features arrive,
 * a major bump does not. Cloudflare Pages serves one deployment at a time, so no path in
 * this repo can pin a *build*; what the channel buys is the ability to ship v2 to
 * `embed.js` + `v2/` while `v1/` keeps serving code the v1 hosts can run. See
 * `docs/releasing.md` for the whole contract, including the part that needs a human.
 *
 * `LEGACY_CHANNELS` is the other half of that, and forgetting it is the failure mode this
 * plugin could otherwise create: a channel that stops being emitted 404s, and
 * `public/_redirects` turns that 404 into the SPA shell served as `text/html` with a 200 —
 * so a pinned host's `<script type="module">` fails to parse and the widget silently
 * disappears. NEVER let a major stop being emitted without a deprecation window; retire it
 * by moving it into that list first.
 *
 * ## Why a copy with rewritten specifiers, and not the two obvious alternatives
 *
 *   - **Not a second rolldown input.** Two inputs resolving to the same module get
 *     deduplicated into one chunk, and the widget's chunks would have to be reachable from
 *     both roots — which either duplicates the graph or turns `embed.js` into a thin
 *     re-export, costing every existing host an extra round trip.
 *   - **Not a shim that imports `../embed.js`.** It would defeat the entire point: a host
 *     pinned to `v1/` would be executing whatever `embed.js` currently is, which is the
 *     mutable file they pinned away from. (It also adds an RTT before anything is
 *     discovered.)
 *
 * A copy shares the hashed chunks with `embed.js` rather than duplicating them — the
 * rebased specifiers resolve to the same URLs — so the extra deploy weight is one entry
 * file (~6 KB), and a page that loads both ends up with ONE instance of every shared
 * module. The doubled `customElements.define` is already refused by `src/Widget.tsx`.
 */

import { readFileSync } from 'node:fs'

import { importClosure } from './flatten-entry-imports.mjs'

/**
 * Majors we still serve although the current version has moved past them.
 *
 * Add the retired major here in the SAME commit that bumps the version past it, and
 * remove it only after the deprecation window in `docs/releasing.md` has run out and the
 * hosts on it have moved. An entry here costs one ~6 KB file per deploy.
 *
 * @type {string[]}
 */
const LEGACY_CHANNELS = []

/** The version this build is of — read here so `vite.config.ts` need not thread it. */
function packageVersion() {
  const url = new URL('../package.json', import.meta.url)

  return JSON.parse(readFileSync(url, 'utf8')).version
}

/**
 * The channel directory for a semver string: `1.4.2` → `v1`, `0.9.0` → `v0`.
 *
 * Strict on purpose. `package.json` carried `"0.1"` for the project's whole life — not
 * valid semver, and `parseInt` would have happily turned it into a `v0` that nothing had
 * agreed to. A version this build cannot parse is a build failure, not a default.
 *
 * @param {string} version
 * @returns {string}
 */
export function channelFor(version) {
  const match = /^(\d+)\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.exec(version)

  if (!match) {
    throw new Error(
      `emitVersionedEntry: package.json version "${version}" is not semver (major.minor.patch), ` +
        'so the versioned embed path cannot be derived from it.',
    )
  }

  return `v${match[1]}`
}

/**
 * Rewrite an entry's own-directory specifiers so the same code works one or more
 * directories deeper.
 *
 * Only literals that name a real file in the bundle are touched, so a string that merely
 * looks like a specifier cannot be corrupted — and the ones that look like a specifier and
 * are NOT in the bundle are returned as `unresolved` for the caller to fail on, rather than
 * being left silently pointing at nothing. That matters more than it sounds: a specifier
 * wrong by one directory is a 404 for the whole payload, and it would only show up in a
 * browser loading the channel path, which no local gate does.
 *
 * `[^"'`]*` deliberately does not exclude `${`, so an interpolated dynamic specifier
 * (rolldown emits dynamic imports as template literals) lands in `unresolved` and fails the
 * build instead of being rewritten into something plausible-looking and wrong.
 *
 * @param {string} code
 * @param {Set<string>} bundleFiles output-relative file names in the bundle
 * @param {number} depth how many directories deep the copy sits
 * @returns {{ code: string, unresolved: string[] }}
 */
export function rebaseSpecifiers(code, bundleFiles, depth) {
  const prefix = '../'.repeat(depth)
  const unresolved = []

  const rebased = code.replace(/(["'`])(\.\/[^"'`]*)\1/g, (literal, quote, specifier) => {
    const file = specifier.slice(2)

    if (!bundleFiles.has(file)) {
      unresolved.push(specifier)

      return literal
    }

    return `${quote}${prefix}${file}${quote}`
  })

  return { code: rebased, unresolved }
}

/**
 * The Vite plugin. `entryName` is the `rolldownOptions.input` KEY, matching the sibling
 * `flattenEntryImports` — the coupling is to the config a few lines away, not to a
 * filename.
 *
 * @param {string} entryName
 * @returns {import('vite').Plugin}
 */
export default function emitVersionedEntry(entryName) {
  return {
    name: 'sy-emit-versioned-entry',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (c) => c.type === 'chunk' && c.isEntry && c.name === entryName,
      )

      // The second clause is the narrowing `find` cannot carry out of its predicate.
      if (!entry || entry.type !== 'chunk') {
        this.error(
          `emitVersionedEntry: no entry chunk named "${entryName}". Update the name to ` +
            'match the `rolldownOptions.input` key in vite.config.ts.',
        )

        return
      }

      if (entry.fileName.includes('/')) {
        this.error(
          `emitVersionedEntry: expected the entry at the output root, found ` +
            `"${entry.fileName}". The channel path and the rebase depth are both computed ` +
            'from that assumption — update both before moving it.',
        )

        return
      }

      // MUST run after `flattenEntryImports`, and this is what makes that orderable rather
      // than remembered. That plugin appends the entry's whole static closure to its own
      // import list so a host discovers the eager graph in one parse; copying the entry
      // BEFORE it ran would hand the pinned path a strictly worse waterfall than
      // `embed.js` — with byte-identical chunks, so `pnpm size` sees nothing and the two
      // paths differ only in a timing nobody measures.
      const direct = new Set(entry.imports ?? [])
      const undeclared = [...importClosure(bundle, entry)].filter((f) => !direct.has(f))

      if (undeclared.length) {
        this.error(
          'emitVersionedEntry: the entry does not declare its whole static closure ' +
            `(missing ${undeclared.join(', ')}), which means flattenEntryImports has not run ` +
            'yet. Order this plugin AFTER it in vite.config.ts.',
        )

        return
      }

      const channels = [channelFor(packageVersion()), ...LEGACY_CHANNELS]
      const files = new Set(Object.keys(bundle))

      for (const channel of channels) {
        const { code, unresolved } = rebaseSpecifiers(entry.code, files, channel.split('/').length)

        if (unresolved.length) {
          this.error(
            `emitVersionedEntry: ${unresolved.join(', ')} in ${entry.fileName} names no file ` +
              'in the bundle, so it cannot be rebased for the versioned copy. The output ' +
              'shape has changed — fix rebaseSpecifiers() in scripts/emit-versioned-entry.mjs.',
          )

          return
        }

        this.emitFile({ type: 'asset', fileName: `${channel}/${entry.fileName}`, source: code })
      }
    },
  }
}
