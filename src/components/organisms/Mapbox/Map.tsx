import type { FeatureCollection, Geometry } from 'geojson'
import type { GeoJSONSource } from 'mapbox-gl'
import type { Geojson } from '@/types'
import type { DisplayableEvent } from '@/hooks/use-event-display'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMapGL, {
  GeolocateControl,
  Layer,
  MapMouseEvent,
  Popup,
  Source,
} from 'react-map-gl/mapbox'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { CalendarDays } from 'lucide-react'

import {
  vagueDotLayer,
  vaguePinLayer,
  vagueRingLayer,
  clusterLayer,
  selectedPointLayer,
  unclusteredPointLayer,
  selectedAreaLayer,
  hoveredPointLayer,
  hoveredAreaLayer,
  boundsLayer,
  INTERACTIVE_LAYER_IDS,
  RING_ZOOM,
  LAYER_IDS,
  type SymbolLayerProps,
} from './layers'
import { MapControls } from './MapControls'
import { mapWorldview, syncMapLanguage } from './map-language'
import { loadMapLib } from './map-lib'
import { markerColors, registerMarkerImages } from './markers'
import { useLocate } from './use-locate'
import { pinPopoverPlacement, type PopoverAnchor } from './pin-popover'

import { Button } from '@/components/atoms/Button'
import { Modal, ModalClose, ModalContent, ModalFooter } from '@/components/atoms/Modal'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useCameraSettled, useCameraTarget, useViewState, type MapPoint } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useGeolocateToSearch } from '@/hooks/use-geolocate'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import { eventTitlesQuery, geojsonQuery } from '@/config/api'
import { useHasRealPointer } from '@/config/responsive'
import { useBrandPalette } from '@/config/theme/brand-palette'
import { worldMinZoom } from '@/lib/camera'
import {
  hasActiveFilters,
  hasApproximatePlace,
  matchesFilters,
  safePath,
  todayISO,
} from '@/lib/shape'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import { useMapbox } from '@/hooks/use-mapbox'
import { pointCoordinates } from '@/lib/geo'
import { LOCATE_POSITION_OPTIONS } from '@/lib/geolocation'

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

type GeoFeature = Geojson['features'][number]

const hasPoint = (
  feature: GeoFeature,
): feature is GeoFeature & { geometry: NonNullable<GeoFeature['geometry']> } =>
  feature.geometry !== null

// Mapbox renders geometry and injects its own cluster properties. The click
// handler needs only `id` and `webPath`. This strips every other feature
// property before handing the collection to the vector source. So the map
// holds a lean geometry source. The agnostic feed's card fields — address,
// schedule, languages, region — never reach Mapbox. This confirms the spike
// finding: map-source leanness is a client-side trim, not a reason for a
// separate lean feed query.
//
// An online class has no point. Mapbox skips a null geometry anyway, clustering included, and its
// types refuse one, so it is dropped here.
const toMapSource = (features: Geojson['features']): FeatureCollection<Geometry> => ({
  type: 'FeatureCollection',
  features: features.filter(hasPoint).map((feature) => {
    const coordinates = pointCoordinates(feature.geometry)

    return {
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        id: feature.properties.id,
        webPath: feature.properties.webPath ?? null,
        vague: hasApproximatePlace(feature.properties),
        // What the ring's radius divides by, since an expression cannot read a point's latitude.
        cosLat: coordinates ? Math.cos((coordinates[1] * Math.PI) / 180) : null,
      },
    }
  }),
})

const DEBUG_BOUNDARY = false
const DEBUG_PADDING = false

// This renders a single emphasized point — the committed `selection` or the
// transient card `hover` — as its own GeoJSON source. This way, the sprite
// shows even when the base pin sits inside a cluster. `MapPoint.approximate`
// picks the softer area sprite over the pin sprite, and `vague` hands the two
// over at `RING_ZOOM`, as the base layers do.
function PointSource({
  id,
  point,
  pointLayer,
  areaLayer,
}: {
  id: string
  point: MapPoint
  pointLayer: SymbolLayerProps
  areaLayer: SymbolLayerProps
}) {
  return (
    <Source
      data={{
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
            properties: {},
          },
        ],
      }}
      id={id}
      type="geojson"
    >
      {point.vague ? (
        <>
          <Layer {...pointLayer} maxzoom={RING_ZOOM} />
          <Layer {...areaLayer} minzoom={RING_ZOOM} />
        </>
      ) : (
        <Layer {...(point.approximate ? areaLayer : pointLayer)} />
      )}
    </Source>
  )
}

