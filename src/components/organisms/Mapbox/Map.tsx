import { useCallback, useEffect } from 'react'
import ReactMapGL, {
  GeoJSONSource,
  GeolocateControl,
  Layer,
  MapMouseEvent,
  PaddingOptions,
  Source,
} from 'react-map-gl'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import {
  clusterLayer,
  selectedPointLayer,
  unclusteredPointLayer,
  selectedAreaLayer,
  boundsLayer,
} from './layers'

import { useViewState } from '@/config/store'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { safePath } from '@/lib/shape'
import { useBreakpoint } from '@/config/responsive'
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

const DEBUG_BOUNDARY = false
const DEBUG_PADDING = false

export function Mapbox() {
  let navigate = useNavigate()
  const { mapbox, padding, updatePadding, moveMap } = useMapbox()
  const { zoom, latitude, longitude, setViewState, selection, boundary } = useViewState(
    useShallow((s) => ({
      zoom: s.zoom,
      latitude: s.latitude,
      longitude: s.longitude,
      selection: s.selection,
      boundary: s.boundary,
      setViewState: s.setViewState,
    })),
  )
  const location = useLocation()
  const { isMd } = useBreakpoint('md')
  const { locale, languageCode } = useLocale()
  const { theme } = useTheme()

  const { data } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

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

  useEffect(() => {
    if (!mapbox) return

    const resetPadding = (evt?: Event) => {
      const padding = updatePadding()

      if (evt?.type || mapbox.isEasing()) {
        mapbox.setPadding(padding as PaddingOptions)
      } else {
        moveMap({ padding })
      }
    }

    resetPadding()
    window.addEventListener('resize', resetPadding)
    window.addEventListener('orientationchange', resetPadding)
    window.addEventListener('scroll', resetPadding)

    return () => {
      window.removeEventListener('resize', resetPadding)
      window.removeEventListener('orientationchange', resetPadding)
      window.removeEventListener('scroll', resetPadding)
    }
  }, [mapbox, isMd, location])

  return (
    <ReactMapGL
      reuseMaps
      attributionControl={false}
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
          className="absolute border-3 border-dashed border-red-700 pointer-events-none"
          style={padding}
        />
      )}
      {data && (
        <Source
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
          data={data}
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
        <Source
          data={{
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [selection.longitude, selection.latitude],
                },
              },
            ],
          }}
          id="selection"
          type="geojson"
        >
          <Layer {...(selection.approximate ? selectedAreaLayer : selectedPointLayer)} />
        </Source>
      )}
      <GeolocateControl />
    </ReactMapGL>
  )
}
