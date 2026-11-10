import type { LayerProps } from 'react-map-gl'

import { MARKER_IDS, PIN_WIDTH } from './markers'

import {
  onHex,
  SOLID_STEP,
  stepHex,
  type PaletteRoles,
  type ThemeMode,
} from '@/config/theme/palette'
import { ringRadiusPx, ringZoom } from '@/lib/camera'

type Props = {
  id: string
} & LayerProps

/**
 * Every layer id, in one place.
 *
 * Two of the layers below are factories now, so `Map.tsx` cannot read an id
 * off a layer object without building one. These ids are also a contract with
 * anything that inspects the map — a click handler matches on them, and
 * `INTERACTIVE_LAYER_IDS` lists them — so they stay stable while the paints
 * follow the palette.
 */
export const LAYER_IDS = {
  cluster: 'clusters',
  unclusteredPoint: 'unclustered-point',
  selectedPoint: 'selected-point',
  selectedArea: 'selected-area',
  hoveredPoint: 'hovered-point',
  hoveredArea: 'hovered-area',
  approximatePin: 'approximate-pin',
  approximateRing: 'approximate-ring',
  bounds: 'selected-bounds',
} as const

// The layers that answer clicks and hover, as one stable array: `<ReactMapGL>`
// takes this by identity, and a fresh literal per render would reflow the map.
// The hover highlights are deliberately absent — they stay purely visual.
export const INTERACTIVE_LAYER_IDS = [
  LAYER_IDS.cluster,
  LAYER_IDS.unclusteredPoint,
  LAYER_IDS.approximatePin,
  LAYER_IDS.approximateRing,
]

/**
 * The cluster bubble and its count.
 *
 * A factory, because the count's color follows the bubble's fill: the bubble
 * is the `primary` solid (`markers.ts`), so the readable on-color of that same
 * ramp is what stays legible on it. Memoise the result — `docs/rules/mapbox.md`
 * forbids a fresh paint object per render.
 */
export const clusterLayer = (palette: PaletteRoles, mode: ThemeMode): Props => ({
  id: LAYER_IDS.cluster,
  type: 'symbol',
  source: 'events',
  filter: ['has', 'point_count'],
  layout: {
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.cluster,
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': 12,
  },
  paint: {
    // White on the stock teal bubble, which is the same art on both basemaps.
    // The disc is slightly translucent (see `markers.ts`), so a pale feature
    // underneath can show through and reduce contrast with it. This is
    // inherited from the Studio sprite this replaced. Make the inner disc
    // fully opaque if the count ever reads thin.
    'text-color': onHex(palette.primary, mode) ?? '#FFFFFF',
  },
})

const PIN_SIZE = 0.85

const pinLayout = {
  'icon-anchor': 'bottom',
  'icon-size': PIN_SIZE,
  'icon-ignore-placement': true,
  'icon-image': MARKER_IDS.point,
} as const

const unclustered = ['!', ['has', 'point_count']]
const isApproximate = ['==', ['get', 'approximate'], true]

export const unclusteredPointLayer: Props = {
  id: LAYER_IDS.unclusteredPoint,
  type: 'symbol',
  source: 'events',
  filter: ['all', unclustered, ['!', isApproximate]],
  layout: pinLayout,
}

/** How far around its stored point a listing with no real place might be (#15). */
export const APPROXIMATE_RADIUS_KM = 3

/**
 * Where a listing with no real place stops being a pin and becomes its ring: the zoom at which the
 * ring's radius is as wide as the pin, at a mid latitude. Below it the ring would be a speck, so
 * the listing is a pin like any other; above it a pin would claim a spot the ring says is not
 * known. ⚠ A latitude, not each listing's: a layer's zoom bounds are one number, so the ring
 * appears a little smaller near the equator and a little larger near the poles.
 */
export const RING_ZOOM = ringZoom(APPROXIMATE_RADIUS_KM, PIN_WIDTH * PIN_SIZE, 45)

