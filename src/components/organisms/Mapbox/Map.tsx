import type { FeatureCollection, Geometry } from 'geojson'
import type { Geojson } from '@/types'

import { useCallback, useMemo } from 'react'
import ReactMapGL, {
  GeoJSONSource,
  GeolocateControl,
  Layer,
  LayerProps,
  MapMouseEvent,
  Source,
} from 'react-map-gl'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import {
  clusterLayer,
  selectedPointLayer,
  unclusteredPointLayer,
  selectedAreaLayer,
  hoveredPointLayer,
  hoveredAreaLayer,
  boundsLayer,
} from './layers'

import { useViewState, type MapPoint } from '@/config/store'
import { useEventFilters } from '@/hooks/use-filters'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { hasActiveFilters, matchesFilters, safePath, todayISO } from '@/lib/shape'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import { useMapbox } from '@/hooks/use-mapbox'

const MAP_STYLES = {
  light: 'mapbox://styles/sydevadmin/ck7g6nag70rn11io09f45odkq',
  dark: 'mapbox://styles/sydevadmin/cl4nw934f001j14l8jnof3a7w',
}

const MAP_WORLDVIEWS: Record<string, string> = {
  zh: 'CN', // Chinese
  jp: 'JP', // Japanese
  hi: 'IN', // Hindi
  bn: 'IN', // Bengali
  pa: 'IN', // Punjabi
  gu: 'IN', // Gujarati
  kn: 'IN', // Kannada
  kok: 'IN', // Konkani
  ml: 'IN', // Malayalam
  mr: 'IN', // Marathi
  sa: 'IN', // Sanskrit
  ta: 'IN', // Tamil
  te: 'IN', // Telugu
  default: 'US', // Default
}

// Mapbox renders geometry and injects its own cluster properties; the click handler
// needs only `id` + `webPath`. Strip every other feature property before handing the
// collection to the vector source, so the map holds a lean geometry source — the
// agnostic feed's card fields (address/schedule/languages/region) never reach Mapbox.
// Confirms the spike finding: map-source leanness is a client-side trim, not a reason
// for a separate lean feed query.
const toMapSource = (features: Geojson['features']): FeatureCollection<Geometry | null> => ({
  type: 'FeatureCollection',
  features: features.map((feature) => ({
    type: 'Feature',
    geometry: feature.geometry,
    properties: { id: feature.properties.id, webPath: feature.properties.webPath ?? null },
  })),
})

const DEBUG_BOUNDARY = false
const DEBUG_PADDING = false

// A single emphasized point — the committed `selection` or the transient card
// `hover` — as its own GeoJSON source, so the sprite shows even when the base pin
// is inside a cluster. `approximate` picks the softer area sprite over the pin.
function PointSource({
  id,
  point,
  pointLayer,
  areaLayer,
}: {
  id: string
  point: MapPoint
  pointLayer: LayerProps
  areaLayer: LayerProps
}) {
  return (
    <Source
      data={{
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
          },
        ],
      }}
      id={id}
      type="geojson"
    >
      <Layer {...(point.approximate ? areaLayer : pointLayer)} />
    </Source>
  )
}

