import { describe, it, expect } from 'vitest'

import { DEFAULT_MARKER_COLORS, MARKER_IDS, markerColors, markerImages } from './markers'

/**
 * The art an embed with no tenant seed renders, frozen byte for byte.
 *
 * Compared in both modes, because "unchanged" is the whole
 * promise `markerColors` makes for an unseeded role: `DEFAULT_SEEDS.primary`'s
 * own step 9 is a different teal, and a different one again in dark mode. A
 * change here is a visible change to every unbranded embed.
 */
const STOCK = {
  [MARKER_IDS.point]: {
    width: 34,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="68" height="76" viewBox="0 0 34 38"><defs>\n    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">\n      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>\n    </filter>\n  </defs>\n  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="#30A47D" filter="url(#shadow)"/>\n  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/></svg>',
  },
  [MARKER_IDS.pointSelected]: {
    width: 34,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="68" height="76" viewBox="0 0 34 38"><defs>\n    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">\n      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>\n    </filter>\n  </defs>\n  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="#E0775C" filter="url(#shadow)"/>\n  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/></svg>',
  },
  [MARKER_IDS.cluster]: {
    width: 38,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 38 38"><circle cx="19" cy="19" r="19" fill="#9ED8C2" opacity="0.706"/>\n  <circle cx="19" cy="19" r="13.8" fill="#2E9E78"/></svg>',
  },
  [MARKER_IDS.clusterSelected]: {
    width: 38,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 38 38"><circle cx="19" cy="19" r="19" fill="#F4B9A6" opacity="0.706"/>\n  <circle cx="19" cy="19" r="13.8" fill="#DD785D"/></svg>',
  },
} as const

// The Ladle `shrimataji.org` preset's primary, and `palette.test.ts`'s seed.
const MAROON = '#64032e'

describe('markerColors', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`keeps the stock colors in ${mode} when no role has a usable seed`, () => {
      expect(markerColors({}, mode)).toEqual(DEFAULT_MARKER_COLORS)
      // `#000000` is what the client record defaults `color1`–`color3` to, so an
      // unconfigured tenant takes the same path as an absent palette.
      expect(markerColors({ primary: '#000000', contrast: '#000000' }, mode)).toEqual(
        DEFAULT_MARKER_COLORS,
      )
      expect(markerColors({ primary: null, contrast: undefined }, mode)).toEqual(
        DEFAULT_MARKER_COLORS,
      )
    })

    it(`answers with one shared object in ${mode} when nothing is seeded`, () => {
      // Identity, not equality. `Map.tsx` memoises this and the registration
      // effect depends on it, so an equal-but-new object would cost an
      // unbranded embed a re-subscription and four rebuilt SVGs per theme flip.
      expect(markerColors({}, mode)).toBe(DEFAULT_MARKER_COLORS)
      expect(markerColors({ primary: '#000000', contrast: '#000000' }, mode)).toBe(
        DEFAULT_MARKER_COLORS,
      )
    })

    it(`renders the stock SVGs byte for byte in ${mode}`, () => {
      const images = markerImages(markerColors({}, mode))

      for (const id of Object.values(MARKER_IDS)) expect(images.get(id)).toEqual(STOCK[id])
    })
  }

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
      DEFAULT_MARKER_COLORS[MARKER_IDS.pointSelected],
    )
    expect(colors[MARKER_IDS.clusterSelected]).toEqual(
      DEFAULT_MARKER_COLORS[MARKER_IDS.clusterSelected],
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
    const images = markerImages(DEFAULT_MARKER_COLORS)

    // `styleimagemissing` carries the basemap's own layer ids too, which is why
    // this is a Map rather than an object literal.
    expect(images.get('constructor')).toBeUndefined()
    expect(images.get('toString')).toBeUndefined()
  })
})
