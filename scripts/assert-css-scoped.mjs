#!/usr/bin/env node
/**
 * A post-build gate. It proves `postcss-scope-widget.mjs` reached every
 * rule this repo ships (#91).
 *
 * The EMBED's sheet is behind a shadow boundary since #236, so it cannot
 * reach a host page. The standalone shell and Ladle have no boundary, and
 * both put the same sheet on `<html class="sy-atlas">` — the document
 * root, so `:where(.sy-atlas) :is(main)` matches exactly what `main`
 * matched. The prefix confines nothing in either build, and the page it
 * would be confining the sheet from is our own.
 *
 * What survives the boundary is the collapse, and it is load-bearing:
 * `postcss-scope-widget.mjs` maps `:root`, `html`, `body` and `:host`,
 * and the theme classes, onto `.sy-atlas`. Inside the shadow root there
 * is no `html` element to match, so without that rewrite nothing defines
 * the theme tokens or the palette, and Preflight's own `html`/`body`
 * rules never land. The pass is functional, not defensive — do not
 * retire it on the strength of the boundary. This gate reads the result
 * back out of the emitted bytes rather than trusting the pass.
 *
 * This script reads the CSS back out of `dist/**\/*.js`. There are no
 * separate .css assets — the injector inlines each stylesheet as a JS
 * string literal. The script checks five things:
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
 *      panel to 220px while the map still padded for 352 (#238),
 *   5. every fallbackless `var()` names a property this build declares —
 *      an undeclared one voids its whole declaration at computed-value
 *      time, which for an INHERITED property hands the HOST page the
 *      value (#262).
 *
 * Checks 1 to 4 ask whether a rule can reach a host page. Check 5 asks the
 * other direction: whether what we ship resolves at all.
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

// `@property` is the third document-global namespace, beside `@keyframes`
// and `@font-face`, and it arrived with Tailwind 4: the utilities compose
// through registered `--tw-*` custom properties. Registering a name in the
// host document imposes `inherits: false` and a typed initial value on it
// there, so a host page using the same name gets our semantics. Unlike a
// keyframe, these cannot be namespaced — Tailwind writes the `var()` refs
// itself. So the prefix is allowed by name, the way Swiper's font family
// is, and anything else fails loudly rather than shipping unnoticed.
const ALLOWED_PROPERTY = /^--tw-[a-z0-9-]+$/

// Schedule-X's theme is the one sheet allowed `rem`: third-party, pinned,
// and injected only by the lazy calendar chunk. Its rem lengths also prove
// the detector below still matches the minifier's output — finding none
// there fails the gate, rather than letting every other sheet pass blind.
const REM_EXEMPT_CHUNK = /(^|[\\/])CalendarView-[\w-]+\.js$/

// Declarations only: a media query's `rem` is the browser's initial font
// size, which no stylesheet can change. A sign is allowed, an identifier
// (`--x-2rem`) is not.
const REM_LENGTH = /(?<![\w.-])-?(?:\d*\.)?\d+rem\b/i

// A `var()` can legitimately name a property no stylesheet declares, when a
// pinned library's own JavaScript sets it on the element at runtime. Each
// prefix below belongs to one such library, allowed by name so the exemption
// stays visible instead of silent — the rule `ALLOWED_FONT_FAMILIES` and
// `ALLOWED_PROPERTY` already follow.
const RUNTIME_SET_PROPERTY = new RegExp(
  [
    '^--sx-', // Schedule-X — event-modal position, draw-plugin spacer
    '^--yarl__', // yet-another-react-lightbox — carousel slide count
    '^--swiper-', // Swiper — slide and centered offsets
    '^--radix-', // Radix UI — trigger width, measured when the surface opens
  ].join('|'),
)

// Only the FALLBACKLESS form. `var(--x, sans-serif)` cannot go invalid.
const BARE_VAR = /var\(\s*(--[\w-]+)\s*\)/g

/**
 * What a sheet declares, and every fallbackless `var()` it references (#262).
 *
 * ⚠ **This reads the emitted sheet, and no source gate can replace it.** Tailwind 4
 * tree-shakes `@theme`, so a token `globals.css` declares ships only while some
 * utility still retains it — `--color-foreground` only because `text-foreground`
 * has a call site.
 *
 * Deliberately permissive about WHERE a declaration sits, and the caller pools
 * these across the build for the same reason: a custom property resolves per
 * ELEMENT, and every injected sheet styles the same `.sy-atlas` subtree. A token
 * supplied only inside an `@media`, or only once a lazy chunk has loaded, is a
 * subtler defect than this gate is for, and a false positive here blocks every
 * build.
 *
 * @param {import('postcss').Root} root
 */
