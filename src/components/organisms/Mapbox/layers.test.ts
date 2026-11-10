import type { LayerProps } from 'react-map-gl'

import { colord, extend } from 'colord'
import a11yPlugin from 'colord/plugins/a11y'
import { describe, it, expect } from 'vitest'

import { MARKER_IDS, markerColors } from './markers'
import {
  VAGUE_RADIUS_KM,
  vagueDotLayer,
  vaguePinLayer,
  vagueRingLayer,
  boundsLayer,
  clusterLayer,
  hoveredAreaLayer,
  hoveredPointLayer,
  INTERACTIVE_LAYER_IDS,
  LAYER_IDS,
  RING_MAX_ZOOM,
  RING_ZOOM,
  selectedAreaLayer,
  selectedPointLayer,
  unclusteredPointLayer,
} from './layers'

// `.contrast()` is a colord plugin, as in `palette.ts`.
extend([a11yPlugin])

const MAROON = '#64032e'

// `LayerProps` is a union over every Mapbox layer type, so `paint` cannot be
// indexed by a key only one member has. The specs below read it through this.
const paintOf = (layer: LayerProps) => (layer.paint ?? {}) as Record<string, unknown>

/**
 * Layer ids are a contract with the click handler, with `interactiveLayerIds`,
 * and with anything inspecting a live map. Two of the layers became factories
 * when their paints started following the palette, so this pins every id as the
 * string it has always been.
 */
describe('LAYER_IDS', () => {
  it('holds the ids the map has always used', () => {
    expect(LAYER_IDS).toEqual({
      cluster: 'clusters',
      unclusteredPoint: 'unclustered-point',
      selectedPoint: 'selected-point',
      selectedArea: 'selected-area',
      hoveredPoint: 'hovered-point',
      hoveredArea: 'hovered-area',
      vaguePin: 'vague-pin',
      vagueRing: 'vague-ring',
      vagueDot: 'vague-dot',
      bounds: 'selected-bounds',
    })
  })

  it('is what every layer identifies itself as', () => {
    expect(clusterLayer({}, 'light').id).toBe(LAYER_IDS.cluster)
    expect(boundsLayer({}, 'light').id).toBe(LAYER_IDS.bounds)
    expect(unclusteredPointLayer.id).toBe(LAYER_IDS.unclusteredPoint)
    expect(selectedPointLayer.id).toBe(LAYER_IDS.selectedPoint)
    expect(selectedAreaLayer.id).toBe(LAYER_IDS.selectedArea)
    expect(hoveredPointLayer.id).toBe(LAYER_IDS.hoveredPoint)
    expect(hoveredAreaLayer.id).toBe(LAYER_IDS.hoveredArea)
  })

  it('lists the clickable layers, and only those', () => {
    expect(INTERACTIVE_LAYER_IDS).toEqual([
      LAYER_IDS.cluster,
      LAYER_IDS.unclusteredPoint,
      LAYER_IDS.vaguePin,
      LAYER_IDS.vagueRing,
      LAYER_IDS.vagueDot,
    ])
  })
})

describe('the vague-place layers', () => {
  const ring = vagueRingLayer({}, 'light')
  const dot = vagueDotLayer({}, 'light')

  // A listing with no real place clusters like any other, so it can never show a ring while it
  // is counted in a bubble beside it.
  it('all three read the clustering source, and only an unclustered listing', () => {
    for (const layer of [vaguePinLayer, ring, dot]) {
      expect(layer.source).toBe('events')
      expect(layer.filter).toEqual([
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'vague'], true],
      ])
    }
    expect(unclusteredPointLayer.filter).toEqual([
      'all',
      ['!', ['has', 'point_count']],
      ['!', ['==', ['get', 'vague'], true]],
    ])
  })

  // Exactly one of the three draws at every zoom: a vague listing is never unmarked, and never
  // marked twice.
  it('hands pin to ring to dot at one zoom each, with no gap and no overlap', () => {
    expect(vaguePinLayer.minzoom).toBeUndefined()
    expect(vaguePinLayer.maxzoom).toBe(RING_ZOOM)
    expect(ring.minzoom).toBe(RING_ZOOM)
    expect(ring.maxzoom).toBe(RING_MAX_ZOOM)
    expect(dot.minzoom).toBe(RING_MAX_ZOOM)
    expect(dot.maxzoom).toBeUndefined()
  })

  // The narrowest map the full interface renders in is 360px, so one level past this the ring's
  // outline is off every screen and only its tint would be left.
  it('drops the ring where it grows as wide as the narrowest map, around zoom 11.7', () => {
    expect(RING_MAX_ZOOM).toBeCloseTo(11.7, 1)
    expect(RING_MAX_ZOOM).toBeGreaterThan(RING_ZOOM)
  })

  // The dot stands in for an area wider than the screen, so it is a marker rather than ground:
  // a fixed size at every zoom, where the ring's radius is an expression that doubles.
  it('draws the dot at a fixed size, in the ring colours', () => {
    expect(paintOf(dot)['circle-radius']).toBe(8)
    expect(paintOf(dot)['circle-color']).toBe(paintOf(ring)['circle-color'])
  })

  // The pin is 34px wide at icon-size 0.85: the ring takes over once its radius is that wide.
  it('switches where the ring is as wide as the pin, around zoom 9 for a 3km radius', () => {
    expect(VAGUE_RADIUS_KM).toBe(3)
    expect(RING_ZOOM).toBeCloseTo(9.06, 2)
  })

  it('draws the ring to scale, growing 2x per zoom and widening with latitude', () => {
    const radius = paintOf(ring)['circle-radius'] as unknown[]

    expect(radius.slice(0, 3)).toEqual(['interpolate', ['exponential', 2], ['zoom']])
    const [, , , z0, at0, z1, at1] = radius as [
      unknown,
      unknown,
      unknown,
      number,
      unknown[],
      number,
      unknown[],
    ]

    expect([z0, z1]).toEqual([0, 24])
    expect(at0[2]).toEqual(['get', 'cosLat'])
    expect((at1[1] as number) / (at0[1] as number)).toBeCloseTo(2 ** 24)
  })
})

