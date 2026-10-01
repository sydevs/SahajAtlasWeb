#!/usr/bin/env node
/**
 * A post-build gate. It proves the shipped CSS cannot restyle a host page
 * (#91).
 *
 * The EMBED's sheet is behind a shadow boundary since #236, so it cannot
 * reach a host page at all. This gate is for the two builds that have no
 * boundary: the standalone shell and Ladle both put the same sheet on
 * `<html class="sy-atlas">`, where anything left at the top level wins
 * style conflicts and repaints the page around it.
 * `scripts/postcss-scope-widget.mjs` confines every selector at build
 * time. This gate checks the result in the emitted bytes. It does not
 * trust the build pass alone.
 *
 * This script reads the CSS back out of `dist/**\/*.js`. There are no
 * separate .css assets — the injector inlines each stylesheet as a JS
 * string literal. The script checks four things:
 *
 *   1. every top-level selector is scoped to the widget class,
 *   2. every `@keyframes` name carries the widget namespace — keyframe
 *      names are document-global, and the last definition wins, so a bare
 *      `fadeIn` would hijack a host page's animation,
 *   3. no request to a third-party font CDN survives (a Raleway `@import`
 *      once disclosed every visitor's IP address to Google — LG München I
 *      3 O 17493/20),
 *   4. no `rem` length ships outside the calendar's chunk — a `rem`
 *      resolves against the HOST's root font size, so the reverse
 *      direction leaks too: `html { font-size: 62.5% }` shrank the side
 *      panel to 220px while the map still padded for 352 (#238).
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

/**
 * What marks one CSS injection site in a built chunk.
 *
 * ⚠ **Not the sink key.** `src/styles/sheet.ts` names the key too, as the READER, so a
 * chunk carrying that module counts one site more than it has. This is the dev-id lookup
 * inside the stringified sink in `vite.config.ts`, which nothing else in the app contains
 * — so it appears exactly once per site. `src/styles/sheet.test.ts` pins it against that
 * file.
 */
const INJECTION_MARKER = 'data-vite-dev-id'

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
 * Pulls out every stylesheet the injector embedded.
 *
 * ⚠ **There is no `<style>` tag to scan for any more (#236).** The widget renders in a
 * shadow root, which a document stylesheet cannot reach into, so the build hands each
 * chunk's CSS to the sink in `src/styles/sheet.ts` instead of appending a tag. The CSS is
 * now the first argument of that sink call: `vite.config.ts` passes a JSON string, which
 * the minifier re-quotes as a template literal.
 *
 * So the scan anchors on `INJECTION_MARKER` — one occurrence per injection site, inside
 * the stringified sink — and takes the template literal opening the call that follows it.
 * Deliberately narrow, exactly as the `createTextNode` version was: if the shape ever
 * changes again this finds nothing, and finding nothing fails the gate below rather than
 * passing on an empty set.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractInjectedCss(source) {
  const found = []
  const marker = ')(`'
  let site = source.indexOf(INJECTION_MARKER)

  while (site !== -1) {
    const at = source.indexOf(marker, site)

    if (at === -1) break

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
    site = source.indexOf(INJECTION_MARKER, i)
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

// Schedule-X's theme is the one sheet allowed `rem`: third-party, pinned,
// and injected only by the lazy calendar chunk. Its rem lengths also prove
// the detector below still matches the minifier's output — finding none
// there fails the gate, rather than letting every other sheet pass blind.
const REM_EXEMPT_CHUNK = /(^|[\\/])CalendarView-[\w-]+\.js$/

// Declarations only: a media query's `rem` is the browser's initial font
// size, which no stylesheet can change. A sign is allowed, an identifier
// (`--x-2rem`) is not.
const REM_LENGTH = /(?<![\w.-])-?(?:\d*\.)?\d+rem\b/i

/** @param {import('postcss').Root} root */
function remLengths(root) {
  const found = []

  root.walkDecls((decl) => {
    const value = decl.value.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, '')

    if (REM_LENGTH.test(value)) {
      const where = decl.parent && 'selector' in decl.parent ? decl.parent.selector : '?'

      found.push(`${where} { ${decl.prop}: ${decl.value} }`)
    }
  })

  return found
}

let sheets = 0
let rules = 0

// The exemption belongs to a FILE, so this is checked per injection, not per
// unique sheet: an identical copy injected from another chunk must not ride
// on the calendar's pass.
const remByCss = new Map()
const injections = []

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

// Every injection site carries one copy of the stringified sink, so the marker names
// each one exactly once. That counts sites independently of how the CSS itself is quoted — the
// extractor above only recognizes a template literal, and that shape is a minifier
// artifact rather than a guaranteed contract. Without this separate count, a chunk whose
// injection came out double-quoted would be skipped silently, and the `sheets === 0`
// guard below would stay quiet as long as some other chunk still matched.
let injectionSites = 0

for (const file of distFiles('.js')) {
  const source = readFileSync(file, 'utf8')

  injectionSites += source.split(INJECTION_MARKER).length - 1

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
    injections.push({ file, css })

    if (checked.has(css)) continue
    checked.add(css)

    const root = postcss.parse(css, { from: file })

    remByCss.set(css, remLengths(root))

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

let calendarRem = 0

for (const { file, css } of injections) {
  const found = remByCss.get(css) ?? []

  if (REM_EXEMPT_CHUNK.test(file)) {
    calendarRem += found.length
    continue
  }

  if (found.length > 0) {
    fail(
      `${file}: ${found.length} rem length(s) — a host's root font size rescales them, so write px ` +
        `(1rem = 16px). If this is the calendar's chunk under a new name, update REM_EXEMPT_CHUNK.\n  ` +
        found.slice(0, 5).join('\n  '),
    )
  }
}

if (calendarRem === 0) {
  fail(
    'found no rem in the calendar chunk — either REM_EXEMPT_CHUNK names no file any more, or the ' +
      'rem detector stopped matching the emitted CSS and checked nothing',
  )
}

console.log(
  `✓ assert-css-scoped: ${rules} rules across ${sheets} injected stylesheet(s) confined to .${WIDGET_SCOPE}, ` +
    `with no rem outside the calendar chunk`,
)
