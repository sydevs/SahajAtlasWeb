import type { AtRule, Rule } from 'postcss'

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import postcss from 'postcss'
import { describe, it, expect } from 'vitest'

import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

// Two properties of `host-reset.css` that only its SOURCE can answer.
//
// Whether its `var()`s resolve is not one of them: `scripts/assert-css-scoped.mjs` asks that of
// the emitted sheet, across all 1,176 rules, and it has to be asked there — Tailwind 4
// tree-shakes `@theme`, so a token this file can see in `globals.css` may never ship. What is
// left here is the half a build gate cannot judge: the host-facing promise about WHICH
// properties get restated, and whether `color`'s value is in the format its token actually
// carries. `hsl(var(--gray-12))` would resolve and still compute to nothing (#262).

const resolveFrom = createRequire(import.meta.url)
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** The light and dark halves of every palette block, in both our sheet and Radix's ramps. */
const SELECTOR = { light: ':root, .light, .light-theme', dark: '.dark, .dark-theme' }

/**
 * One TOP-LEVEL block's declarations, by literal selector, or `@name` for an at-rule.
 *
 * Top-level is load-bearing, not a shortcut: Radix nests a `color(display-p3 …)` override under
 * this same selector inside `@supports`/`@media`, and reading that instead would decide the
 * format question below on a value only wide-gamut displays ever see.
 */
const declarations = (css: string, selector: string): Map<string, string> => {
  const block = postcss
    .parse(css)
    .nodes.find((node): node is AtRule | Rule =>
      node.type === 'rule'
        ? node.selector.replace(/\s+/g, ' ') === selector
        : node.type === 'atrule' && `@${node.name}` === selector,
    )

  if (!block?.nodes) throw new Error(`no top-level \`${selector}\` block`)

  const found = new Map<string, string>()

  // Last wins, as the cascade does within one block.
  for (const node of block.nodes) if (node.type === 'decl') found.set(node.prop, node.value)

  return found
}

/** An absent declaration must fail, not resolve a placeholder (`docs/testing.md`). */
const required = (block: Map<string, string>, prop: string): string => {
  const value = block.get(prop)

  expect(value, `host-reset.css declares no \`${prop}\``).toBeTruthy()

  return value as string
}

/** A missing match must fail, not pass vacuously on `undefined` (`scripts/ci-workflows.test.ts`). */
const match = (text: string, pattern: RegExp): string => {
  const found = pattern.exec(text)?.[1]

  expect(found, `nothing matched ${pattern}`).toBeTruthy()

  return found as string
}

const GLOBALS = read('./globals.css')
const ROOT = declarations(read('./host-reset.css'), `.${WIDGET_SCOPE_CLASS}`)

/** Derived from the `@import`s rather than listed, so adding a ramp cannot leave this stale. */
const ramps = (mode: keyof typeof SELECTOR): string[] => {
  const files: string[] = []

  postcss.parse(GLOBALS).walkAtRules('import', ({ params }) => {
    const specifier = params.replace(/^['"]|['"]$/g, '')

    if (specifier.startsWith('@radix-ui/colors/')) files.push(specifier)
  })

  expect(files, 'globals.css imports no Radix ramps').not.toHaveLength(0)

  return files.filter((file) => file.endsWith('-dark.css') === (mode === 'dark'))
}

/**
 * Every token a `var()` on the widget root can see. `postcss-scope-widget.mjs` collapses `:root`
 * and the theme classes onto `.sy-atlas`, the element this file styles, so `@theme`, our brand
 * defaults and Radix's ramps all land on one element.
 */
const tokens = (mode: keyof typeof SELECTOR): Map<string, string> =>
  new Map([
    ...declarations(GLOBALS, '@theme'),
    ...declarations(GLOBALS, SELECTOR[mode]),
    ...ramps(mode).flatMap((file) => [
      ...declarations(readFileSync(resolveFrom.resolve(file), 'utf8'), SELECTOR[mode]),
    ]),
  ])

// Non-global for `.test()`, which would otherwise carry `lastIndex` between calls, and global for
// `.replace()`. Only the fallbackless form can go invalid at computed-value time.
const BARE_VAR = /var\(\s*(--[\w-]+)\s*\)/
const BARE_VARS = new RegExp(BARE_VAR, 'g')

/** A colour function wrapping a value that is already a complete colour. */
const DOUBLE_WRAPPED = /\b(?:hsla?|rgba?|hwb|lab|lch|oklab|oklch)\(\s*(?:#|color\()/i

const resolve = (value: string, available: Map<string, string>, depth = 0): string => {
  if (depth > 10) throw new Error(`cycle resolving \`${value}\``)

  return value.replace(BARE_VARS, (whole, name: string) => {
    const next = available.get(name)

    return next === undefined ? whole : resolve(next, available, depth + 1)
  })
}

describe('host-reset.css', () => {
  it('restates exactly the properties the embedding guide promises hosts it restates', () => {
    // A property dropped here reaches our text; one added without the guide leaves hosts a
    // promise we never published. No gate on the emitted sheet can know either.
    const promised = match(
      read('../../docs/embedding.md'),
      /the widget restates ([^.]*?) on its own root/,
    )

    expect([...ROOT.keys()].filter((prop) => !prop.startsWith('--')).sort()).toEqual(
      [...promised.matchAll(/`([a-z-]+)`/g)].map(([, prop]) => prop).sort(),
    )
  })

  for (const mode of ['light', 'dark'] as const) {
    it(`states color in the format its token carries (${mode})`, () => {
      const colour = resolve(required(ROOT, 'color'), tokens(mode))

      // Guards the assertion below against passing on a half-resolved value.
      expect(colour, 'color did not resolve through our own tokens').not.toMatch(BARE_VARS)

      // `--color-foreground` is a Radix HEX, not the channel triplet the brand ramps carry, so
      // an `hsl()` around it resolves to `hsl(#202020)` and computes to nothing.
      expect(colour).not.toMatch(DOUBLE_WRAPPED)
    })
  }
})
