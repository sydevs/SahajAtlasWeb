import type { LayerProps } from 'react-map-gl'

type Props = {
  id: string
} & LayerProps

export const clusterLayer: Props = {
  id: 'clusters',
  type: 'symbol',
  source: 'events',
  filter: ['has', 'point_count'],
  layout: {
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-image': 'cluster',
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': 12,
  },
  paint: {
    // White count sits on the opaque `cluster` sprite (not the basemap), so it
    // stays legible on both the light and dark map styles — no theming needed.
    'text-color': '#FFFFFF',
  },
}

export const unclusteredPointLayer: Props = {
  id: 'unclustered-point',
  type: 'symbol',
  source: 'events',
  filter: ['!', ['has', 'point_count']],
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 0.85,
    'icon-ignore-placement': true,
    'icon-image': 'point',
  },
}

export const selectedPointLayer: LayerProps = {
  id: 'selected-point',
  type: 'symbol',
  source: 'selection',
  //filter: ['has', 'point_count'],
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 0.85,
    'icon-ignore-placement': true,
    'icon-image': 'selected',
  },
}

export const selectedAreaLayer: LayerProps = {
  id: 'selected-area',
  type: 'symbol',
  source: 'selection',
  layout: {
    'icon-size': 1.25,
    'icon-ignore-placement': true,
    'icon-image': 'cluster-selected',
  },
}

// Card-hover highlight (issue #44). Reuses the `selected` / `cluster-selected`
// sprites — larger and slightly translucent so the hovered pin "pops" above the
// base points without a Mapbox style change (a dedicated hover sprite can land
// with #17). Fed by the `hover` source (not `selection`) and never added to
// `interactiveLayerIds`, so the highlight is purely visual.
export const hoveredPointLayer: LayerProps = {
  id: 'hovered-point',
  type: 'symbol',
  source: 'hover',
  layout: {
    'icon-anchor': 'bottom',
    'icon-size': 1,
    'icon-ignore-placement': true,
    'icon-image': 'selected',
  },
  paint: {
    'icon-opacity': 0.9,
  },
}

export const hoveredAreaLayer: LayerProps = {
  id: 'hovered-area',
  type: 'symbol',
  source: 'hover',
  layout: {
    'icon-size': 1.4,
    'icon-ignore-placement': true,
    'icon-image': 'cluster-selected',
  },
  paint: {
    'icon-opacity': 0.7,
  },
}

export const boundsLayer: LayerProps = {
  id: 'selected-bounds',
  type: 'line',
  source: 'bounds',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    // Debug-only layer (rendered behind DEBUG_BOUNDARY in Map.tsx); the neutral
    // mid-grey reads on both basemaps, so it needs no theme-aware variant.
    'line-color': '#888',
    'line-width': 4,
  },
}
