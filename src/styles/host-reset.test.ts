import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, it, expect } from 'vitest'

// `host-reset.css` restates the inherited properties a host's `<body>` would otherwise reach our
// copy through, so every one of them has to COMPUTE. A `var()` naming a property nothing declares
// makes its whole declaration invalid at computed-value time, and an inherited property then
// takes the host's value — the exact failure the file exists to prevent, and silent on every
// other gate: `assert-css-scoped.mjs` asks where a rule applies, never whether its values
// resolve. `color: hsl(var(--foreground))` shipped that way, a no-op the whole time, until #262.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const radix = (file: string) =>
  readFileSync(createRequire(import.meta.url).resolve(`@radix-ui/colors/${file}`), 'utf8')

const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `prop: value` in a block body, last declaration winning as the cascade does. */
const declarations = (body: string): Map<string, string> => {
  const out = new Map<string, string>()

  for (const [, prop, value] of body.matchAll(/([\w-]+)\s*:\s*([^;}]+)/g)) {
    out.set(prop, value.trim())
  }

  return out
}

/**
 * One block's body, by its literal selector. Anchored to the start of a line so the p3
 * overrides Radix nests under this same selector — indented, inside `@supports`/`@media`,
 * and in `color(display-p3 …)` — stay out of the result.
 */
const block = (css: string, selector: string, label: string): string => {
  const pattern = selector
    .split(',')
    .map((part) => part.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(',\\s*')
  const found = uncommented(css).match(new RegExp(`^${pattern}\\s*\\{([^}]*)\\}`, 'm'))

  if (!found) throw new Error(`${label}: no \`${selector}\` block`)

  return found[1]
}

const GLOBALS = read('./globals.css')
const ROOT = declarations(block(read('./host-reset.css'), '.sy-atlas', 'host-reset.css'))

// The widget's own tokens: `@theme` plus the hand-frozen brand defaults, and the two Radix ramps
// `globals.css` imports. `postcss-scope-widget.mjs` collapses all four onto `.sy-atlas`, the same
// element this file styles, so a `var()` here reads them off one element at runtime.
const theme = declarations(block(GLOBALS, '@theme', 'globals.css'))
const TOKENS = {
  light: new Map([
    ...theme,
    ...declarations(block(GLOBALS, ':root, .light, .light-theme', 'globals.css')),
    ...declarations(block(radix('gray.css'), ':root, .light, .light-theme', 'gray.css')),
    ...declarations(block(radix('red.css'), ':root, .light, .light-theme', 'red.css')),
  ]),
  dark: new Map([
    ...theme,
    ...declarations(block(GLOBALS, '.dark, .dark-theme', 'globals.css')),
    ...declarations(block(radix('gray-dark.css'), '.dark, .dark-theme', 'gray-dark.css')),
    ...declarations(block(radix('red-dark.css'), '.dark, .dark-theme', 'red-dark.css')),
  ]),
}

/** `var(--name)` with no fallback — the only form that can go invalid at computed-value time. */
const bareVar = () => /var\(\s*(--[\w-]+)\s*\)/g

/** Substitutes every `var()` through, so an unresolvable name survives into the result. */
const resolve = (value: string, tokens: Map<string, string>, depth = 0): string => {
  if (depth > 10) throw new Error(`cycle resolving \`${value}\``)

  return value.replace(bareVar(), (whole, name: string) => {
    const next = tokens.get(name)

    return next === undefined ? whole : resolve(next, tokens, depth + 1)
  })
}

describe('host-reset.css', () => {
  it('restates the properties the embedding guide promises hosts it restates', () => {
    // `docs/embedding.md` names this list. A property dropped here reaches our text unasked.
    expect([...ROOT.keys()].filter((prop) => !prop.startsWith('--')).sort()).toEqual([
      'color',
      'font-family',
      'letter-spacing',
      'text-align',
      'text-transform',
      'word-spacing',
    ])
  })

  for (const mode of ['light', 'dark'] as const) {
    it(`resolves every bare var() on the widget root (${mode})`, () => {
      const unresolved = [...ROOT]
        .map(([prop, value]) => [prop, resolve(value, TOKENS[mode])] as const)
        .filter(([, resolved]) => bareVar().test(resolved))
        .map(([prop, resolved]) => `${prop}: ${resolved}`)

      expect(unresolved).toEqual([])
    })

    it(`resolves the root color to a literal colour (${mode})`, () => {
      const value = ROOT.get('color')

      if (value === undefined) throw new Error('host-reset.css: no `color` on `.sy-atlas`')

      // A bare hex, never `hsl(#202020)`: `--color-foreground` resolves to a Radix hex, so a
      // channel-format wrapper would resolve here and still compute to nothing in a browser.
      expect(resolve(value, TOKENS[mode])).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i)
    })
  }
})
