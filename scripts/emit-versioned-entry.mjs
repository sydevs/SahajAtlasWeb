/**
 * Emit version-channel copies of the JS entry, beside the mutable one (issue #94).
 *
 * `embed.js` is the one URL hosts hardcode, and it is deliberately unhashed and mutable:
 * every deploy replaces it, so every embed upgrades at once. That is fine for a fix and
 * unacceptable for a breaking change — a host has no way to say which version they wrote
 * their page against, so we have no way to tell who a v2 would break.
 *
 * This plugin gives them a way to say it: the same entry is ALSO written to
 * `v<major>/embed.js`, so a host's markup declares the major it was built against.
 * `embed.js` is untouched — `entryFileNames` emits it exactly as before, and existing
 * embeds keep working.
 *
 * ## Be precise about what the channel buys, because it is less than it looks
 *
 * **Every channel serves the CURRENT build.** `v0/embed.js` and `v1/embed.js` are the same
 * bytes as `embed.js` on any given deploy. So a pinned host is *not* insulated from a
 * breaking change by the path alone — the pin is a declaration, not a code freeze.
 *
 * What it actually buys, honestly:
 *
 *   1. A host's markup records the major they integrated against, so a breaking change can
 *      be communicated to the right people instead of discovered by them.
 *   2. It is the prerequisite for a freeze. Serving a v1 host the old code at a v2 release
 *      means publishing that older build to `v1/` — which this repo does NOT automate, and
 *      which Cloudflare Pages' one-deployment-at-a-time model does not do for free.
 *   3. Real immutability (a host pinning a BUILD) needs artifact hosting — npm plus a CDN
 *      that keeps `@0.9.0` addressable forever. Out of scope; see `docs/releasing.md`.
 *
 * Do not let the docs drift back into promising a freeze the mechanism does not perform.
 *
 * ## Why a copy with rewritten specifiers, and not the two obvious alternatives
 *
 *   - **Not a second rolldown input, and not `emitFile({type: 'chunk'})`.** Both are
 *     supported, and both silently produce `import "../embed.js";` — a re-export shim —
 *     because Vite sets `preserveEntrySignatures: false` for an app build. That is the
 *     feature becoming a no-op that still renders: a pinned host would be executing the
 *     mutable file they pinned away from, and nothing would look broken.
 *     (`preserveEntrySignatures: 'strict'` instead degrades `embed.js` ITSELF into the
 *     shim, taxing every existing host a round trip.)
 *   - **Not a `cp` after the build.** The entry's chunk imports are relative, so a copy one
 *     directory down has to have its specifiers rebased or every import 404s.
 *
 * A copy shares the hashed chunks with `embed.js` rather than duplicating them — the
 * rebased specifiers resolve to the same URLs — so the extra deploy weight is one ~5.6 KB
 * file per channel (0.14% of `dist/`), and a page loading both ends up with ONE instance of
 * every shared module. The doubled `customElements.define` is already refused by
 * `src/Widget.tsx`.
 */

import { readFileSync } from 'node:fs'

import { flattenedImports } from './flatten-entry-imports.mjs'

/**
 * The oldest major still published. Every major from here to the current one gets a
 * channel, so a release CANNOT forget to keep an old one alive — the failure direction is
 * ~5.6 KB of dead weight, never a channel that vanishes.
 *
 * That direction is the whole point. A channel that stops being emitted does not 404
 * cleanly: `public/_redirects` is `/* /index.html 200`, so Cloudflare answers with the SPA
 * shell as `text/html` at 200, a pinned host's `<script type="module">` fails to parse, and
 * the widget disappears with nothing in the console naming the cause. Every gate stays
 * green through that outage.
 *
 * Retiring a major is therefore one reviewable increment of this number, taken
 * deliberately after the deprecation window in `docs/releasing.md` — not a list somebody
 * has to remember to append to while cutting a release.
 */
const OLDEST_SUPPORTED_MAJOR = 0

/** The version this build is of — read here so `vite.config.ts` need not thread it. */
function packageVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

/**
 * The major of a semver string, as a number.
 *
 * Strict on purpose. `package.json` carried `"0.1"` for the project's whole life — not
 * valid semver, and `parseInt` would have happily turned it into a `v0` that nothing had
 * agreed to. A version this build cannot parse is a build failure, not a default.
 *
 * @param {string} version
 * @returns {number}
 */
export function majorOf(version) {
  const match = /^(\d+)\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.exec(version)

  if (!match) {
    throw new Error(
      `emitVersionedEntry: package.json version "${version}" is not semver (major.minor.patch), ` +
        'so the versioned embed path cannot be derived from it.',
    )
  }

  return Number(match[1])
}

/**
 * The channel directory for a semver string: `1.4.2` → `v1`, `0.9.0` → `v0`.
 *
 * @param {string} version
 * @returns {string}
 */
