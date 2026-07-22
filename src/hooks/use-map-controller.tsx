import type { CameraSnapshot } from '@/config/store'
import type { Event, EventSlim, Region } from '@/types'

import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react'
import { bboxPolygon } from '@turf/bbox-polygon'

import { useMapbox, usePaddingState } from '@/hooks/use-mapbox'
import { useViewState } from '@/config/store'
import { useBreakpoint } from '@/config/responsive'
import { eventFrameZoom } from '@/lib/camera'
import { isOnline } from '@/lib/shape'

// The camera seam (issue #30). Views call these *unconditionally*; when a map is
// present the real provider drives Mapbox, and when map=false the no-op provider
// does nothing — so no view ever branches on the map flag, and this is the one
// place that knows whether a map exists. Centralizes the framing that used to live
// in pages/{region,event,index}.tsx.
export type MapController = {
  hasMap: boolean
  /** Frame a region: a venue moves to its point, everything else fits its bounds. */
  frameRegion: (region: Region) => void
  /**
   * Frame an event: select its point and move only as needed. `isEntry` (the view is
   * the session entry point — a deep link) forces framing even when the point is
   * nominally "visible" at the boot-time world zoom, and frames online events (which
   * otherwise never move).
   */
  frameEvent: (event: Event, opts?: { isEntry: boolean }) => void
  /** Emphasize an event's pin without moving the camera (card hover); null clears it. */
  highlightEvent: (event: EventSlim | null) => void
  /** Frame the search view: fit a bbox, move to a geocoded centre, or reset. */
  frameSearch: (opts: {
    bbox?: [number, number, number, number]
    center?: [number, number]
  }) => void
  /**
   * Restore a remembered camera on a POP navigation — the exact viewport (centre +
   * zoom), selection, and boundary the user left, rather than re-deriving framing.
   */
  restore: (camera: CameraSnapshot) => void
  /** Reset to the world view. */
  reset: () => void
  /** Clear the selected point + region boundary. */
  clearSelection: () => void
}

const NOOP: MapController = {
  hasMap: false,
  frameRegion: () => {},
  frameEvent: () => {},
  highlightEvent: () => {},
  frameSearch: () => {},
  restore: () => {},
  reset: () => {},
  clearSelection: () => {},
}

const MapControllerContext = createContext<MapController>(NOOP)

export const useMapController = () => useContext(MapControllerContext)

// The fixed left-drawer footprint (matches --sy-drawer-w in the Drawer atom) and
// the mobile peek height, fed to map padding directly — so the camera/controls
// aren't occluded, without ever DOM-measuring the panel.
const LEFT_DRAWER_PX = 352
const MOBILE_PEEK_PX = 128
const MAP_MARGIN = 20

// Zoom/padding anchored to the event zoom, so navigating between levels reads as a
// consistent zoom-in: an event frames at EVENT_ZOOM; a region fits no closer than
// REGION_MAX_ZOOM (2 levels wider, so clicking its event is always a zoom-in, never
// a jarring zoom-out); REGION_FIT_PADDING keeps edge events off the map border.
const EVENT_ZOOM = 15
const REGION_MAX_ZOOM = 13
const REGION_FIT_PADDING = 48
// An online event has only an approximate location; frame it wide (city/area level)
// when a deep link makes it the session entry point.
const ONLINE_ZOOM = 7

// The map point an event emphasizes: its stored coordinates, tagged `approximate`
// for online events (softer area sprite + a wider zoom). Null when the event has
// no coordinates — nothing to frame or highlight. Shared so frameEvent (commits it
// to `selection` + moves the camera) and highlightEvent (sets `hover` only) derive
// the point identically.
const eventPoint = (event: Pick<EventSlim, 'address' | 'eventType'>) => {
  const { latitude, longitude } = event.address ?? {}

  if (latitude == null || longitude == null) return null

  return { latitude, longitude, approximate: isOnline(event) }
}

/** No map present (map=false): a controller of the same shape that does nothing. */
export function NoopMapControllerProvider({ children }: { children: ReactNode }) {
  return <MapControllerContext.Provider value={NOOP}>{children}</MapControllerContext.Provider>
}

/** Drives the real Mapbox camera. Must render inside <MapProvider>. */
export function RealMapControllerProvider({ children }: { children: ReactNode }) {
  const { mapbox, moveMap, fitBounds, isPointVisible } = useMapbox()
  const setPadding = usePaddingState((s) => s.setPadding)
  const setSelection = useViewState((s) => s.setSelection)
  const setHover = useViewState((s) => s.setHover)
  const setBoundary = useViewState((s) => s.setBoundary)
  const { isMd } = useBreakpoint('md')

  // Keep the drawer's known footprint out of the usable camera area.
  useEffect(() => {
    setPadding({
      left: MAP_MARGIN + (isMd ? LEFT_DRAWER_PX : 0),
      right: MAP_MARGIN,
      top: MAP_MARGIN,
      bottom: MAP_MARGIN + (isMd ? 0 : MOBILE_PEEK_PX),
    })
  }, [isMd, setPadding])

  const controller = useMemo<MapController>(
    () => ({
      hasMap: true,
      frameRegion(region) {
        if (region.level === 'center') {
          setBoundary(undefined)
          if (region.center) moveMap({ center: region.center, zoom: REGION_MAX_ZOOM })
        } else if (region.bounds) {
          setBoundary(bboxPolygon(region.bounds))
          // Cap the fit + pad the edges: a single-/tight-event region can't zoom past
          // REGION_MAX_ZOOM (no-op on a large region that fits wider), and events keep
          // breathing room from the border.
          fitBounds(region.bounds, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        } else {
          setBoundary(undefined)
        }
      },
      frameEvent(event, opts) {
        const point = eventPoint(event)

        if (!point) return

        setSelection(point)
        // Move only as needed. `atDetailZoom` reads the LIVE map zoom (not the moveEnd-
        // lagged store) so a genuine pin click at a detail zoom keeps its zoom, while a
        // deep link / wide-view / off-screen click still eases in.
        const zoom = eventFrameZoom({
          approximate: point.approximate,
          visible: isPointVisible(point.longitude, point.latitude),
          atDetailZoom: (mapbox?.getZoom() ?? 0) >= REGION_MAX_ZOOM,
          isEntry: opts?.isEntry ?? false,
          eventZoom: EVENT_ZOOM,
          onlineZoom: ONLINE_ZOOM,
        })

        if (zoom != null) moveMap({ center: [point.longitude, point.latitude], zoom })
      },
      highlightEvent(event) {
        setHover(event ? eventPoint(event) : null)
      },
      frameSearch({ bbox, center }) {
        setBoundary(undefined)
        if (bbox) fitBounds(bbox, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        else if (center) moveMap({ center: { lng: center[0], lat: center[1] }, zoom: EVENT_ZOOM })
        else moveMap({ zoom: 0 })
      },
      restore(camera) {
        setSelection(camera.selection ?? null)
        setBoundary(camera.boundary)
        moveMap({ center: [camera.longitude, camera.latitude], zoom: camera.zoom })
      },
      reset() {
        setBoundary(undefined)
        moveMap({ zoom: 0 })
      },
      clearSelection() {
        setSelection(null)
        setBoundary(undefined)
      },
    }),
    [mapbox, moveMap, fitBounds, isPointVisible, setSelection, setHover, setBoundary],
  )

  return (
    <MapControllerContext.Provider value={controller}>{children}</MapControllerContext.Provider>
  )
}
