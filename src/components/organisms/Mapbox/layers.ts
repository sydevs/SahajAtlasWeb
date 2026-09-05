import type { LayerProps } from 'react-map-gl'

import { MARKER_IDS } from './markers'

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
    'icon-image': MARKER_IDS.cluster,
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
    'text-size': 12,
  },
  paint: {
    // This shows a white count on the cluster bubble, which is the same art
    // on both basemaps, so it needs no theming. The disc is slightly
    // translucent (see `markers.ts`), so a pale feature underneath can show
    // through and reduce contrast with it. This is inherited from the
    // Studio sprite this replaced. Make the inner disc fully opaque if the
    // count ever reads thin.
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
    'icon-image': MARKER_IDS.point,
  },
}

export const selectedPointLayer: LayerProps = {
  id: 'selected-point',
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
  id: 'selected-area',
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
// "pops" above the base points without a dedicated hover image (one can
// land with #17). It is fed by the `hover` source, not `selection`, and it
// is never added to `interactiveLayerIds`, so the highlight stays purely
// visual.
export const hoveredPointLayer: LayerProps = {
  id: 'hovered-point',
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
  id: 'hovered-area',
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

export const boundsLayer: LayerProps = {
  id: 'selected-bounds',
  type: 'line',
  source: 'bounds',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    // This is a debug-only layer, rendered behind DEBUG_BOUNDARY in Map.tsx.
    // The neutral mid-grey reads on both basemaps, so it needs no
    // theme-aware variant.
    'line-color': '#888',
    'line-width': 4,
  },
}