export function channelFor(version) {
  return `v${majorOf(version)}`
}

/** The channel this build's own version publishes to. */
export function currentChannel() {
  return channelFor(packageVersion())
}

/**
 * Every channel this build publishes: the current major, plus each still-supported older
 * one. Oldest first, so the emitted order reads like the support window.
 *
 * @param {string} version
 * @returns {string[]}
 */
export function supportedChannels(version) {
  const major = majorOf(version)

  if (major < OLDEST_SUPPORTED_MAJOR) {
    throw new Error(
      `emitVersionedEntry: version "${version}" is older than OLDEST_SUPPORTED_MAJOR ` +
        `(${OLDEST_SUPPORTED_MAJOR}), so the current release is not in its own support window.`,
    )
  }

  return Array.from(
    { length: major - OLDEST_SUPPORTED_MAJOR + 1 },
    (_, i) => `v${i + OLDEST_SUPPORTED_MAJOR}`,
  )
}

/**
 * Rewrite an entry's own-directory specifiers so the same code works from one directory
 * deeper. A channel is always exactly one segment (`channelFor` returns `v<digits>`), and
 * the plugin refuses anything else, so the climb is a fixed `../` rather than a parameter
 * nothing can vary.
 *
 * Only literals naming a real file in the bundle are touched, so a string that merely looks
 * like a specifier cannot be corrupted — and one that looks like a specifier and is NOT in
 * the bundle is returned as `unresolved` for the caller to fail on, rather than left
 * silently pointing at nothing. That matters more than it sounds: a specifier wrong by one
 * directory is a 404 for the whole payload, and it would surface only in a browser loading
 * the channel path, which no local gate does.
 *
 * `[^"'`]*` deliberately does not exclude `${`, so an interpolated dynamic specifier
 * (rolldown emits dynamic imports as template literals) lands in `unresolved` and fails the
 * build instead of being rewritten into something plausible-looking and wrong.
 *
 * @param {string} code
 * @param {Set<string>} bundleFiles output-relative file names in the bundle
 * @returns {{ code: string, unresolved: string[] }}
 */
export function rebaseSpecifiers(code, bundleFiles) {
  const unresolved = []

  const rebased = code.replace(/(["'`])(\.\/[^"'`]*)\1/g, (literal, quote, specifier) => {
    const file = specifier.slice(2)

    if (!bundleFiles.has(file)) {
      unresolved.push(specifier)

      return literal
    }

    return `${quote}../${file}${quote}`
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

      // The second clause is the narrowing `find` cannot carry out of its predicate. Keep
      // the `return` after every `this.error()` below: the calls are `never`-returning and
      // so unreachable at runtime, but `checkJs` is on for `scripts/**` and TypeScript does
      // not narrow through a `never` reached via `this.` — removing them fails typecheck.
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
            `"${entry.fileName}". The channel path and the fixed one-directory rebase both ` +
            'assume it — update both before moving it.',
        )

        return
      }

      // MUST run after `flattenEntryImports`, and this is what makes that orderable rather
      // than remembered. That plugin appends the entry's whole static closure to its own
      // import list so a host discovers the eager graph in one parse; copying the entry
      // BEFORE it ran would hand the pinned path a strictly worse waterfall than
      // `embed.js` — with byte-identical chunks, so `pnpm size` sees nothing and the two
      // paths differ only in a timing nobody measures.
      //
      // Asked of the sibling's own exported predicate rather than re-derived here, so the
      // two can never disagree about what "declares its whole closure" means. It is an
      // artifact POSTcondition, not a pipeline fact, so it also catches that plugin being
      // deleted, renamed, or having its `enforce` changed.
      const { missing } = flattenedImports(bundle, entry)

      if (missing.length) {
        this.error(
          'emitVersionedEntry: the entry does not declare its whole static closure ' +
            `(missing ${missing.join(', ')}), which means flattenEntryImports has not run ` +
            'yet. Order this plugin AFTER it in vite.config.ts.',
        )

        return
      }

      // Invariant, not per-channel: every channel serves the same bytes at a different
      // path, and the loop below should read that way.
      const { code, unresolved } = rebaseSpecifiers(entry.code, new Set(Object.keys(bundle)))

      if (unresolved.length) {
        this.error(
          `emitVersionedEntry: ${unresolved.join(', ')} in ${entry.fileName} names no file in ` +
            'the bundle, so it cannot be rebased for the versioned copy. Either the output ' +
            'shape changed, or a `./`-prefixed string literal that is not a module reached ' +
            'the entry — fix rebaseSpecifiers() in scripts/emit-versioned-entry.mjs.',
        )

        return
      }

      for (const channel of supportedChannels(packageVersion())) {
        this.emitFile({ type: 'asset', fileName: `${channel}/${entry.fileName}`, source: code })
      }
    },
  }
}
