import type { AtRule, Rule } from 'postcss'

import { readFileSync } from 'node:fs'

import postcss from 'postcss'
import { describe, it, expect } from 'vitest'

import { WIDGET_SCOPE_CLASS } from '@/lib/scope'

// Only what the SOURCE of `host-reset.css` can answer. Whether its `var()`s resolve is not one
// of those: check 5 in `scripts/assert-css-scoped.mjs` asks that of the emitted sheet, after
// Tailwind has tree-shaken `@theme` (#262).

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/**
 * One TOP-LEVEL block's declarations, by literal selector, or `@name` for an at-rule.
 *
 * Top-level is load-bearing, not a shortcut: Radix nests a `color(display-p3 …)` override under
 * its own selectors inside `@supports`/`@media`, and a plain walk would read those too.
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

/** A missing match must fail, not pass vacuously on `undefined` (`scripts/ci-workflows.test.ts`). */
const match = (text: string | undefined, pattern: RegExp): string => {
  expect(text, `nothing for ${pattern} to match`).toBeTruthy()

  const found = pattern.exec(text as string)?.[1]

  expect(found, `\`${text}\` does not match ${pattern}`).toBeTruthy()

  return found as string
}

const ROOT = declarations(read('./host-reset.css'), `.${WIDGET_SCOPE_CLASS}`)

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

  it('states color as a bare token that already carries a whole colour', () => {
    // Both halves are invisible to check 5, which only asks whether a name is declared:
    // `hsl(var(--color-foreground))` resolves to `hsl(#202020)` and computes to nothing, and
    // so does a bare token holding `32 0% 13%` rather than a colour (#262).
    const token = match(ROOT.get('color'), /^var\((--[\w-]+)\)$/)
    const value = declarations(read('./globals.css'), '@theme').get(token)

    expect(value, `@theme declares no \`${token}\``).toBeTruthy()

    // `@theme` is where the two kinds are told apart: it wraps a channel triplet in its colour
    // function (`hsl(var(--primary-9))`) and leaves a whole colour bare.
    expect(value).not.toMatch(/^(?:hsla?|rgba?|hwb|lab|lch|oklab|oklch|color)\(/i)
  })
})
