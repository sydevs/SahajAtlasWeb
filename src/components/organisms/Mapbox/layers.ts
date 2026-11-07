import type { LayerProps } from 'react-map-gl'

import { MARKER_IDS } from './markers'

import {
  onHex,
  SOLID_STEP,
  stepHex,
  type PaletteRoles,
  type ThemeMode,
} from '@/config/theme/palette'

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
  approximateDot: 'approximate-dot',
  approximateFill: 'approximate-fill',
  approximateOutline: 'approximate-outline',
  bounds: 'selected-bounds',
} as const

// The layers that answer clicks and hover, as one stable array: `<ReactMapGL>`
// takes this by identity, and a fresh literal per render would reflow the map.
// The hover highlights are deliberately absent — they stay purely visual.
export const INTERACTIVE_LAYER_IDS = [
  LAYER_IDS.cluster,
  LAYER_IDS.unclusteredPoint,
  LAYER_IDS.approximateDot,
  LAYER_IDS.approximateFill,
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

export const unclusteredPointLayer: Props = {
  id: LAYER_IDS.unclusteredPoint,
  type: 'symbol',
  source: 'events',
  filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'approximate'], true]],
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 0.85,
    'icon-ignore-placement': true,
    'icon-image': MARKER_IDS.point,
  },
}

/**
 * A class whose host gave no real place: a soft circle in place of a pin, since a pin would claim
 * an exact spot. The area itself is drawn to scale (`areaAround`), so it reads as a neighbourhood
 * when zoomed in. Zoomed out it shrinks to nothing, so this dot keeps the class visible and
 * clickable. Factories, memoised like `clusterLayer`, because the colours follow the brand.
 *
 * ⚠ The dot reads `approximate-areas`, NOT the clustering `events` source. Zoomed out is exactly
 * where clustering applies (`clusterMaxZoom` 14), so a `!has point_count` filter there hides the
 * dot at every zoom it exists for, and leaves a ring with nothing to click at its centre.
 */
const approximateColor = (palette: PaletteRoles, mode: ThemeMode) =>
  stepHex(palette.primary, mode, SOLID_STEP) ?? '#21C1A2'

export const approximateDotLayer = (palette: PaletteRoles, mode: ThemeMode): Props => ({
  id: LAYER_IDS.approximateDot,
  type: 'circle',
  source: 'approximate-areas',
  filter: ['==', ['geometry-type'], 'Point'],
  paint: {
    'circle-radius': 9,
    'circle-color': approximateColor(palette, mode),
    'circle-opacity': 0.3,
    'circle-stroke-color': approximateColor(palette, mode),
    'circle-stroke-width': 2,
  },
})

export const approximateFillLayer = (palette: PaletteRoles, mode: ThemeMode): LayerProps => ({
  id: LAYER_IDS.approximateFill,
  type: 'fill',
  source: 'approximate-areas',
  paint: {
    'fill-color': approximateColor(palette, mode),
    'fill-opacity': 0.14,
  },
})

export const approximateOutlineLayer = (palette: PaletteRoles, mode: ThemeMode): LayerProps => ({
  id: LAYER_IDS.approximateOutline,
  type: 'line',
  source: 'approximate-areas',
  paint: {
    'line-color': approximateColor(palette, mode),
    'line-opacity': 0.6,
    'line-width': 1.5,
  },
})

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