function collectVars(root) {
  const declared = new Set()
  const refs = []

  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) declared.add(decl.prop)

    for (const [, name] of decl.value.matchAll(BARE_VAR)) {
      const where = decl.parent && 'selector' in decl.parent ? decl.parent.selector : '?'

      refs.push({ name, where: `${where} { ${decl.prop} }` })
    }
  })

  // These carry a typed initial value, so a reference to one always computes.
  root.walkAtRules('property', (atRule) => {
    declared.add(atRule.params.trim())
  })

  return { declared, refs }
}

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
let properties = 0
let varRefs = 0

// Pooled across every sheet, then reported per sheet — see `collectVars`.
const declaredVars = new Set()
const refsByFile = []

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
// one stylesheet. Nothing hands that file to `src/styles/sheet.ts`, so no
// root adopts it — and this gate, which reads CSS out of the JS, would
// never see it.
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

    const vars = collectVars(root)

    varRefs += vars.refs.length

    for (const name of vars.declared) declaredVars.add(name)

    refsByFile.push({ file, refs: vars.refs })

    root.walkAtRules('property', (atRule) => {
      const name = atRule.params.trim()

      properties += 1

      if (!ALLOWED_PROPERTY.test(name)) {
        fail(
          `${file}: @property ${name} registers a document-global name — it would impose our initial value and \`inherits: false\` on a host page's own ${name}`,
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

// Tailwind 4 registers these for every composed utility in the sheet, so
// none at all means the walk stopped matching, not that the sheet stopped
// registering. Without this the check above would pass vacuously.
if (properties === 0) {
  fail(
    'found no @property in the injected CSS — Tailwind registers one per composed utility, so ' +
      'either the sheet no longer reaches this gate or the walk stopped matching',
  )
}

// Every composed Tailwind utility reads its `--tw-*` through a bare var(), so
// none at all means the detector stopped matching, not that the sheet stopped
// referencing. Without this the resolution check would pass vacuously.
if (varRefs === 0) {
  fail(
    'found no fallbackless var() in the injected CSS — Tailwind composes utilities through ' +
      'them, so either the sheet no longer reaches this gate or BARE_VAR stopped matching',
  )
}

for (const { file, refs } of refsByFile) {
  const missing = refs.filter(
    ({ name }) => !declaredVars.has(name) && !RUNTIME_SET_PROPERTY.test(name),
  )

  if (missing.length > 0) {
    fail(
      `${file}: ${missing.length} declaration(s) reference a custom property nothing this build ` +
        `ships declares, so each one is invalid at computed-value time — and an inherited ` +
        `property then falls back to the HOST page's value (#262). Declare it, give the ` +
        `var() a fallback, or — only for a property a pinned library's own JS sets — add its ` +
        `prefix to RUNTIME_SET_PROPERTY.\n  ` +
        missing
          .slice(0, 8)
          .map(({ name, where }) => `${name}  <-  ${where}`)
          .join('\n  '),
    )
  }
}

console.log(
  `✓ assert-css-scoped: ${rules} rules across ${sheets} injected stylesheet(s) confined to .${WIDGET_SCOPE}, ` +
    `${properties} @property registration(s) allowlisted, ${varRefs} var() reference(s) resolved, ` +
    `with no rem outside the calendar chunk`,
)
