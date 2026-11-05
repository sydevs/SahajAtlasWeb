import { describe, it, expect } from 'vitest'

import { DEFAULT_MARKER_COLORS, MARKER_IDS, markerColors, markerImages } from './markers'

// The Ladle `shrimataji.org` preset's primary, and `palette.test.ts`'s seed.
const MAROON = '#64032e'

describe('markerColors', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`uses the default primary in ${mode} when no role has a usable seed`, () => {
      // `#000000` is what the client record defaults `color1`–`color3` to, so an
      // unconfigured tenant takes the same path as an absent palette.
      for (const palette of [
        {},
        { primary: '#000000', contrast: '#000000' },
        { primary: null, contrast: undefined },
      ]) {
        // Identity, not equality. `Map.tsx` memoises this and the registration
        // effect depends on it, so an equal-but-new object would cost an unbranded
        // embed a re-subscription and four rebuilt SVGs.
        expect(markerColors(palette, mode)).toBe(DEFAULT_MARKER_COLORS[mode])
      }
    })
  }

  it('paints a default pin and cluster the same colour as the button teal', () => {
    const { light } = DEFAULT_MARKER_COLORS

    expect(light[MARKER_IDS.point].fill).toBe('#1e6b71')
    expect(light[MARKER_IDS.cluster].fill).toBe('#1e6b71')
  })

  it('keeps orange for the selected pair alone', () => {
    const { light } = DEFAULT_MARKER_COLORS

    expect(light[MARKER_IDS.pointSelected].fill).toBe('#E87952')
    expect(light[MARKER_IDS.clusterSelected].fill).toBe('#E47C5A')
  })

  it('fills the pins from primary step 9 and the selected pair from contrast', () => {
    expect(markerColors({ primary: MAROON, contrast: '#1E6C71' }, 'light')).toEqual({
      [MARKER_IDS.point]: { fill: '#521430' },
      [MARKER_IDS.pointSelected]: { fill: '#1e6b71' },
      [MARKER_IDS.cluster]: { fill: '#521430', ring: '#983a64' },
      [MARKER_IDS.clusterSelected]: { fill: '#1e6b71', ring: '#48aab1' },
    })
  })

  it('tracks the mode, since step 9 is mode-aware', () => {
    expect(markerColors({ primary: MAROON, contrast: MAROON }, 'dark')).toEqual({
      [MARKER_IDS.point]: { fill: '#d65c93' },
      [MARKER_IDS.pointSelected]: { fill: '#d65c93' },
      [MARKER_IDS.cluster]: { fill: '#d65c93', ring: '#e4b9cc' },
      [MARKER_IDS.clusterSelected]: { fill: '#d65c93', ring: '#e4b9cc' },
    })
  })

  it('falls back per role, not per palette', () => {
    const colors = markerColors({ primary: MAROON }, 'light')

    expect(colors[MARKER_IDS.point]).toEqual({ fill: '#521430' })
    expect(colors[MARKER_IDS.cluster]).toEqual({ fill: '#521430', ring: '#983a64' })
    // A tenant that configured `color1` alone keeps the stock selected accent.
    expect(colors[MARKER_IDS.pointSelected]).toEqual(
      DEFAULT_MARKER_COLORS.light[MARKER_IDS.pointSelected],
    )
    expect(colors[MARKER_IDS.clusterSelected]).toEqual(
      DEFAULT_MARKER_COLORS.light[MARKER_IDS.clusterSelected],
    )
  })
})

describe('markerImages', () => {
  it('paints the derived fill and ring into the SVG', () => {
    const images = markerImages(markerColors({ primary: MAROON }, 'light'))

    expect(images.get(MARKER_IDS.point)?.svg).toContain('fill="#521430"')
    expect(images.get(MARKER_IDS.cluster)?.svg).toContain('fill="#521430"')
    expect(images.get(MARKER_IDS.cluster)?.svg).toContain('fill="#983a64"')
    // A palette moves only the fills, never the box the art is placed in.
    expect(images.get(MARKER_IDS.point)).toMatchObject({ width: 34, height: 38 })
    expect(images.get(MARKER_IDS.cluster)).toMatchObject({ width: 38, height: 38 })
  })

  it('answers nothing for an id that is not a marker', () => {
    const images = markerImages(DEFAULT_MARKER_COLORS.light)

    // `styleimagemissing` carries the basemap's own layer ids too, which is why
    // this is a Map rather than an object literal.
    expect(images.get('constructor')).toBeUndefined()
    expect(images.get('toString')).toBeUndefined()
  })
})
