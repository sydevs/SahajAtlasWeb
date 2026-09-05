import type { FeatureCollection, Geometry } from 'geojson'
import type { Geojson } from '@/types'
import type { DisplayableEvent } from '@/hooks/use-event-display'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMapGL, {
  GeoJSONSource,
  GeolocateControl,
  Layer,
  LayerProps,
  MapMouseEvent,
  Popup,
  Source,
} from 'react-map-gl'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { CalendarDays } from 'lucide-react'

import {
  clusterLayer,
  selectedPointLayer,
  unclusteredPointLayer,
  selectedAreaLayer,
  hoveredPointLayer,
  hoveredAreaLayer,
  boundsLayer,
} from './layers'
import { registerMarkerImages } from './markers'

import { calendarLineParts, useEventDisplay } from '@/hooks/use-event-display'
import { useCameraSettled, useViewState, type MapPoint } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useGeolocateToSearch } from '@/hooks/use-geolocate'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
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

/**
 * This constant sets how long to wait after the style loads before it
 * reveals the map, even when nothing has framed it yet.
 *
 * The canvas stays behind a frosted overlay until the camera arrives
 * (`useCameraSettled`). This way, the boot-time world view never paints on a
 * deep link. Most routes frame promptly, but not all of them do. CalendarView
 * deliberately never touches the camera. So a `/calendar` deep link would
 * otherwise hide the map for the whole session.
 *
 * The coupling to the flag is a feature, not a leak. After the map shows the
 * world this long, the next camera move IS the honest transition, because
 * the visitor has now seen where it starts from.
 */
const REVEAL_TIMEOUT_MS = 1500

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

// Mapbox renders geometry and injects its own cluster properties. The click
// handler needs only `id` and `webPath`. This strips every other feature
// property before handing the collection to the vector source. So the map
// holds a lean geometry source. The agnostic feed's card fields — address,
// schedule, languages, region — never reach Mapbox. This confirms the spike
// finding: map-source leanness is a client-side trim, not a reason for a
// separate lean feed query.
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

// This renders a single emphasized point — the committed `selection` or the
// transient card `hover` — as its own GeoJSON source. This way, the sprite
// shows even when the base pin sits inside a cluster. `approximate` picks
// the softer area sprite over the pin sprite.
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

// This is the card shown inside the hover popover: a calendar glyph beside
// the event's timing, with the recurrence (for example, "Every Thursday")
// stacked above its start time, so the card stays narrow. It renders the
// SAME calendar parts that the list card's `composeCalendarLine` joins (via
// the shared `calendarLineParts` gate). Here they stack across two lines
// instead of joining with a `·`, so the two never drift apart (#72).
function EventPinCard({ event }: { event: DisplayableEvent }) {
  const { display, recurrenceLine, whenLine, eventStartTime } = useEventDisplay(event)
  const { primary, time } = calendarLineParts({
    recurrenceLine,
    whenLine,
    time: eventStartTime,
    hasNext: Boolean(display.next),
  })

  if (!primary) return null

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-background px-2.5 py-1.5 text-foreground shadow-md">
      <CalendarDays className="shrink-0 text-gray-11" size={16} />
      <div className="flex flex-col text-sm font-medium leading-tight">
        <span>{primary}</span>
        {time && <span className="text-xs font-normal text-gray-11">{time}</span>}
      </div>
    </div>
  )
}

// This is a non-interactive hover popover over an individual event pin. It
// shows that event's timing (recurrence stacked above start time) via
// EventPinCard. It carries no title, so the locale-agnostic feed event alone
// is enough — there is no titles sliver to join.
//
// This renders only for `unclustered-point` pins, never clusters, since one
// recurrence line is meaningless for a cluster of events. The caller
// re-joins the hovered pin's id to the full feed event. It mounts this once
// for the one hovered pin, because a hook cannot run per-feature in a loop.
// `pointer-events: none` (set on the popup in globals.css) keeps it from
// stealing hover from the pin beneath it, and from blocking tap-to-open.
// `focusAfterOpen={false}` stops it from grabbing focus.
function EventPinPopover({
  event,
  longitude,
  latitude,
}: {
  event: DisplayableEvent
  longitude: number
  latitude: number
}) {
  return (
    <Popup
      anchor="bottom"
      className="event-pin-popover"
      closeButton={false}
      closeOnClick={false}
      focusAfterOpen={false}
      latitude={latitude}
      longitude={longitude}
      offset={34}
    >
      <EventPinCard event={event} />
    </Popup>
  )
}