describe('clusterLayer', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`counts in white on the stock bubble in ${mode}`, () => {
      expect(paintOf(clusterLayer({}, mode))['text-color']).toBe('#FFFFFF')
      expect(paintOf(clusterLayer({ primary: '#000000' }, mode))['text-color']).toBe('#FFFFFF')
    })
  }

  it('takes the on-color of the bubble it sits on', () => {
    // The bubble is `primary` step 9, so the count follows that ramp: white on
    // the dark maroon solid, black on the lighter one dark mode floors it to.
    expect(paintOf(clusterLayer({ primary: MAROON }, 'light'))['text-color']).toBe('#ffffff')
    expect(paintOf(clusterLayer({ primary: MAROON }, 'dark'))['text-color']).toBe('#000000')
  })

  it('ignores the other roles', () => {
    const layer = clusterLayer({ contrast: MAROON, secondary: MAROON }, 'light')

    expect(paintOf(layer)['text-color']).toBe('#FFFFFF')
  })

  // ⚠ This layer and `markerColors` derive the count and the disc it sits on
  // SEPARATELY, and they agree only because both read `primary` step 9. So the
  // invariant is asserted as contrast against the fill actually produced, not as
  // the two expressions matching — a change to either side that broke the
  // agreement would still satisfy a value comparison.
  //
  // The disc is opaque (`markers.ts`), so this is the figure a reader sees.
  it('keeps the count legible on the bubble markerColors fills', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { fill } = markerColors({ primary: MAROON }, mode)[MARKER_IDS.cluster]
      const label = paintOf(clusterLayer({ primary: MAROON }, mode))['text-color'] as string

      expect(colord(fill).contrast(label)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// The stock pair: a white count on the stock green disc. 12px bold is normal text — large
// text starts at 14pt (18.7px) bold — so the bar is 4.5:1, not 3:1. The old Studio green
// measured 2.4:1, and the first warm green 3.3:1.
it('keeps the stock count readable on the stock green disc', () => {
  expect(clusterLayer({}, 'light').layout).toMatchObject({ 'text-size': 12 })

  for (const mode of ['light', 'dark'] as const) {
    const { fill } = markerColors({}, mode)[MARKER_IDS.cluster]
    const label = paintOf(clusterLayer({}, mode))['text-color'] as string

    expect(colord(fill).contrast(label)).toBeGreaterThanOrEqual(4.5)
  }
})

describe('boundsLayer', () => {
  // This layer renders only behind `DEBUG_BOUNDARY` in `Map.tsx`, so nothing on
  // screen says whether its color is right.
  it('draws the stock mid-grey when primary has no usable seed', () => {
    expect(paintOf(boundsLayer({}, 'light'))['line-color']).toBe('#888')
    expect(paintOf(boundsLayer({}, 'dark'))['line-color']).toBe('#888')
    expect(paintOf(boundsLayer({ primary: '#000000' }, 'light'))['line-color']).toBe('#888')
  })

  it('draws the brand solid otherwise, per mode', () => {
    expect(paintOf(boundsLayer({ primary: MAROON }, 'light'))['line-color']).toBe('#521430')
    expect(paintOf(boundsLayer({ primary: MAROON }, 'dark'))['line-color']).toBe('#d65c93')
  })

  it('keeps its width', () => {
    expect(paintOf(boundsLayer({}, 'light'))['line-width']).toBe(4)
  })
})
