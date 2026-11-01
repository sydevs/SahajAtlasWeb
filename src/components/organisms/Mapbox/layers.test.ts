import type { LayerProps } from 'react-map-gl'

import { describe, it, expect } from 'vitest'

import {
  boundsLayer,
  clusterLayer,
  hoveredAreaLayer,
  hoveredPointLayer,
  INTERACTIVE_LAYER_IDS,
  LAYER_IDS,
  selectedAreaLayer,
  selectedPointLayer,
  unclusteredPointLayer,
} from './layers'

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
    expect(INTERACTIVE_LAYER_IDS).toEqual([LAYER_IDS.cluster, LAYER_IDS.unclusteredPoint])
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