// This is the card shown inside the hover popover: the class name, then its
// timing, with the recurrence (for example, "Every Thursday") stacked above its
// start time. It reads the list card's own `card` view, stacked where the card
// joins with a `·`, so the two never drift apart (#72).
// The name comes from the per-locale titles sliver, since the feed carries none. It is read
// CACHE-ONLY, like the drawer's fallback chrome: a live observer here would make one mouse-move
// over a pin fetch every title in the locale. Until a view that needs them has loaded them, the
// card shows the timing alone.
function EventPinCard({ event }: { event: DisplayableEvent & { id: number } }) {
  const { locale } = useLocale()
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: false })
  const title = titles?.get(event.id)
  const { primary, time } = useEventDisplay(event).surfaces.card.when

  if (!title && !primary) return null

  return (
    <div className="flex max-w-60 flex-col gap-0.5 rounded-lg border border-divider bg-background px-3 py-2 text-foreground shadow-md">
      {title && <span className="line-clamp-2 text-sm font-semibold">{title}</span>}
      {primary && (
        <span className="flex items-center gap-1.5 text-xs text-gray-11">
          <CalendarDays className="shrink-0" size={14} />
          <span>
            {primary}
            {time && ` · ${time}`}
          </span>
        </span>
      )}
    </div>
  )
}

// This is a non-interactive hover popover over an individual event pin, on
// devices with a real pointer only (see `useHasRealPointer` where it is wired).
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
  anchor,
  offset,
}: {
  event: DisplayableEvent & { id: number }
  longitude: number
  latitude: number
  anchor: PopoverAnchor
  offset: [number, number]
}) {
  return (
    <Popup
      anchor={anchor}
      className="event-pin-popover"
      closeButton={false}
      closeOnClick={false}
      focusAfterOpen={false}
      latitude={latitude}
      longitude={longitude}
      offset={offset}
    >
      <EventPinCard event={event} />
    </Popup>
  )
}

/**
 * @param cooperative Leave one-finger and wheel scrolling to the host page, moving the map only on
 *   two fingers or Ctrl/⌘ + wheel (`gestures=cooperative`, the inline map only).
 * @param settings Draw the settings menu in the control column (`MapControls`).
 * @param filterMenus The filter buttons, shown beside the map's own while `useMapControls` says
 *   so. The view renders them, since they read the URL and the geocoder.
 */
