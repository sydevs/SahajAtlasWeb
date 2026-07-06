import type { Event, Region } from '@/types'

import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react'
import { bboxPolygon } from '@turf/bbox-polygon'

import { useMapbox, usePaddingState } from '@/hooks/use-mapbox'
import { useViewState } from '@/config/store'
import { useBreakpoint } from '@/config/responsive'
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
  /** Frame an event: select its point and move to it (online events zoom out). */
  frameEvent: (event: Event) => void
  /** Frame the search view: fit a bbox, move to a geocoded centre, or reset. */
  frameSearch: (opts: {
    bbox?: [number, number, number, number]
    center?: [number, number]
  }) => void
  /** Reset to the world view. */
  reset: () => void
  /** Clear the selected point + region boundary. */
  clearSelection: () => void
}

const NOOP: MapController = {
  hasMap: false,
  frameRegion: () => {},
  frameEvent: () => {},
  frameSearch: () => {},
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

/** No map present (map=false): a controller of the same shape that does nothing. */
export function NoopMapControllerProvider({ children }: { children: ReactNode }) {
  return <MapControllerContext.Provider value={NOOP}>{children}</MapControllerContext.Provider>
}

/** Drives the real Mapbox camera. Must render inside <MapProvider>. */
export function RealMapControllerProvider({ children }: { children: ReactNode }) {
  const { moveMap, fitBounds } = useMapbox()
  const setPadding = usePaddingState((s) => s.setPadding)
  const setSelection = useViewState((s) => s.setSelection)
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
          if (region.center) moveMap({ center: region.center, zoom: 13 })
        } else if (region.bounds) {
          setBoundary(bboxPolygon(region.bounds))
          fitBounds(region.bounds)
        } else {
          setBoundary(undefined)
        }
      },
      frameEvent(event) {
        const { latitude, longitude } = event.address ?? {}
        const online = isOnline(event)

        if (latitude != null && longitude != null) {
          setSelection({ latitude, longitude, approximate: online })
          moveMap({ center: [longitude, latitude], zoom: online ? 7 : 15 })
        }
      },
      frameSearch({ bbox, center }) {
        setBoundary(undefined)
        if (bbox) fitBounds(bbox)
        else if (center) moveMap({ center: { lng: center[0], lat: center[1] }, zoom: 15 })
        else moveMap({ zoom: 0 })
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
    [moveMap, fitBounds, setSelection, setBoundary],
  )

  return (
    <MapControllerContext.Provider value={controller}>{children}</MapControllerContext.Provider>
  )
}