/**
 * A listing with no real place, zoomed out: the ordinary pin. It reads the clustering source, so it
 * joins a cluster exactly as any other listing does.
 */
export const approximatePinLayer: Props = {
  id: LAYER_IDS.approximatePin,
  type: 'symbol',
  source: 'events',
  maxzoom: RING_ZOOM,
  filter: ['all', unclustered, isApproximate],
  layout: pinLayout,
}

/**
 * The same listing zoomed in: a soft circle of `APPROXIMATE_RADIUS_KM`, to scale. Also read off the
 * clustering source, so a listing still inside a cluster draws no ring. The radius doubles with each
 * zoom, which `exponential` 2 interpolates exactly, and widens by `1 / cos(latitude)` as Mercator
 * does — `cosLat` is precomputed per feature, since an expression cannot read a point's latitude.
 * A factory, memoised like `clusterLayer`, because the colour follows the brand.
 */
export const approximateRingLayer = (palette: PaletteRoles, mode: ThemeMode): Props => {
  const color = stepHex(palette.primary, mode, SOLID_STEP) ?? '#21C1A2'
  const atEquator = (zoom: number) => ringRadiusPx(APPROXIMATE_RADIUS_KM, zoom, 0)

  return {
    id: LAYER_IDS.approximateRing,
    type: 'circle',
    source: 'events',
    minzoom: RING_ZOOM,
    filter: ['all', unclustered, isApproximate],
    paint: {
      'circle-radius': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        0,
        ['/', atEquator(0), ['get', 'cosLat']],
        24,
        ['/', atEquator(24), ['get', 'cosLat']],
      ],
      'circle-color': color,
      'circle-opacity': 0.14,
      'circle-stroke-color': color,
      'circle-stroke-opacity': 0.6,
      'circle-stroke-width': 1.5,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map',
    },
  }
}

export const selectedPointLayer: LayerProps = {
  id: LAYER_IDS.selectedPoint,
  type: 'symbol',
  source: 'selection',
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 0.85,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.pointSelected,
  },
}

export const selectedAreaLayer: LayerProps = {
  id: LAYER_IDS.selectedArea,
  type: 'symbol',
  source: 'selection',
  layout: {
    'icon-size': 1.25,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.clusterSelected,
  },
}

// This is the card-hover highlight (issue #44). It reuses the selected
// marker images — larger and slightly translucent, so the hovered pin
// "pops" above the base points without a dedicated hover image. #17 brought
// the markers under the brand palette and added none: reusing the selected
// images is what makes the highlight follow a tenant's colors for free.
// It is fed by the `hover` source, not `selection`, and it
// is never added to `interactiveLayerIds`, so the highlight stays purely
// visual.
export const hoveredPointLayer: LayerProps = {
  id: LAYER_IDS.hoveredPoint,
  type: 'symbol',
  source: 'hover',
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 1,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.pointSelected,
  },
  paint: {
    'icon-opacity': 0.9,
  },
}

export const hoveredAreaLayer: LayerProps = {
  id: LAYER_IDS.hoveredArea,
  type: 'symbol',
  source: 'hover',
  layout: {
    'icon-size': 1.4,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.clusterSelected,
  },
  paint: {
    'icon-opacity': 0.7,
  },
}

/**
 * The selected region's outline.
 *
 * A factory, like `clusterLayer`, and memoised the same way. This is a
 * debug-only layer, rendered behind `DEBUG_BOUNDARY` in `Map.tsx`, so nothing
 * on screen shows whether its color is right — the node lane asserts it
 * instead.
 */
export const boundsLayer = (palette: PaletteRoles, mode: ThemeMode): LayerProps => ({
  id: LAYER_IDS.bounds,
  type: 'line',
  source: 'bounds',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    // The brand solid stays visible on both basemaps: step 9 caps its
    // lightness in light mode and floors it in dark. The neutral mid-grey it
    // falls back to needs no theme-aware variant for the same reason.
    'line-color': stepHex(palette.primary, mode, SOLID_STEP) ?? '#888',
    'line-width': 4,
  },
})
