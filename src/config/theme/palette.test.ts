import { colord } from 'colord'
import { describe, it, expect } from 'vitest'

import {
  buildPalette,
  buildScale,
  applyPalette,
  onHex,
  paletteReport,
  shiftHex,
  SOLID_STEP,
  stepHex,
  type ColorScale,
  type Step,
  type ThemeMode,
} from './palette'

const parse = (s: string) => {
  const [h, sPct, lPct] = s.split(' ')

  return { h: Number(h), s: Number(sPct.replace('%', '')), l: Number(lPct.replace('%', '')) }
}

const lightnessOf = (scale: ColorScale, step: Step) => parse(scale[step]).l

describe('buildScale', () => {
  it('walks a monotonically darkening background→border ladder (steps 1–8)', () => {
    const scale = buildScale('#82b1ae', 'light')
    const lightnesses = ([1, 2, 3, 4, 5, 6, 7, 8] as Step[]).map((step) => lightnessOf(scale, step))

    for (let i = 1; i < lightnesses.length; i++) {
      expect(lightnesses[i]).toBeLessThan(lightnesses[i - 1])
    }
  })

  it('makes step 9 the brand solid: respects seed hue + lightness, caps saturation', () => {
    // Dark maroon stays dark. Its saturation, about 94%, is capped to the muted register.
    const maroon = parse(buildScale('#64032e', 'light')[9])

    expect(maroon.h).toBe(333)
    expect(maroon.l).toBe(20) // the seed's own lightness, preserved
    expect(maroon.s).toBe(60) // capped from 94

    // A muted seed keeps its low saturation (not pushed up to the cap).
    expect(parse(buildScale('#82b1ae', 'light')[9]).s).toBe(23)
  })

  it('keeps a near-neutral seed neutral (the cap leaves low saturation alone)', () => {
    expect(parse(buildScale('#333333', 'light')[9]).s).toBeLessThan(10)
  })

  it('caps a near-white solid so it stays visible on the light canvas', () => {
    expect(parse(buildScale('#fafafa', 'light')[9]).l).toBeLessThanOrEqual(70)
  })

  it('caps a near-white solid in dark mode too, keeping its hue', () => {
    // White passes `surface` on the dark page, so nothing else would move it.
    const solid = parse(buildScale('#fffdfa', 'dark')[9])

    expect(solid.l).toBeLessThanOrEqual(80)
    expect(solid.h).toBe(colord('#fffdfa').toHsl().h)
  })

  it('tells three near-white seeds apart in dark mode', () => {
    // The palette that prompted the cap: a service's three colours, all near-white.
    const solids = ['#fffdfa', '#fafcff', '#fff7f5'].map((seed) =>
      colord(`hsl(${buildScale(seed, 'dark')[9]})`),
    )

    for (const [i, a] of solids.entries()) {
      for (const b of solids.slice(i + 1)) expect(a.delta(b)).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('floors a near-black solid so it stays visible on the dark canvas', () => {
    expect(parse(buildScale('#64032e', 'dark')[9]).l).toBeGreaterThanOrEqual(60)
  })
})

describe('on-color', () => {
  it('picks a readable on-color for the brand solid (by its lightness)', () => {
    expect(buildScale('#82b1ae', 'light').on).toBe('0 0% 0%') // light teal → black
    expect(buildScale('#64032e', 'light').on).toBe('0 0% 100%') // dark maroon → white
  })
})

// This is a DOM-light stand-in for the root element.
// It lets the var writes be asserted in the node-only lane, with no jsdom. See `docs/testing.md`.
function fakeRoot() {
  const props = new Map<string, string>()
  const root = {
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
    },
  } as unknown as HTMLElement

  return { root, props }
}

describe('applyPalette', () => {
  it('writes the full primary 12-step ramp + on-color', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e' }, 'light')

    expect(props.get('--primary-9')).toBe('333 60% 20%')
    expect(props.get('--primary-on')).toBe('0 0% 100%')
    expect(props.get('--primary-1')).toBeDefined()
    expect(props.get('--primary-12')).toBeDefined()
    // All 12 steps are present.
    for (let step = 1; step <= 12; step++) {
      expect(props.has(`--primary-${step}`)).toBe(true)
    }
  })

  it('lifts a dark solid to a visible tone in dark mode (no vanishing primary)', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e' }, 'dark')

    const solid = parse(props.get('--primary-9')!)

    expect(solid.h).toBe(333) // hue preserved
    expect(solid.s).toBe(60) // capped saturation
    expect(solid.l).toBe(60) // lifted from the seed's dark 20 to the dark minimum
  })

  it('leaves omitted roles untouched', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e' }, 'light')

    expect([...props.keys()].some((k) => k.startsWith('--secondary'))).toBe(false)
    expect(props.has('--background')).toBe(false)
  })

  it('derives the background surface from the ladder app-bg step (both modes)', () => {
    const light = fakeRoot()

    // Hue and capped saturation are honored.
    // The shade is the ladder's near-white app-background step, not the seed's own 91% lightness.
    applyPalette(light.root, { background: '#f0ece2' }, 'light')
    expect(light.props.get('--background')).toBe('43 32% 99%')

    // Dark mode now applies too, tinting the near-black app-background step.
    const dark = fakeRoot()

    applyPalette(dark.root, { background: '#f0ece2' }, 'dark')
    expect(dark.props.get('--background')).toBe('43 32% 9%')
  })

  it('lifts a near-black background seed to a readable light surface (no black panel)', () => {
    const { root, props } = fakeRoot()

    // A `#000000` seed, such as an unset client default, must not blacken the panel.
    // The shade snaps to the near-white app-background step, keeping the dark text legible.
    applyPalette(root, { background: '#000000' }, 'light')
    expect(props.get('--background')).toBe('0 0% 99%')
  })

  it('ignores invalid seed hexes', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: 'not-a-color' }, 'light')

    expect(props.size).toBe(0)
  })

  it('ignores an achromatic seed so the default brand theme stands', () => {
    const { root, props } = fakeRoot()

    // The local client record defaults `color1` through `color3` to `#000000`.
    // An achromatic primary or secondary must NOT paint a grey ramp.
    // Those roles fall back to the `globals.css` default, the built-in teal or orange.
    // Background still snaps to the readable near-white app-background step, as it does for any near-black seed.
    applyPalette(root, { primary: '#000000', secondary: '#000000', background: '#000000' }, 'light')

    expect([...props.keys()].some((k) => k.startsWith('--primary'))).toBe(false)
    expect([...props.keys()].some((k) => k.startsWith('--secondary'))).toBe(false)
    expect(props.get('--background')).toBe('0 0% 99%')
  })

  it('clears a role that is dropped on a later apply (reverts to the default)', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e', secondary: '#7a404e', background: '#f0ece2' }, 'light')
    expect(props.has('--secondary-9')).toBe(true)
    expect(props.has('--background')).toBe(true)

    // This re-applies with only primary. Secondary and background revert to the default.
    applyPalette(root, { primary: '#64032e' }, 'light')
    expect(props.has('--secondary-9')).toBe(false)
    expect(props.has('--secondary-1')).toBe(false)
    expect(props.has('--background')).toBe(false)
    expect(props.get('--primary-9')).toBe('333 60% 20%')
  })
})