export function Mapbox() {
  let navigate = useAtlasNavigate()
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
  // `t` comes from `useLocale`. It already holds one for the default (`common`)
  // namespace. A second `useTranslation` here would double the i18next
  // subscription on the app's hottest render path.
  const { t, locale, languageCode } = useLocale()
  const { theme } = useTheme()

  // Mapbox's own control strings are otherwise English on every embed. The
  // GeolocateControl below is the only control this app renders, and its
  // whole accessible name comes from these two strings (issue #102).
  //
  // Two things to know before extending this. It is CONSTRUCTION-ONLY.
  // `locale` is absent from react-map-gl's reconciliation whitelist
  // (`settingNames` in its mapbox module), and mapbox-gl exposes no
  // `setLocale`. So, like the `language` prop below, this value is read
  // once. A mid-session language switch does not relabel the control. Also,
  // the keys belong to Mapbox, not to this app — the full set is
  // `defaultLocale` in mapbox-gl. Anything not overridden here silently
  // stays English.
  const mapLocale = useMemo(
    () => ({
      'GeolocateControl.FindMyLocation': t('map.find_my_location'),
      'GeolocateControl.LocationNotAvailable': t('map.location_not_available'),
    }),
    [t],
  )

  // These are the active filters (stable identity — this is the hot render
  // path). They apply to the feed below, so the pins and cluster counts
  // match the list.
  const filters = useEventFilters()
  // This is the region cut (self plus descendants), resolved from the
  // cache-once region tree. It stays undefined unless a region is selected,
  // so pan and zoom never rebuild it.
  const matchesRegion = useRegionMatcher(filters.region)

  const { data } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // "Find my location" opens the results centered on the visitor, rather
  // than just moving the camera. See the hook, and the `followUserLocation`
  // note on the control below. This component gives the hook the feed,
  // since the feed is already available here. The hook frames around the
  // nearest classes in it.
  const geolocateToSearch = useGeolocateToSearch(data)

  // This supplies the app's own pin and cluster images. `markers.ts` owns
  // the why and the theme-switch handling. There is one subscription per
  // map instance.
  useEffect(() => {
    if (mapbox) return registerMarkerImages(mapbox)
  }, [mapbox])

  // This holds the canvas until the camera has arrived somewhere, so a deep
  // link never paints the boot-time world view before jumping off it.
  // `MapCurtain` draws the frost over the top. This is the canvas's own half
  // of that mechanism. This fades, rather than toggling `visibility`, so the
  // arrival reads as the map resolving, not as a panel being swapped out.
  const settled = useCameraSettled((s) => s.settled)
  const reveal = useCameraSettled((s) => s.markSettled)
  const canvasStyle = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      // ⚠ **The canvas stays VISIBLE while the camera is still arriving.**
      // `MapCurtain` blurs it, rather than hiding it. An earlier version also
      // set `opacity: 0` here, alongside the frosting, and the two effects
      // canceled each other. `backdrop-filter` filters what is BEHIND the
      // element, so with a transparent canvas there was nothing to blur, and
      // the tint painted onto the page's own white. The result was a blank
      // screen where a soft map should be — the whole point of a frost is
      // that you can see something is there.
      //
      // This is also not interactive. A map nobody can read clearly should
      // not take clicks. The curtain above it is `pointer-events-none`, so
      // without this setting, a click would land on pins behind the blur
      // and open a class the visitor never chose.
      pointerEvents: settled ? undefined : ('none' as const),
    }),
    [settled],
  )

  // This is armed on style load and cleared on unmount, so a map torn down
  // inside the timeout cannot mark a camera that no longer exists as arrived.
  const armReveal = useCallback(() => {
    revealTimer.current = window.setTimeout(reveal, REVEAL_TIMEOUT_MS)
  }, [reveal])
  const revealTimer = useRef<number>()

  // The flag describes THIS map instance, so it dies with the instance. A
  // compact embed unmounts the whole interface when its dialog closes. A
  // stale `true` would then meet the next map at the world view, with
  // neither the curtain nor the arrival jump. See `forgetSettled`.
  useEffect(
    () => () => {
      window.clearTimeout(revealTimer.current)
      useCameraSettled.getState().forgetSettled()
    },
    [],
  )

  // This is the individual event pin (unclustered-point) currently under
  // the pointer, for the timing popover — never a cluster. It clears when
  // the pointer moves to empty map or leaves the canvas. This is local
  // state, not zustand: it is purely a map-view detail.
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // This filters the feed before it reaches the clustering source, so
  // cluster counts reflect the filters — a layer-level `filter` would leave
  // stale counts. Then it trims the result to a geometry-only source. This
  // recomputes only when the feed or filters change, not on pan or zoom, so
  // the Mapbox source identity stays stable across camera moves.
  const filtered = useMemo(() => {
    if (!data) return undefined

    const today = todayISO()
    const features = hasActiveFilters(filters)
      ? data.features.filter((f) => matchesFilters(f.properties, filters, today, matchesRegion))
      : data.features

    return toMapSource(features)
  }, [data, filters, matchesRegion])

  // This re-joins the hovered pin's id to the FULL feed event — the map
  // source is trimmed to id plus webPath. It reads the same `['geojson']`
  // cache the pins come from, and reads its coordinates for the popover
  // anchor. Only events with a Point geometry are pinnable, so a
  // geometry-less (online) event can never be hovered here.
  const hovered = useMemo(() => {
    if (hoveredId == null || !data) return undefined

    const feature = data.features.find((f) => f.properties.id === hoveredId)

    if (!feature || feature.geometry?.type !== 'Point') return undefined

    const [longitude, latitude] = feature.geometry.coordinates

    return { event: feature.properties, longitude, latitude }
  }, [hoveredId, data])

  const selectFeature = useCallback(
    (evt: MapMouseEvent) => {
      if (!evt.features || !evt.features.length || !mapbox) return
      const feature = evt.features[0]

      // This dismisses the transient hover popover on any pin or cluster
      // click — a desktop click-through, or tap-to-open on touch — so it
      // cannot linger over the pin.
      setHoveredId(null)

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

      const feature = evt.features?.[0]

      // This shows a clickable cursor over any interactive feature (a pin OR
      // a cluster).
      mapbox.getCanvas().style.cursor = feature ? 'pointer' : ''

      // This tracks the hovered INDIVIDUAL pin for the timing popover —
      // never a cluster, since one recurrence line is meaningless for a
      // cluster of events — and it is null over a cluster or empty map.
      // React skips a re-render when the id is unchanged (Object.is), so
      // this stays a no-op while the pointer sits on one pin.
      const pinId =
        feature?.layer?.id === unclusteredPointLayer.id ? Number(feature.properties?.id) : NaN

      setHoveredId(Number.isFinite(pinId) ? pinId : null)
    },
    [mapbox],
  )

  // Map padding — keeping the drawer's footprint out of the camera — is
  // owned by the MapController now. It is set from the known drawer width
  // per breakpoint, not by measuring the panel in the DOM or listening for
  // a window scroll or resize (react-map-gl resizes its own container). See
  // hooks/use-map-controller.tsx.

  return (
    <ReactMapGL
      reuseMaps
      attributionControl={false}
      // Symbols — pins, clusters, the selection and hover highlights —
      // appear instantly instead of Mapbox's default ~300ms icon fade-in.
      // The card-hover highlight must track the pointer immediately.
      // `fadeDuration` is a global map option, with no per-layer control, so
      // this also removes the fade on the base pins and clusters and on the
      // selection pin.
      fadeDuration={0}
      id="mapbox"
      interactiveLayerIds={[clusterLayer.id, unclusteredPointLayer.id]}
      // @ts-ignore - Language is a valid property
      language={locale} // TODO: Make sure this switches when locale changes
      locale={mapLocale}
      mapStyle={MAP_STYLES[theme]}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
      style={canvasStyle}
      worldview={MAP_WORLDVIEWS[languageCode] || MAP_WORLDVIEWS.default}
      onClick={selectFeature}
      // This is the backstop on the reveal. A route that never frames the
      // camera — CalendarView is the one that deliberately does not — must
      // not leave the map hidden for the whole session.
      onLoad={armReveal}
      onMouseMove={hoverOnFeature}
      // This dismisses the timing popover when the pointer leaves the
      // canvas. `mouseout` (react-map-gl `onMouseOut`) is the canvas-exit
      // event. `hoverOnFeature` above handles moving between pins or onto
      // empty map.
      onMouseOut={() => setHoveredId(null)}
      // This is DELIBERATELY UNCONTROLLED — no `viewState`, and no
      // `initialViewState` either.
      //
      // The camera is driven imperatively through `useMapbox` — the
      // MapController seam owns every move. `onMoveEnd` mirrors the result
      // back into the store, which is what `rememberCamera` and the search
      // ranking read. A controlled `viewState` would put React in the
      // middle of every frame of a fly.
      //
      // So nothing seeds the initial camera, and the map boots at [0, 0]
      // zoom 0. That is why the session's first framing jumps rather than
      // flies (`use-mapbox.ts`), and why the canvas stays held until it
      // does. Seeding it instead would mean resolving a center before the
      // map may mount, only to save one frame nobody ever sees.
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
      {hovered && (
        <EventPinPopover
          event={hovered.event}
          latitude={hovered.latitude}
          longitude={hovered.longitude}
        />
      )}
      {/* `followUserLocation={false}` stops Mapbox from moving the camera itself.
          Its `_updateCamera` method fits the accuracy circle at zoom 15 — a
          street corner — with its own curve and speed, and it fires BEFORE
          the `geolocate` event. So it would race the framing our handler asks
          for through the URL. The flag is read in `_onSuccess`, and it gates
          only that one call. `_updateMarker` is separate, so the blue dot,
          the accuracy circle, the permission flow, and the localized labels
          above all stay.
          ⚠ Mapbox's own .d.ts file claims this option still recenters. Its
          source code says otherwise. This was verified against the running
          control, rather than trusting either claim. */}
      <GeolocateControl followUserLocation={false} onGeolocate={geolocateToSearch} />
    </ReactMapGL>
  )
}
