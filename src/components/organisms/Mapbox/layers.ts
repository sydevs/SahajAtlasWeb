import type { LayerProps } from 'react-map-gl/mapbox'

import { MARKER_IDS, MARKER_OUTLINE, markerColors, PIN_SIZE, PIN_WIDTH } from './markers'

import {
  buildScale,
  readableOn,
  scaleHex,
  seedOrDefault,
  SOLID_STEP,
  type PaletteRoles,
  type ThemeMode,
} from '@/config/theme/palette'
import { ringRadiusPx, ringZoom } from '@/lib/camera'

// The narrowest map the interface is drawn at: a phone's inline strip, or a small frame.
const NARROWEST_MAP_PX = 360

type Props = {
  id: string
} & LayerProps

/**
 * A symbol layer: what the selection and hover highlights are. `PointSource` bounds them by zoom,
 * and `LayerProps` alone also admits a `slot` layer, which takes no zoom range.
 */
export type SymbolLayerProps = Extract<LayerProps, { type: 'symbol' }>

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
  vaguePin: 'vague-pin',
  vagueRing: 'vague-ring',
  vagueDot: 'vague-dot',
  bounds: 'selected-bounds',
} as const

// The layers that answer clicks and hover, as one stable array: `<ReactMapGL>`
// takes this by identity, and a fresh literal per render would reflow the map.
// The hover highlights are deliberately absent — they stay purely visual.
export const INTERACTIVE_LAYER_IDS = [
  LAYER_IDS.cluster,
  LAYER_IDS.unclusteredPoint,
  LAYER_IDS.vaguePin,
  LAYER_IDS.vagueRing,
  LAYER_IDS.vagueDot,
]

/**
 * The cluster bubble and its count.
 *
 * A factory, because the count's color follows the bubble's fill: black or
 * white, whichever reads better on the disc `markerColors` paints. Memoise the
 * result — `docs/rules/mapbox.md` forbids a fresh paint object per render.
 */
export const clusterLayer = (palette: PaletteRoles): Props => ({
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
    'text-color': readableOn(markerColors(palette)[MARKER_IDS.cluster].fill),
  },
})

// No `icon-size`: the pin art is rasterised at the size it shows (`markers.ts`).
const pinLayout = {
  'icon-anchor': 'bottom',
  'icon-ignore-placement': true,
  'icon-image': MARKER_IDS.point,
} as const

const unclustered = ['!', ['has', 'point_count']]
const isVague = ['==', ['get', 'vague'], true]

export const unclusteredPointLayer: Props = {
  id: LAYER_IDS.unclusteredPoint,
  type: 'symbol',
  source: 'events',
  filter: ['all', unclustered, ['!', isVague]],
  layout: pinLayout,
}

/** How far around its stored point a listing with no real place might be (#15). */
export const VAGUE_RADIUS_KM = 3

/**
 * Where a listing with no real place stops being a pin and becomes its ring: the zoom at which the
 * ring's radius is as wide as the pin, at a mid latitude. Below it the ring would be a speck, so
 * the listing is a pin like any other; above it a pin would claim a spot the ring says is not
 * known. ⚠ A latitude, not each listing's: a layer's zoom bounds are one number, so the ring
 * appears a little smaller near the equator and a little larger near the poles.
 */
export const RING_ZOOM = ringZoom(VAGUE_RADIUS_KM, PIN_WIDTH * PIN_SIZE, 45)

/**
 * Where the ring stops being a shape and becomes a wash: the zoom at which it is as wide as the
 * narrowest map the interface renders in, so one more level puts its outline off every screen.
 * The radius doubles per level, so without a bound the stroke leaves the viewport and an
 * unselected listing is a flat tint with no marker in it — and a tint that takes every click and
 * hover across the map, stacked with its neighbours'. Above it the ring hands over to a dot.
 */
export const RING_MAX_ZOOM = ringZoom(VAGUE_RADIUS_KM, NARROWEST_MAP_PX / 2, 45)

