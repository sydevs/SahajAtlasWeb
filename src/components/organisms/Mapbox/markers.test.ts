import { describe, it, expect } from 'vitest'

import {
  DEFAULT_MARKER_COLORS,
  MARKER_IDS,
  MARKER_OUTLINE,
  markerColors,
  markerImages,
} from './markers'

/**
 * The art an embed with no tenant seed renders on the LIGHT basemap, frozen byte
 * for byte. The dark art is pinned against it below, by the one thing that differs.
 *
 * Taken off `main` and compared in both modes, because "unchanged" is the whole
 * promise `markerColors` makes for an unseeded role: `DEFAULT_SEEDS.primary`'s
 * own step 9 is a different teal, and a different one again in dark mode. A
 * change here is a visible change to every unbranded embed.
 */
const STOCK = {
  [MARKER_IDS.point]: {
    width: 34,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="68" height="76" viewBox="0 0 34 38"><defs>\n    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">\n      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>\n    </filter>\n  </defs>\n  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="#21C1A2" filter="url(#shadow)" stroke="#000000" stroke-width="1.2" stroke-linejoin="round"/>\n  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/></svg>',
  },
  [MARKER_IDS.pointSelected]: {
    width: 34,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="68" height="76" viewBox="0 0 34 38"><defs>\n    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">\n      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>\n    </filter>\n  </defs>\n  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="#E87952" filter="url(#shadow)" stroke="#000000" stroke-width="1.2" stroke-linejoin="round"/>\n  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/></svg>',
  },
  [MARKER_IDS.cluster]: {
    width: 38,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 38 38"><circle cx="19" cy="19" r="18.4" fill="#8CCDC4" opacity="0.706" stroke="#000000" stroke-width="1.2"/>\n  <circle cx="19" cy="19" r="13.8" fill="#37BB92" opacity="0.914"/></svg>',
  },
  [MARKER_IDS.clusterSelected]: {
    width: 38,
    height: 38,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 38 38"><circle cx="19" cy="19" r="18.4" fill="#F2A179" opacity="0.706" stroke="#000000" stroke-width="1.2"/>\n  <circle cx="19" cy="19" r="13.8" fill="#E47C5A" opacity="0.914"/></svg>',
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

    it(`outlines the stock art for the ${mode} basemap`, () => {
      const images = markerImages(markerColors({}, mode), mode)

      for (const id of Object.values(MARKER_IDS)) {
        // Only the edge differs between the two basemaps, so the dark art is the
        // frozen light art with its one outline attribute swapped. A fill that
        // moved in either mode fails here.
        expect(images.get(id)).toEqual({
          ...STOCK[id],
          svg: STOCK[id].svg.replaceAll(
            `stroke="${MARKER_OUTLINE.light}"`,
            `stroke="${MARKER_OUTLINE[mode]}"`,
          ),
        })
        expect(images.get(id)?.svg).toContain(`stroke="${MARKER_OUTLINE[mode]}"`)
      }
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
    // One seed for both roles, so `selected-distinct` moves the selected pair
    // away from the ordinary pin: the selected class must read as a different
    // colour from the ones around it, whatever a service entered.
    expect(markerColors({ primary: MAROON, contrast: MAROON }, 'dark')).toEqual({
      [MARKER_IDS.point]: { fill: '#d65c93' },
      [MARKER_IDS.pointSelected]: { fill: '#ecb1cc' },
      [MARKER_IDS.cluster]: { fill: '#d65c93', ring: '#e4b9cc' },
      [MARKER_IDS.clusterSelected]: { fill: '#ecb1cc', ring: '#f4e1ea' },
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
    const images = markerImages(markerColors({ primary: MAROON }, 'light'), 'light')

    expect(images.get(MARKER_IDS.point)?.svg).toContain('fill="#521430"')
    expect(images.get(MARKER_IDS.cluster)?.svg).toContain('fill="#521430"')
    expect(images.get(MARKER_IDS.cluster)?.svg).toContain('fill="#983a64"')
    // A palette moves only the fills, never the box the art is placed in.
    expect(images.get(MARKER_IDS.point)).toMatchObject({ width: 34, height: 38 })
    expect(images.get(MARKER_IDS.cluster)).toMatchObject({ width: 38, height: 38 })
  })

  it('answers nothing for an id that is not a marker', () => {
    const images = markerImages(DEFAULT_MARKER_COLORS, 'light')

    // `styleimagemissing` carries the basemap's own layer ids too, which is why
    // this is a Map rather than an object literal.
    expect(images.get('constructor')).toBeUndefined()
    expect(images.get('toString')).toBeUndefined()
  })
})
