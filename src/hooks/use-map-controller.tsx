// ⚠ **This module must stay free of `react-map-gl`, and nothing here will tell you if it stops.**
// It is imported EAGERLY (App → DrawerStack → the views), and react-map-gl's `exports-mapbox.js`
// runs `const mapLib = import('mapbox-gl')` at MODULE scope — so a single import here re-arms the
// 485 KiB gz fetch that the compact card exists to avoid, on every page view of every embed.
//
// `pnpm size` CANNOT catch it: the budget walks the static graph, and a top-level `import()`
// inside that graph is a fetch the walker never counts. This claim was wrong in three docblocks
// before it was measured in a browser. The real provider, and every react-map-gl edge with it,
// lives in `use-map-controller-real.tsx` behind the lazy `FullInterface` boundary.

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

/** No map present (map=false): a controller of the same shape that does nothing. */
export function NoopMapControllerProvider({ children }: { children: ReactNode }) {
  return <MapControllerContext.Provider value={NOOP}>{children}</MapControllerContext.Provider>
}
