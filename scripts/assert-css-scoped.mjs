#!/usr/bin/env node
/**
 * Post-build gate: prove the CSS we actually ship cannot restyle a host page (#91).
 *
 * The widget has no shadow boundary — `vite-plugin-css-injected-by-js` appends our
 * stylesheet to the HOST document's <head>, after their sheets, so anything left at
 * top level wins ties and repaints their page. `scripts/postcss-scope-widget.mjs`
 * confines every selector at build time; this asserts the result on the emitted
 * bytes rather than trusting the pass that produced them.
 *
 * It reads the CSS back OUT of `dist/**\/*.js` (there are no .css assets — the
 * injector inlines them as JS string literals) and checks three things:
 *
 *   1. every top-level selector is scoped to the widget class,
 *   2. every `@keyframes` is namespaced — keyframe names are document-global and
 *      last-definition-wins, so a bare `fadeIn` hijacks a host page's animation,
 *   3. no request to a third-party font CDN survives (the Raleway `@import` that
 *      used to disclose every visitor's IP to Google — LG München I 3 O 17493/20).
 *
 * Run via `pnpm build`, so CI and the Cloudflare Pages build both gate on it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import postcss from 'postcss'

import { WIDGET_SCOPE, assertScoped } from './postcss-scope-widget.mjs'

// Resolved against this module, not the cwd — matching the other scripts here — so the
// gate can't pass or fail on where it happened to be invoked from.
const DIST = fileURLToPath(new URL('../dist', import.meta.url))

// Origins the widget must never reach for a font. Self-hosting removed both, and a
// re-added `@import` would silently reinstate the GDPR exposure and the two CSP
// origins the README no longer asks hosts for.
const FORBIDDEN_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const distFiles = (ext) => {
  if (!existsSync(DIST)) fail(`no ${DIST}/ — run \`vite build\` first`)

  return readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(ext))
    .map((name) => join(DIST, name))
}

/**
 * Pull every stylesheet the injector embedded, by scanning for the template literal
 * it hands to `document.createTextNode`. Deliberately narrow: if the injector ever
 * changes shape this finds nothing, and finding nothing is a failure (below) rather
 * than a green run over an empty set.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractInjectedCss(source) {
  const found = []
  const marker = 'createTextNode(`'
  let at = source.indexOf(marker)

  while (at !== -1) {
    const start = at + marker.length
    let i = start

    // Walk to the closing backtick, stepping over escaped ones. By `indexOf` rather than
    // character by character: each of these strings is ~150 KB.
    for (;;) {
      const end = source.indexOf('`', i)
      const escape = source.indexOf('\\', i)

      if (end === -1) break

      if (escape !== -1 && escape < end) {
        i = escape + 2
        continue
      }

      i = end
      break
    }

    // Undo the escaping the bundler applied to fit CSS inside a template literal.
    found.push(source.slice(start, i).replace(/\\(`|\$\{|\\)/g, '$1'))
    at = source.indexOf(marker, i)
  }

  return found
}

function fail(message) {
  console.error(`\n✗ assert-css-scoped: ${message}\n`)
  process.exit(1)
}

// A stylesheet that reaches the host document but isn't scoped-by-selector. `@font-face`
// carries no selector, so the pass can't touch it and `assertScoped` can't see it — but
// the family name IS document-global and last-wins, which is the same property that made
// bare `@keyframes` a leak. Ours is namespaced; Swiper's icon font is upstream's and is
// allowed through by name so the exemption is visible rather than silent.
const ALLOWED_FONT_FAMILIES = new Set(['Atlas Rethink Sans', 'swiper-icons'])

let sheets = 0
let rules = 0

// The injector emits one copy of the same stylesheet per build entry, so the shared App
// chunk carries it twice. Checking a sheet we have already checked adds no coverage and
// doubles the parse of a ~150 KB string; the counter above still counts every copy, since
// what it guards is "did we find any CSS at all".
const checked = new Set()

// A .css asset means the injector failed to inline one — it would be linked, not injected,
// and this gate would never see it.
const strayCss = distFiles('.css')

if (strayCss.length > 0) {
  fail(`${strayCss.join(', ')}: CSS emitted as a separate asset, outside what this gate reads`)
}

// Every injection site stamps the style tag's id, so the count of sites is knowable
// independently of how the CSS itself is quoted. The extractor only recognises a template
// literal — which is a minifier artefact, not a contract — so without this cross-check a
// chunk whose injection came out double-quoted would be skipped in SILENCE, and the
// `sheets === 0` guard would not fire as long as some other chunk still matched.
let injectionSites = 0

for (const file of distFiles('.js')) {
  const source = readFileSync(file, 'utf8')

  injectionSites += source.split('sahaj-atlas-style').length - 1

  // Checked against the whole chunk, not just the stylesheets inside it: the faces are
  // registered from `src/styles/fonts.ts` now, so a regression could reappear either as
  // a CSS `@import` or as a URL in JS.
  for (const origin of FORBIDDEN_ORIGINS) {
    if (source.includes(origin)) {
      fail(`${file} ships a request to ${origin} — the font must stay self-hosted`)
    }
  }

  for (const css of extractInjectedCss(source)) {
    // `t.cssText`-style dynamic calls in the injector's own runtime aren't stylesheets.
    if (!css.includes('{')) continue

    sheets += 1

    if (checked.has(css)) continue
    checked.add(css)

    const root = postcss.parse(css, { from: file })

    try {
      rules += assertScoped(root)
    } catch (error) {
      fail(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }

    root.walkAtRules(/^(-\w+-)?keyframes$/i, (atRule) => {
      if (!atRule.params.trim().startsWith(`${WIDGET_SCOPE}-`)) {
        fail(
          `${file}: @keyframes ${atRule.params} is not namespaced — it would override a host animation`,
        )
      }
    })

    root.walkAtRules('font-face', (atRule) => {
      let family

      atRule.walkDecls('font-family', (decl) => {
        family = decl.value.replace(/^['"]|['"]$/g, '').trim()
      })

      if (!family || !ALLOWED_FONT_FAMILIES.has(family)) {
        fail(
          `${file}: @font-face declares "${family}" — font families are document-global, so it would override that face on a host page`,
        )
      }
    })
  }
}

if (sheets === 0) {
  fail(
    'found no injected CSS in dist/ — either the build emitted none, or the injector changed shape and this extractor needs updating',
  )
}

if (sheets !== injectionSites) {
  fail(
    `found ${sheets} stylesheet(s) but ${injectionSites} injection site(s) — a chunk's CSS was not extracted, so it went unchecked`,
  )
}

console.log(
  `✓ assert-css-scoped: ${rules} rules across ${sheets} injected stylesheet(s) confined to .${WIDGET_SCOPE}`,
)
