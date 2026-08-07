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
import process from 'node:process'

import postcss from 'postcss'

import { WIDGET_SCOPE, assertScoped } from './postcss-scope-widget.mjs'

const DIST = 'dist'

// Origins the widget must never reach for a font. Self-hosting removed both, and a
// re-added `@import` would silently reinstate the GDPR exposure and the two CSP
// origins the README no longer asks hosts for.
const FORBIDDEN_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const jsFiles = () => {
  if (!existsSync(DIST)) fail(`no ${DIST}/ — run \`vite build\` first`)

  return readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.js'))
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
    let i = at + marker.length
    let raw = ''

    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') {
        raw += source[i] + source[i + 1]
        i += 2
        continue
      }

      raw += source[i]
      i += 1
    }

    // Undo the escaping the bundler applied to fit CSS inside a template literal.
    found.push(
      raw
        .replace(/\\`/g, '`')
        .replace(/\\\$\{/g, '${')
        .replace(/\\\\/g, '\\'),
    )
    at = source.indexOf(marker, i)
  }

  return found
}

function fail(message) {
  console.error(`\n✗ assert-css-scoped: ${message}\n`)
  process.exit(1)
}

let sheets = 0
let rules = 0

for (const file of jsFiles()) {
  const source = readFileSync(file, 'utf8')

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

    const root = postcss.parse(css, { from: file })

    try {
      assertScoped(root)
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

    root.walkRules(() => {
      rules += 1
    })
  }
}

if (sheets === 0) {
  fail(
    'found no injected CSS in dist/ — either the build emitted none, or the injector changed shape and this extractor needs updating',
  )
}

console.log(
  `✓ assert-css-scoped: ${rules} rules across ${sheets} injected stylesheet(s) confined to .${WIDGET_SCOPE}`,
)