/**
 * A listing with no real place, zoomed out: the ordinary pin. It reads the clustering source, so it
 * joins a cluster exactly as any other listing does.
 */
export const vaguePinLayer: Props = {
  id: LAYER_IDS.vaguePin,
  type: 'symbol',
  source: 'events',
  maxzoom: RING_ZOOM,
  filter: ['all', unclustered, isVague],
  layout: pinLayout,
}

/**
 * The same listing zoomed in: a soft circle of `VAGUE_RADIUS_KM`, to scale, between
 * `RING_ZOOM` and `RING_MAX_ZOOM`. Also read off the clustering source, so a listing still inside a
 * cluster draws no ring. The radius doubles with each zoom, which `exponential` 2 interpolates
 * exactly, and widens by `1 / cos(latitude)` as Mercator does — `cosLat` is precomputed per
 * feature, since an expression cannot read a point's latitude.
 * A factory, memoised like `clusterLayer`, because the colour follows the brand.
 */
export const vagueRingLayer = (palette: PaletteRoles, mode: ThemeMode): Props => {
  const color = markerColors(palette)[MARKER_IDS.point].fill
  const atEquator = (zoom: number) => ringRadiusPx(VAGUE_RADIUS_KM, zoom, 0)

  return {
    id: LAYER_IDS.vagueRing,
    type: 'circle',
    source: 'events',
    minzoom: RING_ZOOM,
    maxzoom: RING_MAX_ZOOM,
    filter: ['all', unclustered, isVague],
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
      // The style's own fixed edge, like the pins and bubbles: the ring's fill is
      // the brand colour, and only its edge changes between the two basemaps.
      'circle-stroke-color': MARKER_OUTLINE[mode],
      'circle-stroke-opacity': 0.6,
      'circle-stroke-width': 1.5,
      'circle-pitch-alignment': 'map',
      'circle-pitch-scale': 'map',
    },
  }
}

/**
 * The same listing zoomed past the ring: the ring's centre, at a fixed size. It keeps the
 * listing on the map, clickable and hoverable, at zooms where the area it stands for is wider
 * than the screen. ⚠ It marks the stored point, which is the town's centre and not the venue —
 * what stops that reading as a doorstep is the panel, which shows only the town and offers no
 * directions. Drawn in the ring's own colours at a fraction of its weight, so it reads as the
 * ring rather than as a second kind of pin. A factory, memoised like `clusterLayer`.
 */
export const vagueDotLayer = (palette: PaletteRoles, mode: ThemeMode): Props => {
  const color = markerColors(palette)[MARKER_IDS.point].fill

  return {
    id: LAYER_IDS.vagueDot,
    type: 'circle',
    source: 'events',
    minzoom: RING_MAX_ZOOM,
    filter: ['all', unclustered, isVague],
    paint: {
      'circle-radius': 8,
      'circle-color': color,
      'circle-opacity': 0.3,
      'circle-stroke-color': MARKER_OUTLINE[mode],
      'circle-stroke-opacity': 0.8,
      'circle-stroke-width': 2,
    },
  }
}

export const selectedPointLayer: SymbolLayerProps = {
  id: LAYER_IDS.selectedPoint,
  type: 'symbol',
  source: 'selection',
  layout: {
    'icon-anchor': 'bottom',
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.pointSelected,
  },
}

export const selectedAreaLayer: SymbolLayerProps = {
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
export const hoveredPointLayer: SymbolLayerProps = {
  id: LAYER_IDS.hoveredPoint,
  type: 'symbol',
  source: 'hover',
  layout: {
    'icon-anchor': 'bottom',
    // The art's full 34px width: the hovered pin pops above the others.
    'icon-size': 1 / PIN_SIZE,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.pointSelected,
  },
  paint: {
    'icon-opacity': 0.9,
  },
}

export const hoveredAreaLayer: SymbolLayerProps = {
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
    // lightness in light mode and floors it in dark.
    'line-color': scaleHex(buildScale(seedOrDefault('primary', palette.primary), mode), SOLID_STEP),
    'line-width': 4,
  },
})