// The map paints with literal colors, not CSS variables, so it reads the ramp
// through these three rather than through `applyPalette`.
describe('the hex accessors', () => {
  it('gives a step as #rrggbb, per mode', () => {
    expect(stepHex('#64032e', 'light', 9)).toBe('#521430')
    // Dark mode floors the solid's lightness at 60, so the same seed is lighter.
    expect(stepHex('#64032e', 'dark', 9)).toBe('#d65c93')
    expect(stepHex('#64032e', 'light', 8)).toBe('#d9689b')
  })

  it('refuses a seed that is absent, invalid or achromatic', () => {
    // The refusal `setRole` already makes by writing nothing. Every caller then
    // keeps its own built-in default rather than painting a grey ramp.
    for (const seed of [undefined, null, '', 'not-a-color', '#000000', '#ffffff', '#333333']) {
      expect(stepHex(seed, 'light', 9)).toBeNull()
      expect(onHex(seed, 'light')).toBeNull()
    }
  })

  it('gives the solid step a readable on-color', () => {
    expect(onHex('#64032e', 'light')).toBe('#ffffff')
    // Dark mode's lighter solid reads better under black.
    expect(onHex('#64032e', 'dark')).toBe('#000000')
  })

  it('shifts a hex in HSL, clamped', () => {
    // The marker rings: each one is its own fill, lighter and less saturated.
    expect(shiftHex('#521430', { lightness: 21, saturation: -16, maxLightness: 92 })).toBe(
      '#983a64',
    )
    // A near-white seed hits both clamps: lightness at the cap, saturation at 0.
    expect(shiftHex('#fafafa', { lightness: 21, saturation: -16, maxLightness: 92 })).toBe(
      '#ebebeb',
    )
  })
})

/**
 * The three legibility checks, against seeds chosen to break them.
 *
 * ⚠ **Every case here asserts the rendered colour, never the correction.** What a
 * service is owed is a map and a panel they can read; which step moved to get
 * there is this file's business.
 */
