import { describe, it, expect } from 'vitest'

import { buildScale, applyPalette, type ColorScale, type Step } from './palette'

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
    // Dark maroon stays dark; its ≈94% saturation is capped to the muted register.
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

  it('floors a near-black solid so it stays visible on the dark canvas', () => {
    expect(parse(buildScale('#64032e', 'dark')[9]).l).toBeGreaterThanOrEqual(60)
  })
})

describe('contrast', () => {
  it('picks a readable on-color for the brand solid (by its lightness)', () => {
    expect(buildScale('#82b1ae', 'light').contrast).toBe('0 0% 0%') // light teal → black
    expect(buildScale('#64032e', 'light').contrast).toBe('0 0% 100%') // dark maroon → white
  })
})

// A DOM-light stand-in for the root element so the var writes can be asserted
// in the node-only lane (no jsdom — see .claude/rules/tests.md).
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
  it('writes the full primary 12-step ramp + contrast', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e' }, 'light')

    expect(props.get('--primary-9')).toBe('333 60% 20%')
    expect(props.get('--primary-contrast')).toBe('0 0% 100%')
    expect(props.get('--primary-1')).toBeDefined()
    expect(props.get('--primary-12')).toBeDefined()
    // All 12 steps present.
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

    // Hue + capped saturation are honored, but the shade is the ladder's
    // near-white app-background step — not the seed's own 91% lightness.
    applyPalette(light.root, { background: '#f0ece2' }, 'light')
    expect(light.props.get('--background')).toBe('43 32% 99%')

    // Dark mode now applies too, tinting the near-black app-background step.
    const dark = fakeRoot()

    applyPalette(dark.root, { background: '#f0ece2' }, 'dark')
    expect(dark.props.get('--background')).toBe('43 32% 9%')
  })

  it('lifts a near-black background seed to a readable light surface (no black panel)', () => {
    const { root, props } = fakeRoot()

    // A #000000 seed (e.g. an unset client default) must not blacken the panel:
    // the shade snaps to the near-white app-bg step, keeping the dark text legible.
    applyPalette(root, { background: '#000000' }, 'light')
    expect(props.get('--background')).toBe('0 0% 99%')
  })

  it('ignores invalid seed hexes', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: 'not-a-color' }, 'light')

    expect(props.size).toBe(0)
  })

  it('clears a role that is dropped on a later apply (reverts to the default)', () => {
    const { root, props } = fakeRoot()

    applyPalette(root, { primary: '#64032e', secondary: '#7a404e', background: '#f0ece2' }, 'light')
    expect(props.has('--secondary-9')).toBe(true)
    expect(props.has('--background')).toBe(true)

    // Re-apply with only primary → secondary + background revert to the default.
    applyPalette(root, { primary: '#64032e' }, 'light')
    expect(props.has('--secondary-9')).toBe(false)
    expect(props.has('--secondary-1')).toBe(false)
    expect(props.has('--background')).toBe(false)
    expect(props.get('--primary-9')).toBe('333 60% 20%')
  })
})
