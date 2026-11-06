import { colord, extend } from 'colord'
import a11yPlugin from 'colord/plugins/a11y'
import { describe, it, expect } from 'vitest'

import { buildScale, DEFAULT_SEEDS, type Step, type ThemeMode } from './palette'

import { readRepoSource } from '@/test-support/repo-source'

// The built-in brand defaults are hand-frozen in `globals.css` as static CSS. The runtime engine writes the same variables at runtime.
// This gate asserts that those frozen values exactly match what `buildScale()` produces from `DEFAULT_SEEDS`.
// So a change to the ladder, the saturation cap, or the clamp logic cannot silently desync the no-tenant theme from every tenant theme, without turning this test red.

extend([a11yPlugin])

const css = readRepoSource('src/styles/globals.css')

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

// The one focus rule draws its 2px line in primary step 9, which is the dark-mode solid fill
// itself: on Register that line measured 1:1. So the rule lays a band of the panel's colour just
// inside the line, and on a filled control that band is what shows. These defaults decide both
// contrasts, so they are checked here, where the frozen values live.
describe('globals.css focus ring on the brand defaults', () => {
  const rule = /:focus-visible:not\(\[tabindex='-1'\]\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const hsl = (channels: string | undefined) => {
    const [h, s, l] = (channels ?? '').split(/\s+/).map((part) => parseFloat(part))

    return colord({ h, s, l })
  }
  // What `Button`'s `solid` variant fills with: step 12 in light mode, step 9 in dark.
  const SOLID_STEP: Record<ThemeMode, Step> = { light: 12, dark: 9 }

  it('lays a panel-coloured band inside the line, through the ring shadow every atom draws', () => {
    expect(rule).toContain('outline: 2px solid var(--color-focus) !important;')
    expect(rule).toContain('--tw-ring-shadow: inset 0 0 0 4px hsl(var(--background)) !important;')
  })

  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    const vars = BLOCKS[mode]
    const panel = hsl(vars['--background'])

    it(`shows the line against the panel in ${mode} mode`, () => {
      expect(hsl(vars['--primary-9']).contrast(panel)).toBeGreaterThanOrEqual(3)
    })

    for (const role of Object.keys(DEFAULT_SEEDS)) {
      it(`shows the band on a filled ${role} control in ${mode} mode`, () => {
        expect(panel.contrast(hsl(vars[`--${role}-${SOLID_STEP[mode]}`]))).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