describe('legibility', () => {
  /** Step 11 is panel text, read on steps 1 to 3 — `text-*-11` on `bg-*-3` is the pairing. */
  const panelText = (scale: ColorScale) =>
    Math.min(
      ...[1, 2, 3].map((step) =>
        colord(`hsl(${scale[11]})`).contrast(colord(`hsl(${scale[step as Step]})`)),
      ),
    )

  const APP_BACKGROUND = { dark: '#121212', light: '#ffffff' } as const

  // Pale yellow (the deliberately awkward choice), a near-white blue, a navy, our
  // own three, and a pair a service could plausibly pick that read almost alike.
  const SEEDS = [
    '#ffff00',
    '#f0f0ff',
    '#000080',
    '#1E6C71',
    '#5e98ba',
    '#d8735a',
    '#2f7f84',
  ] as const

  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    it.each(SEEDS)(`keeps %s legible in ${mode}`, (seed) => {
      const { contrast, primary } = buildPalette({ contrast: seed, primary: seed }, mode)

      for (const role of [primary!, contrast!]) {
        expect(panelText(role.scale)).toBeGreaterThanOrEqual(4.5)
        expect(
          colord(`hsl(${role.scale[SOLID_STEP]})`).contrast(APP_BACKGROUND[mode]),
        ).toBeGreaterThanOrEqual(3)
      }
    })

    it.each(SEEDS)(`separates the selected class from %s in ${mode}`, (seed) => {
      // One seed for both roles is the worst case the check exists for: without it
      // the selected pin is the same colour as every pin around it.
      const { contrast, primary } = buildPalette({ contrast: seed, primary: seed }, mode)
      const selected = colord(`hsl(${contrast!.scale[SOLID_STEP]})`)

      // ⚠ `delta()` answers CIEDE2000 ÷ 100, so this reads 0.2 and means ΔE2000 20.
      expect(selected.delta(`hsl(${primary!.scale[SOLID_STEP]})`)).toBeGreaterThanOrEqual(0.2)
    })
  }

  it('leaves a seed that already passes exactly where it was', () => {
    // Our own primary passes `surface` and needs no separation from itself-as-contrast
    // at a different hue, so step 9 is the seed's own lightness, uncorrected.
    const { primary } = buildPalette({ contrast: '#d8735a', primary: '#1E6C71' }, 'light')

    expect(primary!.scale[SOLID_STEP]).toBe('184 58% 28%')
    expect(primary!.adjustedBy).not.toContain('surface')
  })
})

describe('paletteReport', () => {
  // `#f8f1f4` is the case this exists for: its rendered step 9 is not a seed that
  // renders itself, found by sweeping ~37k seeds.
  it.each(['#f8f1f4', '#ffff00', '#f0f0ff', '#A1C3D7', '#e08e79', '#00ff7f'])(
    'offers a seed for %s that renders itself, with nothing left to correct',
    (seed) => {
      // ⚠ The ladder works in HSL and emits a quantised hex, so the rendered
      // colour is not always a seed that renders itself. Offering one that is not
      // would change the volunteer's colour a second time, the moment they
      // accepted the first suggestion.
      const { suggested } = paletteReport({ contrast: '#d8735a', primary: seed }).primary!

      if (!suggested) return

      const again = paletteReport({ contrast: '#d8735a', primary: suggested }).primary!

      expect(again.light).toBe(suggested)
      expect(again.suggested).toBeNull()
    },
  )

  it('names the entered colour and the check that moved it', () => {
    const report = paletteReport({ contrast: '#d8735a', primary: '#ffff00' })

    expect(report.primary?.entered).toBe('#ffff00')
    expect(report.primary?.adjustedBy).toContain('surface')
  })

  it('reports a near-white seed as moved away from near-white', () => {
    expect(paletteReport({ primary: '#fffdfa' }).primary?.adjustedBy).toContain('near-white')
    expect(paletteReport({ primary: '#1E6C71' }).primary?.adjustedBy).not.toContain('near-white')
  })

  it('offers no suggestion for a role only `panel-text` moved', () => {
    // `panel-text` moves step 11, which takes a fixed lightness — no seed can
    // express it, so there is nothing to offer and the CMS shows no button.
    const report = paletteReport({ primary: '#1E6C71' })

    expect(report.primary?.adjustedBy).toEqual(['panel-text'])
    expect(report.primary?.suggested).toBeNull()
  })

  it('answers for a role with a usable seed and no other', () => {
    const report = paletteReport({ primary: '#1E6C71', secondary: '#000000' })

    expect(report.primary).toBeDefined()
    expect(report.secondary).toBeUndefined()
  })
})