export function Mapbox({
  cooperative = false,
  settings = true,
  filterMenus,
}: { cooperative?: boolean; settings?: boolean; filterMenus?: ReactNode } = {}) {
  let navigate = useAtlasNavigate()
  const { mapbox, padding, moveMap } = useMapbox()
  // ⚠ Not `zoom`, `latitude` or `longitude`: the map is uncontrolled, so nothing here draws from
  // them, and selecting them re-renders every source and layer each time the camera stops.
  const { setViewState, selection, hover, boundary } = useViewState(
    useShallow((s) => ({
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

  // The labels follow the widget's locale through a switch, not only at construction.
  useEffect(() => {
    syncMapLanguage(mapbox, locale)
  }, [mapbox, locale])

  // These are the active filters (stable identity — this is the hot render
  // path). They apply to the feed below, so the pins and cluster counts
  // match the list.
  const filters = useEventFilters()
  // This is the region cut (self plus descendants), resolved from the
  // cache-once region tree. It stays undefined unless a region is selected,
  // so pan and zoom never rebuild it.
  const matchesRegion = useRegionMatcher(filters.region)

  const { data } = useQuery(geojsonQuery())

  // "Find my location" opens the results centered on the visitor, rather
  // than just moving the camera. See the hook, and the `followUserLocation`
  // note on the control below. This component gives the hook the feed,
  // since the feed is already available here. The hook frames around the
  // nearest classes in it.
  const geolocateToSearch = useGeolocateToSearch(data)
  const locate = useLocate(geolocateToSearch)

  // The tenant's resolved palette, as `BrandTheme` painted the UI from it.
  //
  // ⚠ Each result is memoised because react-map-gl's `Layer` force-renders on
  // every `styledata` event, so a factory called in the JSX below would rebuild
  // a ramp per tile batch. `docs/rules/mapbox.md` states the rule.
  //
  // The pins, bubbles and count take the light-mode palette in both modes
  // (`MARKER_MODE`), so a light/dark switch repaints only what is mode-aware:
  // the pins' edge, the vague ring and dot's edge, and the debug bounds.
  const palette = useBrandPalette()
  const colors = useMemo(() => markerColors(palette), [palette])
  const clusters = useMemo(() => clusterLayer(palette), [palette])
  const bounds = useMemo(() => boundsLayer(palette, theme), [palette, theme])
  const vagueRing = useMemo(() => vagueRingLayer(palette, theme), [palette, theme])
  const vagueDot = useMemo(() => vagueDotLayer(palette, theme), [palette, theme])

  // This supplies the app's own pin and cluster images. `markers.ts` owns
  // the why, the theme-switch handling, and the in-place repaint. There is
  // one subscription per map instance and set of colors.
  useEffect(() => {
    if (mapbox) return registerMarkerImages(mapbox, colors, theme)
  }, [mapbox, colors, theme])

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
  const revealTimer = useRef<number>(undefined)

  // The flag describes THIS map instance, so it dies with the instance. The
  // inline embed swaps its own map for the expanded one and back. A stale
  // `true` would then meet the next map at the world view, with neither the
  // curtain nor the arrival jump. See `forgetSettled`.
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
  // Zooming out stops where one world fills the map's width. The map keeps Mapbox's world copies,
  // so it still pans across the Pacific, and this stops a wide screen from showing the world two
  // or three times over.
  const [minZoom, setMinZoom] = useState(0)
  // A touch device gets no hover at all, so one tap opens the class. iOS sends a fake mouse move
  // before a tap, and when that reveals content Safari treats the tap as a hover and doesn't click.
  const hasRealPointer = useHasRealPointer()

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
    const coordinates = feature && pointCoordinates(feature.geometry)

    if (!feature || !coordinates) return undefined

    const [longitude, latitude] = coordinates
    const container = mapbox?.getContainer()
    const placement = pinPopoverPlacement(
      mapbox?.project([longitude, latitude]) ?? { x: 0, y: 0 },
      { width: container?.clientWidth ?? 0, height: container?.clientHeight ?? 0 },
      {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        ...mapbox?.getPadding(),
      },
    )

    return { event: feature.properties, longitude, latitude, ...placement }
  }, [hoveredId, data, mapbox])

  const selectFeature = useCallback(
    (evt: MapMouseEvent) => {
      if (!evt.features || !evt.features.length || !mapbox) return
      const feature = evt.features[0]

      // This dismisses the transient hover popover on any pin or cluster
      // click — a desktop click-through, or tap-to-open on touch — so it
      // cannot linger over the pin.
      setHoveredId(null)

      if (feature.layer?.id === LAYER_IDS.cluster) {
        const source = mapbox.getSource('events') as GeoJSONSource

        source.getClusterExpansionZoom(feature.properties?.cluster_id, (err, zoom) => {
          if (err || !mapbox) return console.error(err)

          moveMap({
            center: pointCoordinates(feature.geometry),
            zoom: (zoom || mapbox.getZoom()) + 1,
            duration: 500,
          })
        })
      } else {
        // Every other feature `interactiveLayerIds` can deliver stands for one class.
        navigate(safePath(feature.properties?.webPath) ?? `/${feature.properties?.id}`)
      }
    },
    [navigate, mapbox, moveMap],
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
        feature && feature.layer?.id !== LAYER_IDS.cluster ? Number(feature.properties?.id) : NaN

      setHoveredId(Number.isFinite(pinId) ? pinId : null)
    },
    [mapbox],
  )

  // Map padding — keeping the drawer's footprint out of the camera — is
  // owned by the MapController now. It is set from the known drawer width
  // per breakpoint, not by measuring the panel in the DOM or listening for
  // a window scroll or resize. See hooks/use-map-controller.tsx.

  return (
    <>
      <ReactMapGL
        reuseMaps
        attributionControl={false}
        cooperativeGestures={cooperative}
        // Symbols — pins, clusters, the selection and hover highlights —
        // appear instantly instead of Mapbox's default ~300ms icon fade-in.
        // The card-hover highlight must track the pointer immediately.
        // `fadeDuration` is a global map option, with no per-layer control, so
        // this also removes the fade on the base pins and clusters and on the
        // selection pin.
        fadeDuration={0}
        id="mapbox"
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        // The first language only: react-map-gl never updates `language` after construction, so
        // `syncMapLanguage` keeps it current from then on.
        language={locale}
        logoPosition="bottom-right"
        mapLib={loadMapLib()}
        mapStyle={MAP_STYLES[theme]}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
        minZoom={minZoom}
        style={canvasStyle}
        worldview={mapWorldview(languageCode)}
        onClick={selectFeature}
        // This is the backstop on the reveal. A route that never frames the
        // camera — CalendarView is the one that deliberately does not — must
        // not leave the map hidden for the whole session.
        onLoad={(event) => {
          armReveal()
          setMinZoom(worldMinZoom(event.target.getContainer().clientWidth))
        }}
        onMouseMove={hasRealPointer ? hoverOnFeature : undefined}
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
        onMoveEnd={(evt) => {
          setViewState(evt.viewState)
          useCameraTarget.setState({ target: null })
        }}
        onResize={(event) => setMinZoom(worldMinZoom(event.target.getContainer().clientWidth))}
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
            {/* First, so a ring lies under every pin and cluster. */}
            <Layer {...vagueRing} />
            <Layer {...clusters} />
            <Layer {...unclusteredPointLayer} />
            <Layer {...vaguePinLayer} />
            <Layer {...vagueDot} />
          </Source>
        )}
        {DEBUG_BOUNDARY && boundary && (
          <Source data={boundary} id="bounds" type="geojson">
            <Layer {...bounds} />
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
            anchor={hovered.anchor}
            event={hovered.event}
            latitude={hovered.latitude}
            longitude={hovered.longitude}
            offset={hovered.offset}
          />
        )}
        {/* `followUserLocation={false}` stops Mapbox from moving the camera itself.
            Its `_updateCamera` method fits the accuracy circle at zoom 15 — a
            street corner — with its own curve and speed, and it fires BEFORE
            the `geolocate` event. So it would race the framing our handler asks
            for through the URL. The flag is read in `_onSuccess`, and it gates
            only that one call. `_updateMarker` is separate, so the blue dot,
            the accuracy circle and the permission flow all stay.
            ⚠ Mapbox's own .d.ts file claims this option still recenters. Its
            source code says otherwise. This was verified against the running
            control, rather than trusting either claim. */}
        <GeolocateControl
          ref={locate.geolocateRef}
          followUserLocation={false}
          positionOptions={LOCATE_POSITION_OPTIONS}
          showButton={false}
          onError={locate.onError}
          onGeolocate={locate.onGeolocate}
        />
        {/* Carries the attribution `attributionControl` above declines, in the top right, the
            one corner no drawer covers. Why that corner, and why the wordmark sits apart in the
            bottom right: `docs/rules/mapbox.md`, "The wordmark and the attribution" (#330). */}
        <MapControls
          filterMenus={filterMenus}
          locate={locate.state}
          locateRef={locate.buttonRef}
          settings={settings}
          onLocate={locate.locate}
        />
      </ReactMapGL>
      <Modal open={locate.failed} onOpenChange={locate.setFailed}>
        <ModalContent
          closeLabel={t('common.chrome.close')}
          description={t('common.map.location_failed')}
          title={t('common.map.location_not_available')}
          onCloseAutoFocus={(event) => {
            // Radix returns focus to a `Dialog.Trigger`, and the locate control is not one.
            event.preventDefault()
            locate.buttonRef.current?.focus()
          }}
        >
          <ModalFooter>
            <ModalClose>
              <Button color="primary" variant="flat">
                {t('common.chrome.close')}
              </Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
