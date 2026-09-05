import { readFileSync } from 'node:fs'

import { describe, it, expect } from 'vitest'

import { buildScale, DEFAULT_SEEDS, type Step, type ThemeMode } from './palette'

// The built-in brand defaults are hand-frozen in `globals.css` as static CSS. The runtime engine writes the same variables at runtime.
// This gate asserts that those frozen values exactly match what `buildScale()` produces from `DEFAULT_SEEDS`.
// So a change to the ladder, the saturation cap, or the clamp logic cannot silently desync the no-tenant theme from every tenant theme, without turning this test red.

const css = readFileSync(new URL('../../styles/globals.css', import.meta.url), 'utf8')

// This pulls the `--name: value;` declarations out of a selector block's body.
const declarations = (body: string): Record<string, string> => {
  const out: Record<string, string> = {}

  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[name] = value.trim()
  }

  return out
}

const block = (selector: RegExp): Record<string, string> => {
  const match = css.match(selector)

  if (!match) throw new Error(`globals.css: brand-default block not found for ${selector}`)

  return declarations(match[1])
}

const BLOCKS: Record<ThemeMode, Record<string, string>> = {
  light: block(/:root,\s*\.light,\s*\.light-theme\s*\{([^}]*)\}/),
  dark: block(/\.dark,\s*\.dark-theme\s*\{([^}]*)\}/),
}

const STEPS: Step[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

describe('globals.css brand defaults', () => {
  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    for (const [role, seed] of Object.entries(DEFAULT_SEEDS)) {
      it(`${role} ramp (${mode}) matches buildScale(${seed})`, () => {
        const vars = BLOCKS[mode]
        const scale = buildScale(seed, mode)

        expect(vars[`--${role}-on`]).toBe(scale.on)
        for (const step of STEPS) {
          expect(vars[`--${role}-${step}`]).toBe(scale[step])
        }
      })
    }
  }
})
