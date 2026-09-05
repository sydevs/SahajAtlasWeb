#!/usr/bin/env node
/**
 * A post-build gate. It proves the shipped CSS cannot restyle a host page
 * (#91).
 *
 * The widget has no shadow boundary. `vite-plugin-css-injected-by-js`
 * appends our stylesheet to the HOST document's <head>, after the host's
 * own sheets. Anything left at the top level then wins style conflicts and
 * repaints the host page. `scripts/postcss-scope-widget.mjs` confines
 * every selector at build time. This gate checks the result in the
 * emitted bytes. It does not trust the build pass alone.
 *
 * This script reads the CSS back out of `dist/**\/*.js`. There are no
 * separate .css assets — the injector inlines each stylesheet as a JS
 * string literal. The script checks three things:
 *
 *   1. every top-level selector is scoped to the widget class,
 *   2. every `@keyframes` name carries the widget namespace — keyframe
 *      names are document-global, and the last definition wins, so a bare
 *      `fadeIn` would hijack a host page's animation,
 *   3. no request to a third-party font CDN survives (a Raleway `@import`
 *      once disclosed every visitor's IP address to Google — LG München I
 *      3 O 17493/20).
 *
 * `pnpm build` runs this gate, so both CI and the Cloudflare Pages build
 * enforce it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import postcss from 'postcss'

import { WIDGET_SCOPE, assertScoped } from './postcss-scope-widget.mjs'

// This path resolves against this module, not the current working
// directory, matching the other scripts here. This way, the gate's result
// never depends on where someone runs it from.
const DIST = fileURLToPath(new URL('../dist', import.meta.url))

// Origins the widget must never request a font from. Self-hosting the
// font removed both origins. A re-added `@import` would silently bring
// back the GDPR exposure, and the two CSP origins the README no longer
// asks hosts to allow.
const FORBIDDEN_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const distFiles = (ext) => {
  if (!existsSync(DIST)) fail(`no ${DIST}/ — run \`vite build\` first`)

  return readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(ext))
    .map((name) => join(DIST, name))
}

/**
 * Pulls out every stylesheet the injector embedded. It scans for the
 * template literal the injector hands to `document.createTextNode`. This
 * scan is deliberately narrow. If the injector's output ever changes
 * shape, this function finds nothing, and finding nothing later fails the
 * gate (see below), instead of passing on an empty set.
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

    // Walks forward to the closing backtick, stepping over any escaped
    // backtick. This uses `indexOf`, not a character-by-character scan,
    // because each string is about 150 KB.
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

    // Undoes the escaping the bundler applied, to fit the CSS inside a
    // template literal.
    found.push(source.slice(start, i).replace(/\\(`|\$\{|\\)/g, '$1'))
    at = source.indexOf(marker, i)
  }

  return found
}

function fail(message) {
  console.error(`\n✗ assert-css-scoped: ${message}\n`)
  process.exit(1)
}

// A stylesheet can reach the host document without being scoped by
// selector. `@font-face` carries no selector, so the scoping pass cannot
// touch it, and `assertScoped` cannot see it. But the font-family name is
// document-global, and the last definition wins — the same property that
// made a bare `@keyframes` a leak. Our own font family is namespaced.
// Swiper's icon font belongs to that upstream library. This script allows
// it through by name, so the exemption stays visible instead of silent.
const ALLOWED_FONT_FAMILIES = new Set(['Atlas Rethink Sans', 'swiper-icons'])

let sheets = 0
let rules = 0

// The injector emits one copy of the same stylesheet per build entry, so
// the shared App chunk carries it twice. Checking an already-checked sheet
// again adds no coverage, and it doubles the parse time of a roughly
// 150 KB string. The `sheets` counter still counts every copy — it only
// needs to answer one question: did this gate find any CSS at all?
const checked = new Set()

// A .css asset in the build output means the injector failed to inline
// one stylesheet. The host page would link that file instead of receiving
// injected CSS. This gate would never see the leftover stylesheet.
const strayCss = distFiles('.css')

if (strayCss.length > 0) {
  fail(`${strayCss.join(', ')}: CSS emitted as a separate asset, outside what this gate reads`)
}

// Every injection site stamps its style tag with an id. This lets the
// script count injection sites independently of how the CSS itself is
// quoted. The extractor above only recognizes a template literal, and
// that shape is a minifier artifact, not a guaranteed contract. Without
// this separate count, a chunk whose injection came out double-quoted
// would be skipped silently, and the `sheets === 0` guard below would stay
// quiet as long as some other chunk still matched.
let injectionSites = 0

for (const file of distFiles('.js')) {
  const source = readFileSync(file, 'utf8')

  injectionSites += source.split('sahaj-atlas-style').length - 1

  // This check scans the whole chunk, not only the stylesheets inside it.
  // `src/styles/fonts.ts` now registers the font faces, so a regression
  // could reappear as a CSS `@import` or as a plain URL in JS.
  for (const origin of FORBIDDEN_ORIGINS) {
    if (source.includes(origin)) {
      fail(`${file} ships a request to ${origin} — the font must stay self-hosted`)
    }
  }

  for (const css of extractInjectedCss(source)) {
    // `t.cssText`-style dynamic calls in the injector's runtime are not stylesheets.
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