export function Mapbox() {
  let navigate = useNavigate()
  const { mapbox, padding, moveMap } = useMapbox()
  const { zoom, latitude, longitude, setViewState, selection, hover, boundary } = useViewState(
    useShallow((s) => ({
      zoom: s.zoom,
      latitude: s.latitude,
      longitude: s.longitude,
      selection: s.selection,
      hover: s.hover,
      boundary: s.boundary,
      setViewState: s.setViewState,
    })),
  )
  const { locale, languageCode } = useLocale()
  const { theme } = useTheme()

  // The active filters (stable identity — this is the hot render path). Applied to
  // the feed below so the pins + cluster counts match the list.
  const filters = useEventFilters()

  const { data } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // Filter the feed before it feeds the clustering source, so cluster counts
  // reflect the filters (a layer-level `filter` would leave stale counts), then trim
  // to a geometry-only source. Recomputes only when the feed or filters change — not
  // on pan/zoom — so the Mapbox source identity stays stable across camera moves.
  const filtered = useMemo(() => {
    if (!data) return undefined

    const today = todayISO()
    const features = hasActiveFilters(filters)
      ? data.features.filter((f) => matchesFilters(f.properties, filters, today))
      : data.features

    return toMapSource(features)
  }, [data, filters])

  const selectFeature = useCallback(
    (evt: MapMouseEvent) => {
      if (!evt.features || !evt.features.length || !mapbox) return
      const feature = evt.features[0]

      if (feature.layer?.id === clusterLayer.id) {
        const source = mapbox.getSource('events') as GeoJSONSource

        source.getClusterExpansionZoom(feature.properties?.cluster_id, (err, zoom) => {
          if (err || !mapbox) return console.error(err)

          moveMap({
            // @ts-ignore
            center: feature.geometry.coordinates,
            zoom: (zoom || mapbox.getZoom()) + 1,
            duration: 500,
          })
        })
      } else if (feature.layer?.id === unclusteredPointLayer.id) {
        navigate(safePath(feature.properties?.webPath) ?? `/${feature.properties?.id}`)
      }
    },
    [navigate, mapbox, zoom, latitude, longitude],
  )

  const hoverOnFeature = useCallback(
    (evt: MapMouseEvent) => {
      if (!mapbox) return

      // This is in order to render a clickable cursor on hover
      mapbox.getCanvas().style.cursor = evt.features?.length ? 'pointer' : ''
    },
    [mapbox],
  )

  // Map padding (keeping the drawer's footprint out of the camera) is owned by the
  // MapController now — set from the known drawer width per breakpoint, not by
  // DOM-measuring the panel or listening to window scroll/resize (react-map-gl
  // resizes its own container). See hooks/use-map-controller.tsx.

  return (
    <ReactMapGL
      reuseMaps
      attributionControl={false}
      // Symbols (pins, clusters, the selection + hover highlights) appear
      // instantly instead of Mapbox's default ~300ms icon fade-in — the card-hover
      // highlight must track the pointer immediately. fadeDuration is a global map
      // option (no per-layer control), so this also removes the fade on the base
      // pins/clusters and the selection pin.
      fadeDuration={0}
      id="mapbox"
      interactiveLayerIds={[clusterLayer.id, unclusteredPointLayer.id]}
      // @ts-ignore - Language is a valid property
      language={locale} // TOOD: Make sure this switches when locale changes
      mapStyle={MAP_STYLES[theme]}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
      style={{ width: '100%', height: '100%' }}
      worldview={MAP_WORLDVIEWS[languageCode] || MAP_WORLDVIEWS.default}
      onClick={selectFeature}
      onMouseMove={hoverOnFeature}
      //{...viewState}
      onMoveEnd={(evt) => setViewState(evt.viewState)}
    >
      {DEBUG_PADDING && (
        <div
          className="pointer-events-none absolute border-4 border-dashed border-danger-9"
          style={padding}
        />
      )}
      {filtered && (
        <Source
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
          data={filtered}
          id="events"
          type="geojson"
        >
          <Layer {...clusterLayer} />
          <Layer {...unclusteredPointLayer} />
        </Source>
      )}
      {DEBUG_BOUNDARY && boundary && (
        <Source data={boundary} id="bounds" type="geojson">
          <Layer {...boundsLayer} />
        </Source>
      )}
      {selection && (
        <PointSource
          areaLayer={selectedAreaLayer}
          id="selection"
          point={selection}
          pointLayer={selectedPointLayer}
        />
      )}
      {hover && (
        <PointSource
          areaLayer={hoveredAreaLayer}
          id="hover"
          point={hover}
          pointLayer={hoveredPointLayer}
        />
      )}
      <GeolocateControl />
    </ReactMapGL>
  )
}
