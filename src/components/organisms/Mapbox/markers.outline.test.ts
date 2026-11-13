import { colord, extend } from 'colord'
import a11yPlugin from 'colord/plugins/a11y'
import { describe, expect, it } from 'vitest'

import { BASEMAP_SURFACES, DEFAULT_MARKER_COLORS, MARKER_OUTLINE, markerImages } from './markers'

import { readRepoSource } from '@/test-support/repo-source'

extend([a11yPlugin])

/**
 * The map edge is the one thing no brand colour decides, so it is the one thing a
 * style swap can break silently: a new basemap renders perfectly and the pins
 * dissolve into it. The committed land and water values are what this holds the
 * outlines against, and the style ids are what ties them to a real basemap.
 *
 * ⚠ A failure here means the committed surfaces no longer describe the styles
 * `Map.tsx` loads. Re-measure both from the style JSON — do not lower the bar.
 */
describe('the fixed marker outline', () => {
  it.each(['light', 'dark'] as const)('separates from %s land and water', (mode) => {
    const outline = colord(MARKER_OUTLINE[mode])

    expect(outline.contrast(BASEMAP_SURFACES[mode].land)).toBeGreaterThanOrEqual(3)
    expect(outline.contrast(BASEMAP_SURFACES[mode].water)).toBeGreaterThanOrEqual(3)
  })

  it('refuses the intuitive pairing, which does not clear either style', () => {
    // Stated as a case rather than a comment: the dark style is mid-toned and its
    // land is lighter than its water, so a pale edge on the light map and a dark
    // one on the dark map is what fails.
    const swapped = { dark: MARKER_OUTLINE.light, light: MARKER_OUTLINE.dark }

    expect(colord(swapped.light).contrast(BASEMAP_SURFACES.light.land)).toBeLessThan(3)
    expect(colord(swapped.dark).contrast(BASEMAP_SURFACES.dark.water)).toBeLessThan(3)
  })

  it('draws no black or white edge on a pin or a bubble, which carry their own ring', () => {
    for (const image of markerImages(DEFAULT_MARKER_COLORS).values()) {
      for (const edge of Object.values(MARKER_OUTLINE)) {
        expect(image.svg).not.toContain(`stroke="${edge}"`)
      }
    }
  })

  it('names the styles the surfaces were measured from', () => {
    // The values are measured once from each style's JSON, which no gate can fetch
    // (`VITE_MAPBOX_ACCESSTOKEN` is not in the committed `.env`). What this holds is
    // that the ids beside them are still the ids the map loads.
    const markers = readRepoSource('src/components/organisms/Mapbox/markers.ts')
    const map = readRepoSource('src/components/organisms/Mapbox/Map.tsx')

    for (const id of ['ck7g6nag70rn11io09f45odkq', 'cl4nw934f001j14l8jnof3a7w']) {
      expect(markers).toContain(id)
      expect(map).toContain(id)
    }
  })
})
