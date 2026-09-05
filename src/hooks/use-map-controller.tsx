// ⚠ **This module must stay free of `react-map-gl`. Nothing here will tell you if it stops.**
// The chain App → DrawerStack → the views imports this module EAGERLY.
// react-map-gl's `exports-mapbox.js` runs `const mapLib = import('mapbox-gl')` at MODULE scope.
// So a single import here re-arms the 485 KiB gz fetch that the compact card exists to avoid, on every page view of every embed.
//
// `pnpm size` CANNOT catch this.
// The budget walks the static graph, and a top-level `import()` inside that graph is a fetch the walker never counts.
// This claim was wrong in three docblocks before someone measured it in a browser.
// The real provider, and every react-map-gl edge with it, lives in `use-map-controller-real.tsx`, behind the lazy `FullInterface` boundary.

import type { CameraSnapshot } from '@/config/store'
import type { Event, EventSlim, Region } from '@/types'

import { type ReactNode, createContext, useContext } from 'react'

// This is the camera seam. See issue #30.
// Views call these functions UNCONDITIONALLY.
// When a map is present, the real provider drives Mapbox.
// When `map=false`, the no-op provider does nothing.
// So no view ever branches on the map flag, and this is the one place that knows whether a map exists.
// This centralizes the framing that used to live in `pages/{region,event,index}.tsx`.
export type MapController = {
  hasMap: boolean
  /** This frames a region. A venue moves to its point. Everything else fits its bounds. */
  frameRegion: (region: Region) => void
  /**
   * This frames an event: it selects its point and moves only as needed.
   * `isEntry` means the view is the session entry point, a deep link.
   * It forces framing even when the point is nominally "visible" at the boot-time world zoom.
   * It also frames online events, which otherwise never move.
   */
  frameEvent: (event: Event, opts?: { isEntry: boolean }) => void
  /** This emphasizes an event's pin without moving the camera, for a card hover. Null clears it. */
  highlightEvent: (event: EventSlim | null) => void
  /** This frames the search view. It fits a bbox, moves to a geocoded center, or resets. */
  frameSearch: (opts: {
    bbox?: [number, number, number, number]
    center?: [number, number]
  }) => void
  /**
   * This restores a remembered camera on a POP navigation.
   * It restores the exact viewport, center and zoom, selection, and boundary the user left, instead of re-deriving framing.
   */
  restore: (camera: CameraSnapshot) => void
  /** Reset to the world view. */
  reset: () => void
}

const NOOP: MapController = {
  hasMap: false,
  frameRegion: () => {},
  frameEvent: () => {},
  highlightEvent: () => {},
  frameSearch: () => {},
  restore: () => {},
  reset: () => {},
}

export const MapControllerContext = createContext<MapController>(NOOP)

export const useMapController = () => useContext(MapControllerContext)

/** No map is present, `map=false`. This is a controller of the same shape that does nothing. */
export function NoopMapControllerProvider({ children }: { children: ReactNode }) {
  return <MapControllerContext.Provider value={NOOP}>{children}</MapControllerContext.Provider>
}
