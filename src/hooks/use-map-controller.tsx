import type { CameraSnapshot } from '@/config/store'
import type { Event, EventSlim, Region } from '@/types'

import { type ReactNode, createContext, useContext } from 'react'

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

export const MapControllerContext = createContext<MapController>(NOOP)

export const useMapController = () => useContext(MapControllerContext)

// Zoom/padding anchored to the event zoom, so navigating between levels reads as a
/** No map present (map=false): a controller of the same shape that does nothing. */
export function NoopMapControllerProvider({ children }: { children: ReactNode }) {
  return <MapControllerContext.Provider value={NOOP}>{children}</MapControllerContext.Provider>
}

/** Drives the real Mapbox camera. Must render inside <MapProvider>. */
